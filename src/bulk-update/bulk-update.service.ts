import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { assignWeeklyOff } from '../attendance-setup/weekly-off.util';
import { BULK_FIELDS, BulkChange, BulkFieldDef, MAX_BULK_EMPLOYEES, validateChanges } from './bulk-fields';

type Option = { value: string; label: string };

const fullName = (p: { name: string; lastName: string | null }) => [p.name, p.lastName].filter(Boolean).join(' ');

/** Changing the same fields for many employees in one go (Administration > Bulk update). HR and System Admin only. */
@Injectable()
export class BulkUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every option list the bulk fields can use, from the same masters the profile form uses. */
  private async optionLists(user: CurrentUserPayload): Promise<Record<string, Option[]>> {
    const parameterTypes = [...new Set(BULK_FIELDS.map((f) => (typeof f.source === 'object' ? f.source.parameter : null)).filter((x): x is string => !!x))];
    const [branches, shifts, employees, params, weeklyOffs, overtimeConfigs] = await Promise.all([
      this.prisma.branch.findMany({ where: { isActive: true, ...(user.branchAccess ? { id: { in: user.branchAccess } } : {}) }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
      this.prisma.shift.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        where: { isActive: true, ...(user.branchAccess ? { branchId: { in: user.branchAccess } } : {}) },
        orderBy: { employeeCode: 'asc' },
        select: { id: true, employeeCode: true, profile: { select: { name: true, lastName: true } } },
      }),
      this.prisma.parameter.findMany({ where: { isVisible: true, parameterType: { name: { in: parameterTypes } } }, orderBy: [{ displayOrder: 'asc' }, { text: 'asc' }], select: { text: true, parameterType: { select: { name: true } } } }),
      this.prisma.weeklyOffTemplate.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.overtimeConfiguration.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);
    const out: Record<string, Option[]> = {};
    for (const f of BULK_FIELDS) {
      if (f.type === 'yn') out[f.key] = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];
      else if (f.source === 'branches') out[f.key] = branches.map((b) => ({ value: String(b.id), label: b.name }));
      else if (f.source === 'weeklyOffs') out[f.key] = weeklyOffs.map((w) => ({ value: w.name, label: w.name }));
      else if (f.source === 'shifts') out[f.key] = shifts.map((s) => ({ value: String(s.id), label: s.name }));
      else if (f.source === 'overtimeConfigurations') out[f.key] = overtimeConfigs.map((c) => ({ value: String(c.id), label: c.name }));
      else if (f.source === 'employees') out[f.key] = employees.map((e) => ({ value: String(e.id), label: `${fullName(e.profile)} (${e.employeeCode})` }));
      else if (typeof f.source === 'object') out[f.key] = params.filter((p) => p.parameterType.name === (f.source as { parameter: string }).parameter).map((p) => ({ value: p.text, label: p.text }));
    }
    return out;
  }

  async fields(user: CurrentUserPayload) {
    const options = await this.optionLists(user);
    return BULK_FIELDS.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: options[f.key] ?? [] }));
  }

  /** Active employees the caller may change, optionally limited to some branches or a search text. */
  async employees(user: CurrentUserPayload, branchIds: number[], search?: string, limit?: number) {
    const scope = user.branchAccess ?? user.activeBranchIds;
    const where: Prisma.EmployeeWhereInput = { isActive: true };
    const want = branchIds.length ? (scope ? branchIds.filter((b) => scope.includes(b)) : branchIds) : scope;
    if (want) where.branchId = { in: want };
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [{ employeeCode: { contains: q, mode: 'insensitive' } }, { profile: { name: { contains: q, mode: 'insensitive' } } }, { profile: { lastName: { contains: q, mode: 'insensitive' } } }];
    }
    const rows = await this.prisma.employee.findMany({
      where,
      orderBy: [{ employeeCode: 'asc' }],
      take: Math.min(Math.max(limit ?? 1000, 1), 1000),
      select: { id: true, employeeCode: true, designation: true, branchId: true, branch: { select: { name: true } }, profile: { select: { name: true, lastName: true } } },
    });
    const sections = await this.prisma.employeeProfileSection.findMany({ where: { sectionKey: 'organization', employeeId: { in: rows.map((r) => r.id) } }, select: { employeeId: true, data: true } });
    const dept = new Map(sections.map((s) => [s.employeeId, (s.data as { department?: unknown } | null)?.department]));
    return rows.map((r) => ({
      id: r.id,
      code: r.employeeCode,
      name: fullName(r.profile),
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      designation: r.designation,
      department: typeof dept.get(r.id) === 'string' ? (dept.get(r.id) as string) : null,
    }));
  }

  /**
   * Applies the same changes to every chosen employee. Each employee is saved on its own, so one problem
   * never blocks the rest; the result lists who was updated and who was skipped, with the reason.
   */
  async apply(user: CurrentUserPayload, employeeIds: number[], changes: BulkChange[], ip?: string) {
    const ids = [...new Set(employeeIds)];
    if (!ids.length) throw new BadRequestException('Choose at least one employee');
    if (ids.length > MAX_BULK_EMPLOYEES) throw new BadRequestException(`Choose at most ${MAX_BULK_EMPLOYEES} employees at a time`);

    const lists = await this.optionLists(user);
    const options = Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.map((o) => o.value)]));
    const problems = validateChanges(changes, options);
    if (problems.length) throw new BadRequestException(problems[0]);

    const employees = await this.prisma.employee.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, employeeCode: true, branchId: true, profile: { select: { name: true, lastName: true } } } });
    if (user.branchAccess) {
      const outside = employees.filter((e) => !e.branchId || !user.branchAccess!.includes(e.branchId));
      if (outside.length) throw new ForbiddenException(`You do not have access to the branch of ${outside[0].employeeCode}`);
    }
    const typeIds = new Map((await this.prisma.parameter.findMany({ where: { parameterType: { name: 'Employee Type' } }, select: { id: true, text: true } })).map((p) => [p.text, p.id]));

    const todayDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const defs = changes.map((c) => ({ def: BULK_FIELDS.find((f) => f.key === c.field) as BulkFieldDef, value: c.value === null || String(c.value).trim() === '' ? null : String(c.value).trim() }));
    const updated: number[] = [];
    const skipped: { employeeId: number; code: string; reason: string }[] = [];
    const missing = ids.filter((i) => !employees.some((e) => e.id === i));
    for (const i of missing) skipped.push({ employeeId: i, code: '', reason: 'Not found or not active' });

    for (const e of employees) {
      const reportsTo = defs.find((d) => d.def.key === 'reportingManager');
      if (reportsTo && reportsTo.value === String(e.id)) {
        skipped.push({ employeeId: e.id, code: e.employeeCode, reason: 'An employee cannot report to themselves' });
        continue;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const bySection = new Map<string, Record<string, unknown>>();
          for (const { def, value } of defs) {
            const data = bySection.get(def.section) ?? {};
            data[def.key] = value;
            bySection.set(def.section, data);
          }
          for (const [sectionKey, values] of bySection) {
            const row = await tx.employeeProfileSection.findUnique({ where: { employeeId_sectionKey: { employeeId: e.id, sectionKey } } });
            const merged = { ...((row?.data as Record<string, unknown> | null) ?? {}), ...values };
            await tx.employeeProfileSection.upsert({
              where: { employeeId_sectionKey: { employeeId: e.id, sectionKey } },
              create: { employeeId: e.id, sectionKey, data: merged as Prisma.InputJsonValue, updatedByProfileId: user.profileId },
              update: { data: merged as Prisma.InputJsonValue, updatedByProfileId: user.profileId },
            });
          }
          const columns: Prisma.EmployeeUncheckedUpdateInput = {};
          for (const { def, value } of defs) {
            if (def.column === 'branchId') columns.branchId = value === null ? null : Number(value);
            if (def.column === 'shiftId') columns.shiftId = value === null ? null : Number(value);
            if (def.column === 'reportingToId') columns.reportingToId = value === null ? null : Number(value);
            if (def.column === 'designation') columns.designation = value;
            if (def.syncEmployeeType) columns.employeeTypeId = value ? typeIds.get(value) ?? null : null;
          }
          if (Object.keys(columns).length) await tx.employee.update({ where: { id: e.id }, data: columns });
          for (const { def, value } of defs) {
            if (!def.syncWeeklyOff) continue;
            const template = value ? await tx.weeklyOffTemplate.findUnique({ where: { name: value }, select: { id: true } }) : null;
            await assignWeeklyOff(tx, e.id, template?.id ?? null, todayDate);
          }
        });
        updated.push(e.id);
      } catch (err) {
        skipped.push({ employeeId: e.id, code: e.employeeCode, reason: err instanceof Error ? err.message.slice(0, 160) : 'Could not be saved' });
      }
    }

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'EMPLOYEE_BULK_UPDATE',
      entityType: 'Employee',
      entityId: String(updated.length),
      ipAddress: ip,
      metadata: { fields: defs.map((d) => d.def.key), updated: updated.length, skipped: skipped.length, employeeIds: updated.slice(0, 100) },
    });
    return { updated: updated.length, skipped, fields: defs.map((d) => d.def.label) };
  }
}
