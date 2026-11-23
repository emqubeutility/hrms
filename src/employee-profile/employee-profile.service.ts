import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assignWeeklyOff } from '../attendance-setup/weekly-off.util';
import { AuditService } from '../common/services/audit.service';
import { PiiService } from '../common/services/pii.service';
import { UserType } from '../common/constants/user-types';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  ADDRESS_LEVELS,
  COUNTRIES,
  CURRENCY,
  CountryCode,
  CustomFieldDefLike,
  CUSTOM_FIELD_OPTIONS_REQUIRED,
  Lookups,
  SalaryComponentDef,
  componentCode,
  validateComponentAmounts,
  SECTION_KEYS,
  SectionDef,
  buildSections,
  parameterTypesUsed,
  checkCustomValue,
  codeFromLabel,
  fieldsFor,
  resolveSection,
  validateSection,
} from './profile-schema';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './dto/custom-field.dto';
import { ProfileRulesService } from './profile-rules.service';
import { isFixedOvertime } from '../overtime/overtime-rules';

const HR_ROLES = [UserType.SystemAdmin, UserType.HRAdmin];

type SectionData = Record<string, unknown>;

@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiService,
    private readonly audit: AuditService,
    private readonly rules: ProfileRulesService,
  ) {}

  private isHr(user: CurrentUserPayload): boolean {
    return HR_ROLES.includes(user.userTypeId);
  }

  /** Employee country drives address, bank, statutory, documents and currency (D-023). */
  private async countryOf(employeeId: number): Promise<CountryCode> {
    const row = await this.prisma.employeeProfileSection.findUnique({
      where: { employeeId_sectionKey: { employeeId, sectionKey: 'organization' } },
    });
    const c = (row?.data as SectionData | null)?.legalEntityCountry;
    return typeof c === 'string' && (COUNTRIES as readonly string[]).includes(c) ? (c as CountryCode) : 'IN';
  }

  private async loadEmployee(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { profile: { select: { name: true, middleName: true, lastName: true, photoFileId: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  /** Mask a stored sensitive value to its last 4 characters for responses. */
  private maskStored(stored: unknown): unknown {
    if (typeof stored !== 'string' || stored === '') return stored ?? '';
    const plain = this.pii.decrypt(stored);
    return plain ? this.pii.mask(plain) : '';
  }

  /** Stored section data → response values (sensitive fields masked). */
  private presentValues(section: SectionDef, country: CountryCode, data: SectionData): SectionData {
    const out: SectionData = {};
    const sensitive = new Set(fieldsFor(section, country).filter((f) => f.sensitive).map((f) => f.key));
    for (const [k, v] of Object.entries(data)) {
      out[k] = sensitive.has(k) ? this.maskStored(v) : v;
    }
    return out;
  }

  /** Option lists that come from master tables (Languages master for "Languages known"). */
  /**
   * Option lists from master data: Languages master, the Nationality parameter catalog,
   * and active employees for manager pickers (excluding the employee being edited).
   */
  private async lookups(excludeEmployeeId?: number, branchAccess?: number[] | null, country?: CountryCode): Promise<Lookups> {
    const [languages, nationalities, noticeReasons, departments, employeeTypes, relationships, branches, employees, shifts, genericParams, weeklyOffs, overtimeConfigs] = await Promise.all([
      this.prisma.language.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: 'Nationality' } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true },
      }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: 'Notice Reason' } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true },
      }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: 'Department' } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true },
      }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: 'Employee Type' } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true },
      }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: 'Emergency Relationship' } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true },
      }),
      this.prisma.branch.findMany({
        where: { isActive: true, ...(branchAccess ? { id: { in: branchAccess } } : {}) },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.employee.findMany({
        where: { isActive: true, ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}) },
        select: { id: true, employeeCode: true, profile: { select: { name: true, lastName: true } } },
        orderBy: { profile: { name: 'asc' } },
        take: 1000,
      }),
      this.prisma.shift.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.parameter.findMany({
        where: { isVisible: true, parameterType: { name: { in: parameterTypesUsed() } } },
        orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }],
        select: { text: true, parameterType: { select: { name: true } } },
      }),
      this.prisma.weeklyOffTemplate.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.overtimeConfiguration.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const parameters: Record<string, string[]> = {};
    for (const p of genericParams) (parameters[p.parameterType.name] ??= []).push(p.text);
    return {
      languages: languages.map((l) => l.name),
      nationalities: nationalities.map((n) => n.text),
      noticeReasons: noticeReasons.map((n) => n.text),
      departments: departments.map((d) => d.text),
      employeeTypes: employeeTypes.map((d) => d.text),
      relationships: relationships.map((d) => d.text),
      parameters,
      weeklyOffs: weeklyOffs.map((w) => w.name),
      shifts: shifts.map((s) => ({ value: String(s.id), label: s.name })),
      overtimeConfigurations: overtimeConfigs.map((c) => ({ value: String(c.id), label: c.name })),
      branches: branches.map((b) => ({ value: String(b.id), label: b.name })),
      employees: employees.map((e) => ({
        value: String(e.id),
        label: `${[e.profile.name, e.profile.lastName].filter(Boolean).join(' ')} (${e.employeeCode})`,
      })),
    };
  }

  /** Active templates for a country (plus one already chosen, even if since deactivated). */
  private async salaryTemplatesFor(country: CountryCode, includeId?: number) {
    const rows = await this.prisma.salaryTemplate.findMany({
      where: {
        OR: [
          { isActive: true, countryCode: { in: ['ALL', country] } },
          ...(includeId ? [{ id: includeId }] : []),
        ],
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((t) => ({ id: t.id, name: t.name, countryCode: t.countryCode, isActive: t.isActive, components: t.components as unknown as SalaryComponentDef[] }));
  }

  private async visibleSections(user: CurrentUserPayload, country: CountryCode, lookups: Lookups): Promise<SectionDef[]> {
    const rules = await this.rules.rulesFor(country);
    return buildSections(country, lookups, rules).filter((s) => !s.hrOnly || this.isHr(user));
  }

  /* -------------------------------------------------------------- read */

  async getProfile(employeeId: number, user: CurrentUserPayload) {
    const employee = await this.loadEmployee(employeeId);
    const isSelf = employee.profileId === user.profileId;
    if (!this.isHr(user) && !isSelf) throw new ForbiddenException('You can only view your own profile');

    const country = await this.countryOf(employeeId);
    const sections = await this.visibleSections(user, country, await this.lookups(employeeId, user.branchAccess, country));
    const stored = await this.prisma.employeeProfileSection.findMany({ where: { employeeId } });
    const byKey = new Map(stored.map((s) => [s.sectionKey, (s.data ?? {}) as SectionData]));

    const values: Record<string, SectionData> = {};
    for (const s of sections) {
      const data = byKey.get(s.key) ?? {};
      values[s.key] = this.presentValues(s, country, data);
    }

    const defs = await this.prisma.customFieldDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ tabKey: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }],
    });
    const applicableDefs = defs.filter((d) => d.countryCode === 'ALL' || d.countryCode === country);
    const customValues = await this.prisma.customFieldValue.findMany({
      where: { employeeId, definitionId: { in: applicableDefs.map((d) => d.id) } },
      include: { definition: { select: { code: true, isSensitive: true } } },
    });
    const custom: Record<string, unknown> = {};
    for (const cv of customValues) {
      custom[cv.definition.code] = cv.definition.isSensitive ? this.maskStored(cv.value) : cv.value;
    }

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: [employee.profile.name, employee.profile.middleName, employee.profile.lastName].filter(Boolean).join(' '),
        isActive: employee.isActive,
        hasPhoto: employee.profile.photoFileId !== null,
        country,
        currency: CURRENCY[country],
        addressLevels: ADDRESS_LEVELS[country],
      },
      canEdit: this.isHr(user),
      sections: sections.map((s) => resolveSection(s, country)),
      values,
      salaryTemplates: await this.salaryTemplatesFor(country, Number((byKey.get('compensation') ?? {}).salaryTemplateId) || undefined),
      customFields: applicableDefs.map((d) => ({
        code: d.code,
        label: d.label,
        tabKey: d.tabKey,
        sectionName: d.sectionName,
        fieldType: d.fieldType,
        options: (d.options as unknown as string[]) ?? [],
        isRequired: d.isRequired,
        isSensitive: d.isSensitive,
        placeholder: d.placeholder,
        helpText: d.helpText,
      })),
      custom,
    };
  }

  /* -------------------------------------------------------------- write */

  async saveSection(
    employeeId: number,
    sectionKey: string,
    body: { data: SectionData; custom?: Record<string, unknown> },
    user: CurrentUserPayload,
    ip: string,
  ) {
    if (!this.isHr(user)) throw new ForbiddenException('Only HR or System Admin can change profile sections');
    if (!(SECTION_KEYS as readonly string[]).includes(sectionKey)) throw new NotFoundException('Unknown profile section');
    await this.loadEmployee(employeeId);

    const current = await this.countryOf(employeeId);
    const submittedCountry = body.data?.legalEntityCountry;
    const country: CountryCode =
      sectionKey === 'organization' && typeof submittedCountry === 'string' && (COUNTRIES as readonly string[]).includes(submittedCountry)
        ? (submittedCountry as CountryCode)
        : current;

    const section = buildSections(country, await this.lookups(employeeId, user.branchAccess, country), await this.rules.rulesFor(country)).find((s) => s.key === sectionKey);
    if (!section) throw new NotFoundException('This section is not used for the employee\'s country');
    const existingRow = await this.prisma.employeeProfileSection.findUnique({
      where: { employeeId_sectionKey: { employeeId, sectionKey } },
    });
    const existing = (existingRow?.data ?? {}) as SectionData;

    // 1) Plain and repeatable fields
    const result = validateSection(section, country, body.data ?? {});
    const errors = [...result.errors];

    // Compensation: amounts must match the chosen salary template.
    errors.push(...(await this.checkSalary(section, result, body.data ?? {}, country, existing.salaryTemplateId)));
    errors.push(...(await this.checkOvertime(section, result, existing.otConfiguration)));

    // 2) Custom fields for this tab and country
    const defs = (await this.prisma.customFieldDefinition.findMany({ where: { isActive: true, tabKey: sectionKey } }))
      .filter((d) => d.countryCode === 'ALL' || d.countryCode === country);
    const customInput = body.custom ?? {};
    const existingCustom = await this.prisma.customFieldValue.findMany({
      where: { employeeId, definitionId: { in: defs.map((d) => d.id) } },
      include: { definition: { select: { code: true } } },
    });
    const existingCustomCodes = new Set(existingCustom.map((cv) => cv.definition.code));
    const defByCode = new Map(defs.map((d) => [d.code, d]));
    errors.push(...this.checkCustom(defs, customInput, existingCustomCodes));

    if (errors.length) throw new BadRequestException({ message: 'Validation failed', errors });

    // 3) Store: sensitive fields are encrypted (D-015); a masked value keeps the stored ciphertext.
    const sensitive = new Set(fieldsFor(section, country).filter((f) => f.sensitive).map((f) => f.key));
    const toStore: SectionData = {};
    for (const [k, v] of Object.entries(result.values)) {
      if (sensitive.has(k)) {
        const raw = String(v ?? '');
        if (raw.startsWith('*')) toStore[k] = existing[k] ?? null;
        else toStore[k] = raw ? this.pii.encrypt(raw) : null;
      } else {
        toStore[k] = v;
      }
    }
    for (const [k, v] of Object.entries(result.rows)) toStore[k] = v;

    await this.prisma.employeeProfileSection.upsert({
      where: { employeeId_sectionKey: { employeeId, sectionKey } },
      create: { employeeId, sectionKey, data: toStore as Prisma.InputJsonValue, updatedByProfileId: user.profileId },
      update: { data: toStore as Prisma.InputJsonValue, updatedByProfileId: user.profileId },
    });

    // Keep the employee's branch in step with the Organization section (drives branch-scoped access).
    if (sectionKey === 'organization' && 'branch' in result.values) {
      const raw = result.values.branch;
      await this.prisma.employee.update({ where: { id: employeeId }, data: { branchId: raw ? Number(raw) : null } });
    }

    // Keep the reporting manager column in step with the Employment section: manager and team screens,
    // leave approval and the dashboard all read employees.reportingToId.
    if (sectionKey === 'employment' && 'reportingManager' in result.values) {
      const raw = result.values.reportingManager;
      const managerId = raw ? Number(raw) : null;
      await this.prisma.employee.update({ where: { id: employeeId }, data: { reportingToId: managerId && managerId !== employeeId ? managerId : null } });
    }

    // Keep the weekly off assignment in step with the Attendance section (effective from today, earlier days keep their history).
    if (sectionKey === 'attendance' && 'weeklyOff' in result.values) {
      const name = result.values.weeklyOff;
      const template = name ? await this.prisma.weeklyOffTemplate.findUnique({ where: { name: String(name) }, select: { id: true } }) : null;
      const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      await this.prisma.$transaction((tx) => assignWeeklyOff(tx, employeeId, template?.id ?? null, today));
    }

    // Keep the employee's shift column in step with the Attendance section.
    if (sectionKey === 'attendance' && 'shift' in result.values) {
      const raw = result.values.shift;
      await this.prisma.employee.update({ where: { id: employeeId }, data: { shiftId: raw ? Number(raw) : null } });
    }

    // 4) Custom values (encrypted when the definition is sensitive)
    for (const [code, value] of Object.entries(customInput)) {
      const d = defByCode.get(code);
      if (!d) continue;
      if (value === '' || value === null || value === undefined) {
        await this.prisma.customFieldValue.deleteMany({ where: { employeeId, definitionId: d.id } });
        continue;
      }
      // A masked sensitive value means "unchanged": keep the stored ciphertext.
      if (d.isSensitive && typeof value === 'string' && value.startsWith('*')) continue;
      const stored = d.isSensitive ? this.pii.encrypt(String(value)) : value;
      await this.prisma.customFieldValue.upsert({
        where: { employeeId_definitionId: { employeeId, definitionId: d.id } },
        create: { employeeId, definitionId: d.id, value: stored as Prisma.InputJsonValue },
        update: { value: stored as Prisma.InputJsonValue },
      });
    }

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'employee_profile.section_saved',
      entityType: 'employee',
      entityId: String(employeeId),
      ipAddress: ip,
      // Field names only; values are personal data and are never written to the audit log.
      metadata: {
        section: sectionKey,
        fields: [...Object.keys(result.values), ...Object.keys(result.rows)],
        custom: Object.keys(customInput),
      },
    });

    return { section: sectionKey, values: this.presentValues(section, country, toStore) };
  }

  /* -------------------------------------------------------------- custom fields (D-023) */

  async listCustomFields() {
    const defs = await this.prisma.customFieldDefinition.findMany({ orderBy: [{ tabKey: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }] });
    return defs.map((d) => ({
      code: d.code,
      label: d.label,
      tabKey: d.tabKey,
      sectionName: d.sectionName,
      fieldType: d.fieldType,
      options: (d.options as unknown as string[]) ?? [],
      countryCode: d.countryCode,
      isRequired: d.isRequired,
      isSensitive: d.isSensitive,
      placeholder: d.placeholder,
      helpText: d.helpText,
      isActive: d.isActive,
    }));
  }

  async createCustomField(dto: CreateCustomFieldDto, user: CurrentUserPayload, ip: string) {
    if (!this.isSystemAdmin(user)) throw new ForbiddenException('Only System Admin can create custom fields');
    await this.assertCountryOrAll(dto.countryCode);
    const code = codeFromLabel(dto.label);
    if (!code || code === 'CUSTOM_') throw new BadRequestException('Label must contain letters or numbers');
    if (await this.prisma.customFieldDefinition.findUnique({ where: { code } })) {
      throw new ConflictException(`A custom field with code ${code} already exists`);
    }
    const needsOptions = CUSTOM_FIELD_OPTIONS_REQUIRED.includes(dto.fieldType as (typeof CUSTOM_FIELD_OPTIONS_REQUIRED)[number]);
    const options = needsOptions ? (dto.options ?? []).map((o) => o.trim()).filter(Boolean) : [];
    if (needsOptions && options.length === 0) throw new BadRequestException(`${dto.fieldType} needs at least one option`);
    const created = await this.prisma.customFieldDefinition.create({
      data: {
        code,
        label: dto.label.trim(),
        tabKey: dto.tabKey,
        sectionName: dto.sectionName.trim(),
        fieldType: dto.fieldType,
        options: options as unknown as Prisma.InputJsonValue,
        countryCode: dto.countryCode ?? 'ALL',
        isRequired: dto.isRequired ?? false,
        isSensitive: dto.isSensitive ?? false,
        placeholder: dto.placeholder ?? null,
        helpText: dto.helpText ?? null,
        createdByProfileId: user.profileId,
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'custom_field.created', entityType: 'custom_field', entityId: code, ipAddress: ip, metadata: { tabKey: dto.tabKey, fieldType: dto.fieldType } });
    return created;
  }

  async updateCustomField(code: string, dto: UpdateCustomFieldDto, user: CurrentUserPayload, ip: string) {
    if (!this.isSystemAdmin(user)) throw new ForbiddenException('Only System Admin can change custom fields');
    const existing = await this.prisma.customFieldDefinition.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException('Custom field not found');
    const updated = await this.prisma.customFieldDefinition.update({
      where: { code },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
        ...(dto.placeholder !== undefined ? { placeholder: dto.placeholder } : {}),
        ...(dto.helpText !== undefined ? { helpText: dto.helpText } : {}),
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'custom_field.updated', entityType: 'custom_field', entityId: code, ipAddress: ip, metadata: { changed: Object.keys(dto) } });
    return updated;
  }

  /** A custom field that already holds values is kept (deactivate it instead); an unused one is removed with its profile rules. */
  async deleteCustomField(code: string, user: CurrentUserPayload, ip: string) {
    if (!this.isSystemAdmin(user)) throw new ForbiddenException('Only System Admin can delete custom fields');
    const def = await this.prisma.customFieldDefinition.findUnique({ where: { code }, select: { id: true, label: true } });
    if (!def) throw new NotFoundException('Custom field not found');
    const used = await this.prisma.customFieldValue.count({ where: { definitionId: def.id } });
    if (used > 0) {
      throw new ConflictException(`"${def.label}" already holds a value for ${used} employee${used === 1 ? '' : 's'}, so it cannot be deleted. Deactivate it instead.`);
    }
    await this.prisma.$transaction([
      this.prisma.profileFieldRule.deleteMany({ where: { fieldKey: code } }),
      this.prisma.customFieldDefinition.delete({ where: { id: def.id } }),
    ]);
    await this.audit.log({ actorProfileId: user.profileId, action: 'custom_field.deleted', entityType: 'custom_field', entityId: code, ipAddress: ip, metadata: { label: def.label } });
  }

  /* -------------------------------------------------------------- shared checks */

  /** Salary template id and amounts (compensation section only). Mutates result.values to the cleaned form. */
  private async checkSalary(
    section: SectionDef,
    result: { values: Record<string, unknown> },
    data: SectionData,
    country: CountryCode,
    existingTemplateId?: unknown,
  ): Promise<{ field: string; message: string }[]> {
    if (!section.groups.some((g) => g.salaryComponents)) return [];
    const errors: { field: string; message: string }[] = [];
    const rawId = result.values.salaryTemplateId;
    const templateId = rawId === undefined || rawId === null || rawId === '' ? null : Number(rawId);
    delete result.values.salaryTemplateId;
    delete result.values.componentAmounts;
    if (templateId === null) {
      const raw = data.componentAmounts as Record<string, unknown> | undefined;
      if (raw && Object.values(raw).some((v) => v !== '' && v !== null && v !== undefined)) {
        errors.push({ field: 'salaryTemplateId', message: 'Choose a salary template before entering amounts' });
      }
      return errors;
    }
    if (!Number.isInteger(templateId)) return [{ field: 'salaryTemplateId', message: 'Salary template is not valid' }];
    const template = await this.prisma.salaryTemplate.findUnique({ where: { id: templateId } });
    const allowed =
      template &&
      (template.countryCode === 'ALL' || template.countryCode === country) &&
      (template.isActive || existingTemplateId === templateId);
    if (!allowed) return [{ field: 'salaryTemplateId', message: 'Choose an active salary template for this country' }];
    const check = validateComponentAmounts(template!.components as unknown as SalaryComponentDef[], data.componentAmounts);
    result.values.salaryTemplateId = templateId;
    result.values.componentAmounts = check.amounts;
    return check.errors;
  }

  /**
   * OT configuration (Attendance section): the rule must be active (or the one already chosen); an amount
   * override is only kept for a fixed rule, and is blank when not given. Mutates result.values to the cleaned form.
   */
  private async checkOvertime(section: SectionDef, result: { values: Record<string, unknown> }, existingConfigId?: unknown): Promise<{ field: string; message: string }[]> {
    if (section.key !== 'attendance') return [];
    const rawId = result.values.otConfiguration;
    const hasOverride = result.values.otAmountOverride !== undefined && result.values.otAmountOverride !== null && result.values.otAmountOverride !== '';
    if (rawId === undefined || rawId === null || rawId === '') {
      result.values.otAmountOverride = null;
      return hasOverride ? [{ field: 'otConfiguration', message: 'Choose an OT configuration before entering an amount' }] : [];
    }
    const configId = Number(rawId);
    if (!Number.isInteger(configId)) return [{ field: 'otConfiguration', message: 'OT configuration is not valid' }];
    const config = await this.prisma.overtimeConfiguration.findUnique({ where: { id: configId } });
    if (!config || (!config.isActive && Number(existingConfigId) !== configId)) {
      return [{ field: 'otConfiguration', message: 'Choose an active OT configuration' }];
    }
    result.values.otConfiguration = String(configId);
    if (!hasOverride) {
      result.values.otAmountOverride = null;
      return [];
    }
    if (!isFixedOvertime(config.type)) return [{ field: 'otAmountOverride', message: 'An amount override applies only to a fixed OT configuration' }];
    result.values.otAmountOverride = Number(result.values.otAmountOverride);
    return [];
  }

  /** Custom field values for one tab: known codes, typed values, required fields present. */
  private checkCustom(
    defs: { code: string; label: string; fieldType: string; options: unknown; isRequired: boolean }[],
    customInput: Record<string, unknown>,
    existingCodes: Set<string>,
  ): { field: string; message: string }[] {
    const errors: { field: string; message: string }[] = [];
    const known = new Set(defs.map((d) => d.code));
    for (const code of Object.keys(customInput)) if (!known.has(code)) errors.push({ field: code, message: `Unknown custom field: ${code}` });
    for (const d of defs) {
      const def: CustomFieldDefLike = { code: d.code, label: d.label, fieldType: d.fieldType, options: (d.options as unknown as string[]) ?? [], isRequired: d.isRequired };
      if (!Object.prototype.hasOwnProperty.call(customInput, d.code)) {
        if (d.isRequired && !existingCodes.has(d.code)) errors.push({ field: d.code, message: `${d.label} is required` });
        continue;
      }
      const err = checkCustomValue(def, customInput[d.code]);
      if (err) errors.push({ field: d.code, message: err });
    }
    return errors;
  }

  /**
   * Add Employee: checks every section before anything is created, so a new employee is
   * never left half-saved. Returns errors grouped by section key (empty when all is valid).
   */
  async validateNewProfile(
    countryInput: string | undefined,
    sections: Record<string, { data?: SectionData; custom?: Record<string, unknown> }>,
    user: CurrentUserPayload,
  ) {
    if (!this.isHr(user)) throw new ForbiddenException('Only HR or System Admin can add employees');
    const orgCountry = sections.organization?.data?.legalEntityCountry;
    const pick = (typeof orgCountry === 'string' ? orgCountry : countryInput) ?? 'IN';
    const country: CountryCode = (COUNTRIES as readonly string[]).includes(pick) ? (pick as CountryCode) : 'IN';
    const defs = await this.lookups(undefined, user.branchAccess, country);
    const all = buildSections(country, defs, await this.rules.rulesFor(country));
    const customDefs = (await this.prisma.customFieldDefinition.findMany({ where: { isActive: true } }))
      .filter((d) => d.countryCode === 'ALL' || d.countryCode === country);
    const errors: Record<string, { field: string; message: string }[]> = {};
    for (const section of all) {
      const body = sections[section.key] ?? {};
      const data = body.data ?? {};
      const result = validateSection(section, country, data);
      const list = [...result.errors];
      list.push(...(await this.checkSalary(section, result, data, country)));
      list.push(...(await this.checkOvertime(section, result, undefined)));
      list.push(...this.checkCustom(customDefs.filter((d) => d.tabKey === section.key), body.custom ?? {}, new Set()));
      if (list.length) errors[section.key] = list;
    }
    for (const key of Object.keys(sections)) {
      if (!(SECTION_KEYS as readonly string[]).includes(key)) errors[key] = [{ field: key, message: 'Unknown profile section' }];
    }
    return { country, valid: Object.keys(errors).length === 0, errors };
  }

  /* -------------------------------------------------------------- new employee: blank profile form */

  /** Schema for creating an employee (all nine sections, HR view) for a country. */
  async getBlankProfile(countryInput: string | undefined, user: CurrentUserPayload) {
    if (!this.isHr(user)) throw new ForbiddenException('Only HR or System Admin can add employees');
    const country: CountryCode = (COUNTRIES as readonly string[]).includes(countryInput ?? '') ? (countryInput as CountryCode) : 'IN';
    const defs = await this.prisma.customFieldDefinition.findMany({
      where: { isActive: true, countryCode: { in: ['ALL', country] } },
      orderBy: [{ tabKey: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }],
    });
    return {
      country,
      currency: CURRENCY[country],
      addressLevels: ADDRESS_LEVELS[country],
      sections: (await this.visibleSections(user, country, await this.lookups(undefined, user.branchAccess, country))).map((s) => resolveSection(s, country)),
      salaryTemplates: await this.salaryTemplatesFor(country),
      customFields: defs.map((d) => ({
        code: d.code, label: d.label, tabKey: d.tabKey, sectionName: d.sectionName, fieldType: d.fieldType,
        options: (d.options as unknown as string[]) ?? [], isRequired: d.isRequired, isSensitive: d.isSensitive,
        placeholder: d.placeholder, helpText: d.helpText,
      })),
    };
  }

  /* -------------------------------------------------------------- salary templates (D-024) */

  async listSalaryTemplates() {
    const rows = await this.prisma.salaryTemplate.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map((t) => ({ id: t.id, name: t.name, countryCode: t.countryCode, isActive: t.isActive, components: t.components as unknown as SalaryComponentDef[] }));
  }

  /** Builds the component list: keeps codes the admin sent back, generates codes for new rows. */
  private buildComponents(input: { label: string; code?: string }[]): SalaryComponentDef[] {
    const out: SalaryComponentDef[] = [];
    const seenLabels = new Set<string>();
    const seenCodes = new Set<string>();
    for (const c of input) {
      const label = c.label.trim();
      if (!label) continue;
      const lower = label.toLowerCase();
      if (seenLabels.has(lower)) throw new BadRequestException(`Component "${label}" appears twice`);
      seenLabels.add(lower);
      let code = (c.code && /^[A-Z0-9_]{1,60}$/.test(c.code) ? c.code : componentCode(label)) || 'COMPONENT';
      let n = 2;
      while (seenCodes.has(code)) code = `${componentCode(label)}_${n++}`;
      seenCodes.add(code);
      out.push({ code, label });
    }
    if (out.length === 0) throw new BadRequestException('Add at least one salary component');
    return out;
  }

  /** For all countries, or for one of the countries added in System settings → Countries (salary templates, custom fields). */
  private async assertCountryOrAll(code?: string) {
    if (!code || code === 'ALL') return;
    if (!(await this.prisma.country.findFirst({ where: { isoCode: code, isActive: true }, select: { id: true } }))) throw new BadRequestException('Choose a country that is added and active in System settings → Countries');
  }

  async createSalaryTemplate(dto: { name: string; countryCode?: string; components: { label: string; code?: string }[] }, user: CurrentUserPayload, ip: string) {
    if (!this.isHr(user)) throw new ForbiddenException('Only HR or System Admin can manage salary templates');
    await this.assertCountryOrAll(dto.countryCode);
    const name = dto.name.trim();
    if (await this.prisma.salaryTemplate.findUnique({ where: { name } })) throw new ConflictException(`A template named "${name}" already exists`);
    const created = await this.prisma.salaryTemplate.create({
      data: {
        name,
        countryCode: dto.countryCode ?? 'ALL',
        components: this.buildComponents(dto.components) as unknown as Prisma.InputJsonValue,
        createdByProfileId: user.profileId,
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'salary_template.created', entityType: 'salary_template', entityId: String(created.id), ipAddress: ip, metadata: { name } });
    return { ...created, components: created.components as unknown as SalaryComponentDef[] };
  }

  async updateSalaryTemplate(
    id: number,
    dto: { name?: string; countryCode?: string; isActive?: boolean; components?: { label: string; code?: string }[] },
    user: CurrentUserPayload,
    ip: string,
  ) {
    if (!this.isHr(user)) throw new ForbiddenException('Only HR or System Admin can manage salary templates');
    const existing = await this.prisma.salaryTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Salary template not found');
    if (dto.countryCode !== undefined && dto.countryCode !== existing.countryCode) await this.assertCountryOrAll(dto.countryCode);
    if (dto.name && dto.name.trim() !== existing.name) {
      const clash = await this.prisma.salaryTemplate.findUnique({ where: { name: dto.name.trim() } });
      if (clash) throw new ConflictException(`A template named "${dto.name.trim()}" already exists`);
    }
    const updated = await this.prisma.salaryTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.components !== undefined ? { components: this.buildComponents(dto.components) as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'salary_template.updated', entityType: 'salary_template', entityId: String(id), ipAddress: ip, metadata: { changed: Object.keys(dto) } });
    return { ...updated, components: updated.components as unknown as SalaryComponentDef[] };
  }

  private isSystemAdmin(user: CurrentUserPayload): boolean {
    return user.userTypeId === UserType.SystemAdmin;
  }
}
