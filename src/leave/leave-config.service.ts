import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { LeaveSettingsDto, LeaveTypeDto } from './dto/leave.dto';

/** System Settings > Leave configuration: leave types and organization-wide leave settings. */
@Injectable()
export class LeaveConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** onlyActive + a country: only types usable by that country (plus the ones left open to every country). */
  types(onlyActive: boolean, countryCode?: string) {
    return this.prisma.leaveType.findMany({
      where: {
        ...(onlyActive ? { isActive: true } : {}),
        ...(countryCode ? { OR: [{ countryCodes: { isEmpty: true } }, { countryCodes: { has: countryCode } }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  settings() {
    return this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  /** Every code must be a real, known country (the same list System Settings > Countries manages). */
  private async validateCountryCodes(codes: string[] | undefined): Promise<string[] | undefined> {
    if (codes === undefined) return undefined;
    const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (unique.length === 0) return [];
    const found = await this.prisma.country.findMany({ where: { isoCode: { in: unique } }, select: { isoCode: true } });
    const known = new Set(found.map((c) => c.isoCode));
    const unknown = unique.filter((c) => !known.has(c));
    if (unknown.length) throw new BadRequestException(`Unknown country code(s): ${unknown.join(', ')}`);
    return unique;
  }

  /** Per-category carry forward rules; only kept while the type carries forward. */
  private async carryRules(dto: LeaveTypeDto) {
    if (!(dto.resetBalance ?? true) || (dto.carryForwardType ?? 'NONE') !== 'CARRY_FORWARD') return [];
    const out: { category: string; action: string; targetLeaveTypeId: number | null }[] = [];
    for (const r of dto.carryForwardRules ?? []) {
      if (out.some((o) => o.category.trim().toLowerCase() === r.category.trim().toLowerCase())) throw new BadRequestException(`The category "${r.category || 'everyone else'}" is listed twice`);
      let target: number | null = null;
      if (r.action === 'UNPAID_LEAVE') {
        if (!r.targetLeaveTypeId) throw new BadRequestException('Choose the unpaid leave type the carried-forward days become');
        const t = await this.prisma.leaveType.findUnique({ where: { id: r.targetLeaveTypeId }, select: { id: true, balanceTracking: true, isCompOff: true } });
        if (!t || !t.balanceTracking || t.isCompOff) throw new BadRequestException('The unpaid leave type must keep a balance');
        target = t.id;
      }
      out.push({ category: r.category.trim(), action: r.action, targetLeaveTypeId: target });
    }
    return out;
  }

  private async data(dto: LeaveTypeDto, countryCodes: string[]) {
    if (dto.isCompOff && dto.accrual !== 'NONE') throw new BadRequestException('Comp off is earned through attendance, so it has no accrual');
    if (dto.accrual !== 'NONE' && !dto.balanceTracking) throw new BadRequestException('A leave type with accrual must keep a balance');
    return {
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      isPaid: dto.isPaid,
      balanceTracking: dto.balanceTracking,
      accrual: dto.accrual,
      annualDays: dto.annualDays,
      allowHalfDay: dto.allowHalfDay,
      allowNegative: dto.allowNegative,
      requiresDocument: dto.requiresDocument,
      documentAfterDays: dto.documentAfterDays,
      maxDaysPerRequest: dto.maxDaysPerRequest ?? null,
      isSandwichEligible: dto.isSandwichEligible,
      requiresApproval: dto.requiresApproval ?? true,
      isEncashable: dto.isEncashable ?? false,
      excludeWeeklyOffs: dto.excludeWeeklyOffs ?? true,
      excludeHolidays: dto.excludeHolidays ?? true,
      resetBalance: dto.resetBalance ?? true,
      // Carrying forward only means something while the balance is reset.
      carryForwardType: (dto.resetBalance ?? true) ? dto.carryForwardType ?? 'NONE' : 'NONE',
      carryForwardRules: (await this.carryRules(dto)) as unknown as Prisma.InputJsonValue,
      genderRestriction: dto.genderRestriction?.trim() || null,
      maxTimesInService: dto.maxTimesInService ?? null,
      eventWindowMonths: dto.eventWindowMonths ?? null,
      eventLabel: dto.eventWindowMonths ? dto.eventLabel?.trim() || 'Event date' : null,
      payPercent: dto.payPercent ?? (dto.isPaid ? 100 : 0),
      unlockAfterTypeIds: [...new Set(dto.unlockAfterTypeIds ?? [])],
      calendarStartMonth: dto.calendarStartMonth ?? null,
      isCompOff: dto.isCompOff,
      isActive: dto.isActive ?? true,
      countryCodes,
    };
  }

  private dup(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A leave type with this code or name already exists');
    throw e;
  }

  async create(dto: LeaveTypeDto, user: CurrentUserPayload, ip?: string) {
    try {
      const countryCodes = (await this.validateCountryCodes(dto.countryCodes)) ?? [];
      const last = await this.prisma.leaveType.aggregate({ _max: { sortOrder: true } });
      const created = await this.prisma.leaveType.create({ data: { ...(await this.data(dto, countryCodes)), sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_TYPE_CREATED', entityType: 'LeaveType', entityId: String(created.id), ipAddress: ip });
      return created;
    } catch (e) {
      return this.dup(e);
    }
  }

  /** A leave type that has been used (applications, balances, ledger or a policy rule) is kept: switch it off instead. */
  async remove(id: number, user: CurrentUserPayload, ip?: string) {
    if (!(await this.prisma.leaveType.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Leave type not found');
    const [applications, credits, transactions, rules] = await Promise.all([
      this.prisma.leaveApplication.count({ where: { leaveTypeId: id } }),
      this.prisma.leaveCredit.count({ where: { leaveTypeId: id } }),
      this.prisma.leaveTransaction.count({ where: { leaveTypeId: id } }),
      this.prisma.leavePolicyRule.count({ where: { leaveTypeId: id } }),
    ]);
    if (applications + credits + transactions + rules > 0) {
      throw new ConflictException('This leave type has been used (applications, balances or a leave policy), so it cannot be deleted. Switch it off instead.');
    }
    await this.prisma.leaveType.delete({ where: { id } });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_TYPE_DELETED', entityType: 'LeaveType', entityId: String(id), ipAddress: ip });
  }

  async update(id: number, dto: LeaveTypeDto, user: CurrentUserPayload, ip?: string) {
    if (!(await this.prisma.leaveType.findUnique({ where: { id } }))) throw new NotFoundException('Leave type not found');
    try {
      const countryCodes = (await this.validateCountryCodes(dto.countryCodes)) ?? [];
      const updated = await this.prisma.leaveType.update({ where: { id }, data: await this.data(dto, countryCodes) });
      await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_TYPE_UPDATED', entityType: 'LeaveType', entityId: String(id), ipAddress: ip, metadata: { sandwichEligible: dto.isSandwichEligible } });
      return updated;
    } catch (e) {
      return this.dup(e);
    }
  }

  async saveSettings(dto: LeaveSettingsDto, user: CurrentUserPayload, ip?: string) {
    const data = { ...dto, compOffExpiryDays: dto.compOffExpiryDays ?? null };
    const saved = await this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_SETTINGS_UPDATED', entityType: 'LeaveSettings', entityId: '1', ipAddress: ip, metadata: { sandwichEnabled: dto.sandwichEnabled } });
    return saved;
  }
}
