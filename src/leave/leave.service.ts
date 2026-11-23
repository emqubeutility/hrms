import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService, UploadedFileLike } from '../common/services/file-storage.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserType } from '../common/constants/user-types';
import { RosterService } from '../attendance-setup/roster.service';
import { parseIsoDate, toIsoDate } from '../attendance-setup/attendance-logic';
import { AttendanceProcessingService } from '../attendance/attendance-processing.service';
import { AdjustBalanceDto, AdjustGroupDto, LeaveRequestDto } from './dto/leave.dto';
import { EntitlementService } from './entitlement.service';
import { MONTHLY_LUMP, addMonthsIso, lastMonthToCredit } from './entitlement-rules';
import { CarryRule, pickCarryRule } from './leave-formula';
import { CalcResult, DayKind, TimelineDay, allocateFefo, compOffExpiry, countLeaveDays, isoAdd, leaveYear, monthlyCredit } from './leave-rules';

const HR_TYPES: number[] = [UserType.SystemAdmin, UserType.HRAdmin];
const MARGIN = 7;
const num = (d: Prisma.Decimal | number) => Number(d);
/** Days are shown to 2 decimals: adding decimals as JS numbers leaves tails like 27.450000000000003. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const rangeDates = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = isoAdd(d, 1)) out.push(d);
  return out;
};
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roster: RosterService,
    private readonly processing: AttendanceProcessingService,
    private readonly entitlement: EntitlementService,
    private readonly files: FileStorageService,
  ) {}

  /* ------------------------------------------------------------------ who is asking */

  private async myEmployeeId(user: CurrentUserPayload) {
    const e = await this.prisma.employee.findUnique({ where: { profileId: user.profileId }, select: { id: true, isActive: true } });
    if (!e || !e.isActive) throw new ForbiddenException('Your account is not linked to an active employee record');
    return e.id;
  }

  /** Country of employment, for showing only the leave types that apply there. */
  async myCountry(user: CurrentUserPayload): Promise<string | undefined> {
    const [fact] = await this.entitlement.facts([await this.myEmployeeId(user)]);
    return fact?.countryCode ?? undefined;
  }

  /** HR (within their branches) or the employee's own manager may decide leave. */
  private async assertMayDecide(user: CurrentUserPayload, employeeId: number) {
    if (HR_TYPES.includes(user.userTypeId)) {
      if (user.branchAccess) {
        const e = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { branchId: true } });
        if (!e?.branchId || !user.branchAccess.includes(e.branchId)) throw new ForbiddenException("You do not have access to this employee's branch");
      }
      return;
    }
    const me = await this.prisma.employee.findUnique({ where: { profileId: user.profileId }, select: { id: true } });
    const target = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingToId: true } });
    if (!me || target?.reportingToId !== me.id) throw new ForbiddenException('You can only decide leave for your own team');
  }

  /* ------------------------------------------------------------------ day calculation */

  /** Day kinds for a range plus a margin each side, from the roster and the holiday calendar. */
  private async timeline(employeeId: number, from: string, to: string): Promise<{ days: TimelineDay[]; noRoster: boolean }> {
    const start = isoAdd(from, -MARGIN);
    const end = isoAdd(to, MARGIN);
    const days: TimelineDay[] = [];
    let noRoster = false;
    for (let s = start; s <= end; s = isoAdd(s, 63)) {
      const e = isoAdd(s, 62) < end ? isoAdd(s, 62) : end;
      const r = await this.roster.resolveRange(employeeId, s, e);
      for (const d of r.days) {
        if (d.roster.source === 'NONE') noRoster = true;
        const kind: DayKind = d.holiday ? 'HOLIDAY' : d.roster.isWeeklyOff ? 'WEEKLY_OFF' : 'WORKING';
        days.push({ date: d.date, kind });
      }
    }
    return { days, noRoster };
  }

  private async calculate(employeeId: number, type: { id: number; isSandwichEligible: boolean; excludeWeeklyOffs: boolean; excludeHolidays: boolean }, from: string, to: string, halfDay: boolean, excludeApplicationId?: number) {
    const settings = await this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const { days, noRoster } = await this.timeline(employeeId, from, to);
    // Other leave of types that take part in sandwich leave, so leave on the far side of a weekend is seen.
    const others = await this.prisma.leaveApplication.findMany({
      where: { employeeId, status: { in: ['PENDING', 'APPROVED'] }, id: excludeApplicationId ? { not: excludeApplicationId } : undefined, leaveType: { isSandwichEligible: true }, fromDate: { lte: parseIsoDate(isoAdd(to, MARGIN))! }, toDate: { gte: parseIsoDate(isoAdd(from, -MARGIN))! } },
      select: { calculation: true },
    });
    const existing = new Set<string>();
    for (const o of others) for (const d of o.calculation as { date: string; reason: string }[]) if (d.reason === 'LEAVE' || d.reason === 'HALF_DAY') existing.add(d.date);
    const result = countLeaveDays(days, from, to, halfDay, { enabled: settings.sandwichEnabled, typeEligible: type.isSandwichEligible, weeklyOffs: settings.sandwichWeeklyOffs, holidays: settings.sandwichHolidays, requireBothSides: settings.sandwichRequireBothSides }, existing, { weeklyOffs: type.excludeWeeklyOffs, holidays: type.excludeHolidays });
    return { result, noRoster };
  }

  /* ------------------------------------------------------------------ balances */

  private async creditsOf(employeeId: number, leaveTypeId: number, asOf = today()) {
    const rows = await this.prisma.leaveCredit.findMany({ where: { employeeId, leaveTypeId, remaining: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: parseIsoDate(asOf)! } }] }, orderBy: [{ expiresOn: 'asc' }, { id: 'asc' }] });
    return rows.map((c) => ({ id: c.id, remaining: num(c.remaining), expiresOn: c.expiresOn ? toIsoDate(c.expiresOn) : null }));
  }

  async balances(employeeId: number) {
    const [types, pending] = await Promise.all([
      this.prisma.leaveType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }] }),
      this.prisma.leaveApplication.groupBy({ by: ['leaveTypeId'], where: { employeeId, status: 'PENDING' }, _sum: { totalDays: true } }),
    ]);
    const out = [];
    for (const t of types) {
      const credits = t.balanceTracking ? await this.creditsOf(employeeId, t.id) : [];
      const balance = round2(credits.reduce((s, c) => s + c.remaining, 0));
      const pend = round2(num(pending.find((p) => p.leaveTypeId === t.id)?._sum.totalDays ?? 0));
      const next = credits.filter((c) => c.expiresOn).sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1))[0];
      out.push({ leaveTypeId: t.id, code: t.code, name: t.name, isPaid: t.isPaid, balanceTracking: t.balanceTracking, balance, pending: pend, available: round2(balance - pend), nextExpiry: next?.expiresOn ?? null });
    }
    return out;
  }

  /** Leave types the caller cannot use yet (an earlier step still has days left). */
  async myLockedTypeIds(user: CurrentUserPayload): Promise<Set<number>> {
    return this.lockedTypeIds(await this.myEmployeeId(user));
  }

  async myBalances(user: CurrentUserPayload) {
    const employeeId = await this.myEmployeeId(user);
    const locked = await this.lockedTypeIds(employeeId);
    const rows = (await this.balances(employeeId)).filter((r) => !locked.has(r.leaveTypeId));
    const country = await this.myCountry(user);
    if (!country) return rows;
    // Hide a type that does not apply to this country, unless the employee actually holds (or is waiting on) days of it.
    const types = await this.prisma.leaveType.findMany({ where: { id: { in: rows.map((r) => r.leaveTypeId) } }, select: { id: true, countryCodes: true } });
    const codesOf = new Map(types.map((t) => [t.id, t.countryCodes]));
    return rows.filter((r) => {
      const codes = codesOf.get(r.leaveTypeId) ?? [];
      return codes.length === 0 || codes.includes(country) || r.balance !== 0 || r.pending !== 0;
    });
  }

  /* ------------------------------------------------------------------ applying */

  private async checked(employeeId: number, dto: LeaveRequestDto, excludeApplicationId?: number) {
    const from = parseIsoDate(dto.fromDate);
    const to = parseIsoDate(dto.toDate);
    if (!from || !to) throw new BadRequestException('Dates must be real dates (YYYY-MM-DD)');
    if (to < from) throw new BadRequestException('The last day cannot be before the first day');
    if ((to.getTime() - from.getTime()) / 86_400_000 > 366) throw new BadRequestException('Leave can cover at most a year');
    const type = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!type || !type.isActive) throw new BadRequestException('Choose an active leave type');
    const halfDay = !!dto.halfDayPart;
    if (halfDay) {
      if (!type.allowHalfDay) throw new BadRequestException(`${type.name} cannot be taken as a half day`);
      if (dto.fromDate !== dto.toDate) throw new BadRequestException('A half day is a single day');
    }
    await this.checkConditions(employeeId, type, dto, excludeApplicationId);
    const { result, noRoster } = await this.calculate(employeeId, type, dto.fromDate, dto.toDate, halfDay, excludeApplicationId);
    if (result.totalDays <= 0) throw new BadRequestException('The days you chose are all off days or holidays, so there is no leave to take');
    const chosen = ((type.variants as { label: string; maxDays: number }[]) ?? []).find((v) => v.label === dto.variant);
    if (chosen && result.totalDays > chosen.maxDays) throw new BadRequestException(`${type.name} (${chosen.label}) can be at most ${chosen.maxDays} days`);
    if (type.maxDaysPerRequest && result.totalDays > type.maxDaysPerRequest) throw new BadRequestException(`${type.name} can be at most ${type.maxDaysPerRequest} days at a time`);
    const overlap = await this.prisma.leaveApplication.findFirst({ where: { employeeId, status: { in: ['PENDING', 'APPROVED'] }, id: excludeApplicationId ? { not: excludeApplicationId } : undefined, fromDate: { lte: to }, toDate: { gte: from } } });
    if (overlap) throw new ConflictException(`You already have leave from ${toIsoDate(overlap.fromDate)} to ${toIsoDate(overlap.toDate)} that overlaps these dates`);
    return { type, result, noRoster, from, to, halfDay };
  }

  /** The name of the first of these leave types that still has days left for the employee, or null when all are used up. */
  private async firstUnexhausted(employeeId: number, typeIds: number[]): Promise<string | null> {
    const types = await this.prisma.leaveType.findMany({ where: { id: { in: typeIds } }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, balanceTracking: true } });
    for (const t of types) {
      if (!t.balanceTracking) continue;
      // A step that was never credited to this person has not been used up either, so the next step stays locked.
      if ((await this.prisma.leaveCredit.count({ where: { employeeId, leaveTypeId: t.id } })) === 0) return t.name;
      if ((await this.available(employeeId, t.id)) > 0) return t.name;
    }
    return null;
  }

  /** The Gender text on the employee's profile (lower case), or null when not filled in. */
  private async genderOf(employeeId: number): Promise<string | null> {
    const p = await this.prisma.employeeProfileSection.findUnique({ where: { employeeId_sectionKey: { employeeId, sectionKey: 'personal' } }, select: { data: true } });
    const g = (p?.data as { gender?: unknown } | null)?.gender;
    return typeof g === 'string' && g.trim() ? g.trim().toLowerCase() : null;
  }

  /** Leave types hidden from this employee: a step whose earlier steps still have days left, or a type for the other gender. */
  async lockedTypeIds(employeeId: number): Promise<Set<number>> {
    const locked = new Set<number>();
    const gender = await this.genderOf(employeeId);
    for (const t of await this.prisma.leaveType.findMany({ where: { isActive: true, genderRestriction: { not: null } }, select: { id: true, genderRestriction: true } })) {
      if (gender !== t.genderRestriction!.trim().toLowerCase()) locked.add(t.id);
    }
    for (const t of await this.prisma.leaveType.findMany({ where: { isActive: true, unlockAfterTypeIds: { isEmpty: false } }, select: { id: true, unlockAfterTypeIds: true } })) {
      if (await this.firstUnexhausted(employeeId, t.unlockAfterTypeIds)) locked.add(t.id);
    }
    return locked;
  }

  /** The conditions a leave type puts on who can take it and when (gender, times in service, event window). */
  private async checkConditions(employeeId: number, type: { id: number; name: string; variants: unknown; variantLabel: string | null; unlockAfterTypeIds: number[]; genderRestriction: string | null; maxTimesInService: number | null; eventWindowMonths: number | null; eventLabel: string | null }, dto: LeaveRequestDto, excludeApplicationId?: number) {
    const variants = (type.variants as { label: string; maxDays: number }[]) ?? [];
    if (variants.length && !variants.some((v) => v.label === dto.variant)) throw new BadRequestException(`Choose the ${(type.variantLabel || 'option').toLowerCase()} for ${type.name}`);
    if (type.unlockAfterTypeIds.length) {
      const first = await this.firstUnexhausted(employeeId, type.unlockAfterTypeIds);
      if (first) throw new BadRequestException(`${type.name} can be used only after ${first} is used up`);
    }
    if (type.genderRestriction) {
      const p = await this.prisma.employeeProfileSection.findUnique({ where: { employeeId_sectionKey: { employeeId, sectionKey: 'personal' } }, select: { data: true } });
      const gender = (p?.data as { gender?: unknown } | null)?.gender;
      if (typeof gender !== 'string' || gender.trim().toLowerCase() !== type.genderRestriction.trim().toLowerCase()) throw new BadRequestException(`${type.name} is only for ${type.genderRestriction.toLowerCase()} employees`);
    }
    if (type.maxTimesInService) {
      const used = await this.prisma.leaveApplication.count({ where: { employeeId, leaveTypeId: type.id, status: { in: ['PENDING', 'APPROVED'] }, id: excludeApplicationId ? { not: excludeApplicationId } : undefined } });
      if (used >= type.maxTimesInService) throw new BadRequestException(`${type.name} can be taken only ${type.maxTimesInService === 1 ? 'once' : type.maxTimesInService + ' times'} during employment, and you have already used it`);
    }
    if (type.eventWindowMonths) {
      const label = type.eventLabel || 'Event date';
      if (!dto.eventDate) throw new BadRequestException(`Give the ${label.toLowerCase()} for ${type.name}`);
      if (dto.fromDate < dto.eventDate) throw new BadRequestException(`${type.name} cannot start before the ${label.toLowerCase()}`);
      const last = addMonthsIso(dto.eventDate, type.eventWindowMonths);
      if (dto.toDate > last) throw new BadRequestException(`${type.name} must be taken within ${type.eventWindowMonths} month(s) of the ${label.toLowerCase()} (by ${last})`);
    }
  }

  private async available(employeeId: number, typeId: number): Promise<number> {
    const credits = await this.creditsOf(employeeId, typeId);
    const pending = await this.prisma.leaveApplication.aggregate({ where: { employeeId, leaveTypeId: typeId, status: 'PENDING' }, _sum: { totalDays: true } });
    return round2(credits.reduce((s, c) => s + c.remaining, 0) - num(pending._sum.totalDays ?? 0));
  }

  /** What an application would take, before it is sent. */
  async preview(user: CurrentUserPayload, dto: LeaveRequestDto) {
    const employeeId = await this.myEmployeeId(user);
    const { type, result, noRoster } = await this.checked(employeeId, dto);
    const available = type.balanceTracking ? await this.available(employeeId, type.id) : null;
    const warnings: string[] = [];
    if (noRoster) warnings.push('You have no roster assigned, so every day is counted as a working day. Ask HR to assign your roster.');
    if (type.requiresDocument && result.totalDays > type.documentAfterDays) warnings.push(`${type.name} over ${type.documentAfterDays} day(s) needs a supporting document. Give it to HR.`);
    const enough = !type.balanceTracking || type.allowNegative || (available ?? 0) >= result.totalDays;
    return { ...result, leaveType: { id: type.id, name: type.name, isPaid: type.isPaid }, requiresApproval: type.requiresApproval, available, enough, warnings };
  }

  async apply(user: CurrentUserPayload, dto: LeaveRequestDto, ip?: string) {
    const employeeId = await this.myEmployeeId(user);
    const { type, result, from, to } = await this.checked(employeeId, dto);
    if (type.balanceTracking && !type.allowNegative) {
      const available = await this.available(employeeId, type.id);
      if (available < result.totalDays) throw new BadRequestException(`Not enough ${type.name}: ${available} available, ${result.totalDays} needed`);
    }
    const created = await this.prisma.leaveApplication.create({
      data: { employeeId, leaveTypeId: type.id, fromDate: from, toDate: to, halfDayPart: dto.halfDayPart ?? null, eventDate: dto.eventDate ? parseIsoDate(dto.eventDate)! : null, variant: dto.variant ?? null, requestedDays: result.requestedDays, sandwichDays: result.sandwichDays, totalDays: result.totalDays, reason: dto.reason?.trim() || null, calculation: result.days as unknown as Prisma.InputJsonValue },
    });
    // A leave type that needs no approval is approved the moment it is sent (days taken from the balance, attendance marked).
    if (!type.requiresApproval) {
      const app = await this.prisma.leaveApplication.findUniqueOrThrow({ where: { id: created.id }, include: { leaveType: true } });
      await this.approveApplication(user, app, ip);
    }
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_APPLIED', entityType: 'LeaveApplication', entityId: String(created.id), ipAddress: ip, metadata: { type: type.code, days: result.totalDays, sandwich: result.sandwichDays } });
    return this.present(await this.prisma.leaveApplication.findUniqueOrThrow({ where: { id: created.id }, include: this.include }));
  }

  /* ------------------------------------------------------------------ deciding and cancelling */

  async decide(user: CurrentUserPayload, id: number, approve: boolean, note: string | undefined, ip?: string) {
    const app = await this.prisma.leaveApplication.findUnique({ where: { id }, include: { leaveType: true } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'PENDING') throw new ConflictException('This application has already been decided');
    await this.assertMayDecide(user, app.employeeId);

    if (!approve) {
      await this.prisma.leaveApplication.update({ where: { id }, data: { status: 'REJECTED', decidedById: user.profileId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
      await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_REJECTED', entityType: 'LeaveApplication', entityId: String(id), ipAddress: ip });
      return;
    }

    if (app.leaveType.requiresDocument && num(app.totalDays) > app.leaveType.documentAfterDays && !app.attachmentFileId) {
      throw new ConflictException(`${app.leaveType.name} needs a supporting document. Ask the employee to attach it first.`);
    }
    await this.approveApplication(user, app, ip, note);
  }

  /* ------------------------------------------------------------------ supporting document */

  /** Attach (or replace) the supporting document of an application that has not been decided. The employee or HR may do it. */
  async attach(user: CurrentUserPayload, id: number, file: UploadedFileLike | undefined, ip?: string) {
    if (!file) throw new BadRequestException('Choose a file to attach');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('The file can be at most 10 MB');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) throw new BadRequestException('Attach a PDF, JPG or PNG file');
    const app = await this.prisma.leaveApplication.findUnique({ where: { id }, include: { employee: { select: { profileId: true } } } });
    if (!app) throw new NotFoundException('Application not found');
    const own = app.employee.profileId === user.profileId;
    if (!own && !HR_TYPES.includes(user.userTypeId)) throw new ForbiddenException('You can attach a document only to your own leave');
    if (app.status !== 'PENDING') throw new ConflictException('The document can be attached only while the leave is waiting for a decision');
    const saved = await this.files.saveFile(file);
    const row = await this.prisma.storedFile.create({ data: { originalName: saved.originalName, storageKey: saved.storageKey, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, sha256: saved.sha256, createdById: user.profileId } });
    await this.prisma.leaveApplication.update({ where: { id }, data: { attachmentFileId: row.id } });
    if (app.attachmentFileId) await this.prisma.storedFile.update({ where: { id: app.attachmentFileId }, data: { isActive: false } });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_DOCUMENT_ATTACHED', entityType: 'LeaveApplication', entityId: String(id), ipAddress: ip });
    return { name: saved.originalName };
  }

  /** The supporting document, for the employee, HR, or the manager who decides. */
  async attachment(user: CurrentUserPayload, id: number) {
    const app = await this.prisma.leaveApplication.findUnique({ where: { id }, include: { employee: { select: { profileId: true } }, attachmentFile: true } });
    if (!app || !app.attachmentFile) throw new NotFoundException('There is no document on this application');
    if (app.employee.profileId !== user.profileId) await this.assertMayDecide(user, app.employeeId);
    return { stream: this.files.readFile(app.attachmentFile.storageKey), name: app.attachmentFile.originalName, mimeType: app.attachmentFile.mimeType };
  }

  /** Approves one pending application: counts the days again, takes them from the balance and marks the attendance. */
  private async approveApplication(user: CurrentUserPayload, app: Prisma.LeaveApplicationGetPayload<{ include: { leaveType: true } }>, ip?: string, note?: string) {
    // The days are worked out again now: the roster or the holidays may have changed since it was sent.
    const fromStr = toIsoDate(app.fromDate);
    const toStr = toIsoDate(app.toDate);
    const { result } = await this.calculate(app.employeeId, app.leaveType, fromStr, toStr, !!app.halfDayPart, app.id);
    const total = result.totalDays;

    await this.prisma.$transaction(async (tx) => {
      if (app.leaveType.balanceTracking) {
        const credits = (await tx.leaveCredit.findMany({ where: { employeeId: app.employeeId, leaveTypeId: app.leaveTypeId, remaining: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: parseIsoDate(today())! } }] } })).map((c) => ({ id: c.id, remaining: num(c.remaining), expiresOn: c.expiresOn ? toIsoDate(c.expiresOn) : null }));
        const { allocations, shortfall } = allocateFefo(credits, total);
        if (shortfall > 0 && !app.leaveType.allowNegative) throw new BadRequestException(`The balance does not cover ${total} days (${shortfall} short). Adjust the balance first.`);
        for (const a of allocations) {
          await tx.leaveCredit.update({ where: { id: a.creditId }, data: { remaining: { decrement: a.days } } });
          await tx.leaveAllocation.create({ data: { applicationId: app.id, creditId: a.creditId, days: a.days } });
        }
        const covered = total - shortfall;
        await tx.leaveTransaction.create({ data: { employeeId: app.employeeId, leaveTypeId: app.leaveTypeId, kind: 'DEBIT', days: -covered, applicationId: app.id, note: shortfall > 0 ? `${shortfall} day(s) beyond the balance` : null, createdById: user.profileId } });
      }
      await tx.leaveApplication.update({ where: { id: app.id }, data: { status: 'APPROVED', requestedDays: result.requestedDays, sandwichDays: result.sandwichDays, totalDays: total, calculation: result.days as unknown as Prisma.InputJsonValue, decidedById: user.profileId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_APPROVED', entityType: 'LeaveApplication', entityId: String(app.id), ipAddress: ip, metadata: { days: total } });
    await this.refreshAttendance(app.employeeId, [...result.days.map((d) => d.date), ...rangeDates(fromStr, toStr)]);
  }

  /** Days that are already finished get their attendance rebuilt, so approved leave shows at once. */
  private async refreshAttendance(employeeId: number, dates: string[]) {
    const yesterday = isoAdd(today(), -1);
    for (const d of [...new Set(dates)].sort()) {
      if (d > yesterday) continue;
      try {
        await this.processing.processDay(employeeId, d);
      } catch (e) {
        this.logger.warn(`Could not refresh attendance for ${employeeId} on ${d}: ${(e as Error).message}`);
      }
    }
  }

  async cancel(user: CurrentUserPayload, id: number, ip?: string) {
    const app = await this.prisma.leaveApplication.findUnique({ where: { id }, include: { allocations: true } });
    if (!app) throw new NotFoundException('Application not found');
    const isHr = HR_TYPES.includes(user.userTypeId);
    const mine = (await this.prisma.employee.findUnique({ where: { profileId: user.profileId }, select: { id: true } }))?.id === app.employeeId;
    if (!isHr && !mine) throw new ForbiddenException('You can only cancel your own leave');
    if (app.status === 'CANCELLED' || app.status === 'REJECTED') throw new ConflictException('This application is already closed');
    if (app.status === 'APPROVED' && !isHr && toIsoDate(app.fromDate) <= today()) throw new ForbiddenException('Leave that has started can only be cancelled by HR');

    await this.prisma.$transaction(async (tx) => {
      if (app.status === 'APPROVED') {
        let given = 0;
        for (const a of app.allocations) {
          await tx.leaveCredit.update({ where: { id: a.creditId }, data: { remaining: { increment: a.days } } });
          given += num(a.days);
        }
        if (given > 0) await tx.leaveTransaction.create({ data: { employeeId: app.employeeId, leaveTypeId: app.leaveTypeId, kind: 'REVERSAL', days: given, applicationId: id, note: 'Leave cancelled', createdById: user.profileId } });
        await tx.leaveAllocation.deleteMany({ where: { applicationId: id } });
        // Days the job marked as leave go back to being worked out again.
        await tx.attendance.deleteMany({ where: { leaveApplicationId: id, isAutoGenerated: true } });
      }
      await tx.leaveApplication.update({ where: { id }, data: { status: 'CANCELLED', decidedById: user.profileId, decidedAt: new Date() } });
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_CANCELLED', entityType: 'LeaveApplication', entityId: String(id), ipAddress: ip });
    if (app.status === 'APPROVED') await this.refreshAttendance(app.employeeId, [...(app.calculation as { date: string }[]).map((d) => d.date), ...rangeDates(toIsoDate(app.fromDate), toIsoDate(app.toDate))]);
  }

  /* ------------------------------------------------------------------ reading */

  private include = { leaveType: { select: { id: true, code: true, name: true, isPaid: true } }, employee: { select: { employeeCode: true, profile: { select: { name: true, lastName: true } } } }, attachmentFile: { select: { originalName: true } } } as const;

  private present(a: Prisma.LeaveApplicationGetPayload<{ include: LeaveService['include'] }>) {
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeCode: a.employee.employeeCode,
      employeeName: [a.employee.profile.name, a.employee.profile.lastName].filter(Boolean).join(' '),
      leaveType: a.leaveType,
      fromDate: toIsoDate(a.fromDate),
      toDate: toIsoDate(a.toDate),
      halfDayPart: a.halfDayPart,
      requestedDays: num(a.requestedDays),
      sandwichDays: num(a.sandwichDays),
      totalDays: num(a.totalDays),
      status: a.status,
      reason: a.reason,
      decisionNote: a.decisionNote,
      decidedAt: a.decidedAt,
      createdAt: a.createdAt,
      calculation: a.calculation,
      variant: a.variant,
      hasAttachment: a.attachmentFileId !== null,
      attachmentName: a.attachmentFile?.originalName ?? null,
    };
  }

  /** The employee's own applications, newest first. Optional filters: status, leave type, and dates (any overlap with from..to). */
  async mine(user: CurrentUserPayload, filters: { status?: string; leaveTypeId?: number; from?: string; to?: string } = {}) {
    const employeeId = await this.myEmployeeId(user);
    const where: Prisma.LeaveApplicationWhereInput = { employeeId };
    if (filters.status) {
      if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(filters.status)) throw new BadRequestException('Unknown status');
      where.status = filters.status;
    }
    if (filters.leaveTypeId) where.leaveTypeId = filters.leaveTypeId;
    const from = filters.from ? parseIsoDate(filters.from) : null;
    const to = filters.to ? parseIsoDate(filters.to) : null;
    if ((filters.from && !from) || (filters.to && !to)) throw new BadRequestException('Dates must be real dates (YYYY-MM-DD)');
    if (from && to && to < from) throw new BadRequestException('The end date cannot be before the start date');
    if (from) where.toDate = { gte: from };
    if (to) where.fromDate = { lte: to };
    const rows = await this.prisma.leaveApplication.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: 300, include: this.include });
    return rows.map((r) => this.present(r));
  }

  private async scopeWhere(user: CurrentUserPayload): Promise<Prisma.LeaveApplicationWhereInput> {
    if (HR_TYPES.includes(user.userTypeId)) return user.activeBranchIds ? { employee: { branchId: { in: user.activeBranchIds } } } : {};
    return { employee: { reportingToId: await this.myEmployeeId(user) } };
  }

  /** Applications waiting for the caller (status PENDING), or any status. */
  async team(user: CurrentUserPayload, status?: string) {
    const rows = await this.prisma.leaveApplication.findMany({ where: { ...(await this.scopeWhere(user)), ...(status ? { status } : {}) }, orderBy: [{ status: 'asc' }, { fromDate: 'desc' }], take: 200, include: this.include });
    return rows.map((r) => this.present(r));
  }

  /** The leave calendar: approved and pending leave overlapping a range, for the team or for HR. */
  async calendar(user: CurrentUserPayload, fromStr: string, toStr: string, scope: 'me' | 'team') {
    const from = parseIsoDate(fromStr);
    const to = parseIsoDate(toStr);
    if (!from || !to || to < from) throw new BadRequestException('Give a valid from and to date');
    if ((to.getTime() - from.getTime()) / 86_400_000 > 93) throw new BadRequestException('Ask for at most three months at a time');
    const where: Prisma.LeaveApplicationWhereInput = { status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: to }, toDate: { gte: from }, ...(scope === 'me' ? { employeeId: await this.myEmployeeId(user) } : await this.scopeWhere(user)) };
    const rows = await this.prisma.leaveApplication.findMany({ where, orderBy: { fromDate: 'asc' }, take: 500, include: this.include });
    return rows.map((r) => this.present(r));
  }

  /**
   * Every comp off credit with what happened to it: still usable (and when it runs out), used, or lost to expiry.
   * scope "me" = the caller's own; "team" = the people the caller manages (HR: everyone in their branches).
   */
  async compOffList(user: CurrentUserPayload, scope: 'me' | 'team') {
    const where: Prisma.LeaveCreditWhereInput = { source: 'COMP_OFF' };
    if (scope === 'me') where.employeeId = await this.myEmployeeId(user);
    else if (HR_TYPES.includes(user.userTypeId)) {
      if (user.activeBranchIds) where.employee = { branchId: { in: user.activeBranchIds } };
    } else where.employee = { reportingToId: await this.myEmployeeId(user) };
    const rows = await this.prisma.leaveCredit.findMany({
      where,
      orderBy: [{ expiresOn: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
      take: 500,
      include: {
        allocations: { select: { days: true } },
        leaveType: { select: { name: true } },
        employee: { select: { employeeCode: true, profile: { select: { name: true, lastName: true } } } },
      },
    });
    const todayStr = today();
    const soon = isoAdd(todayStr, 7);
    return rows.map((c) => {
      const quantity = num(c.quantity);
      const remaining = num(c.remaining);
      const used = round2(c.allocations.reduce((sum, a) => sum + num(a.days), 0));
      const expiresOn = c.expiresOn ? toIsoDate(c.expiresOn) : null;
      const past = expiresOn !== null && expiresOn < todayStr;
      // Expired: the date has passed. Whatever was not used is lost (the nightly job zeroes it, so work it out from what was used).
      const lost = past ? round2(Math.max(0, remaining > 0 ? remaining : quantity - used)) : 0;
      let state: 'ACTIVE' | 'EXPIRING' | 'USED' | 'EXPIRED';
      if (past && lost > 0) state = 'EXPIRED';
      else if (remaining <= 0) state = 'USED';
      else if (expiresOn !== null && expiresOn <= soon) state = 'EXPIRING';
      else state = 'ACTIVE';
      const daysLeft = expiresOn && !past ? Math.round((new Date(`${expiresOn}T00:00:00Z`).getTime() - new Date(`${todayStr}T00:00:00Z`).getTime()) / 86_400_000) : null;
      return {
        id: c.id,
        employeeId: c.employeeId,
        employeeCode: c.employee.employeeCode,
        employeeName: [c.employee.profile.name, c.employee.profile.lastName].filter(Boolean).join(' '),
        leaveType: c.leaveType.name,
        workedOn: c.sourceRef,
        creditedOn: toIsoDate(c.creditedOn),
        expiresOn,
        daysLeft,
        quantity,
        used,
        remaining: past ? 0 : remaining,
        lost,
        state,
      };
    });
  }

  /* ------------------------------------------------------------------ accrual, expiry, adjustments, comp off */

  /** One credit with its ledger row. Returns false when the same credit already exists (so running twice adds nothing). */
  private async creditOnce(e: { employeeId: number; leaveTypeId: number }, days: number, creditedOn: string, expiresOn: string | null, ref: string, note: string, userId?: number) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.leaveCredit.create({ data: { ...e, quantity: days, remaining: days, creditedOn: parseIsoDate(creditedOn)!, expiresOn: expiresOn ? parseIsoDate(expiresOn) : null, source: 'ACCRUAL', sourceRef: ref, createdById: userId } });
        await tx.leaveTransaction.create({ data: { ...e, kind: 'CREDIT', days, note, createdById: userId } });
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  /**
   * Credits the leave year (annual types) or each month so far (monthly types). Employees covered by a leave policy get
   * what the policy works out (proration, service slabs, rounding); the rest use the leave type's own setting.
   * Running it twice credits nothing more.
   */
  async runAccrual(user: CurrentUserPayload | null, asOf = today()) {
    const settings = await this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const defaultYear = leaveYear(asOf, settings.leaveYearStartMonth);
    const types = await this.prisma.leaveType.findMany({ where: { isActive: true, balanceTracking: true, isCompOff: false } });
    const facts = await this.entitlement.facts();
    let credited = 0;
    let skipped = 0;
    const count = (ok: boolean) => (ok ? credited++ : skipped++);
    for (const t of types) {
      // A leave type can have its own calendar (starting in another month); otherwise it follows the company leave year.
      const year = t.calendarStartMonth ? leaveYear(asOf, t.calendarStartMonth) : defaultYear;
      const monthIndex = (Number(asOf.slice(0, 4)) - Number(year.start.slice(0, 4))) * 12 + Number(asOf.slice(5, 7)) - Number(year.start.slice(5, 7));
      // The days end with the calendar (the balance is reset), unless this type is set never to reset.
      const expiry = t.resetBalance ? year.end : null;
      const policies = await this.entitlement.load(t.id);
      for (const e of facts) {
        if (e.joinDate > asOf) continue;
        const key = { employeeId: e.id, leaveTypeId: t.id };
        const calc = this.entitlement.compute(this.entitlement.resolve(policies, e, asOf), e, year.start);
        if (calc) {
          const { winner, result } = calc;
          await this.entitlement.record(e.id, t.id, year.start, winner, e, result);
          if (winner.creditMethod === 'UPFRONT') {
            if (result.quantity > 0) count(await this.creditOnce(key, result.quantity, year.start, expiry, `P:${year.label}`, `${t.name} ${year.label}`, user?.profileId));
          } else if (winner.creditMethod === 'MONTHLY' || winner.creditMethod === MONTHLY_LUMP) {
            // Monthly. With the confirmation rule, the month the person is confirmed in this year brings every remaining month forward.
            const upTo = lastMonthToCredit({ currentMonthIndex: monthIndex, creditMethod: winner.creditMethod, confirmedOn: e.confirmedOn, asOf, yearStart: year.start, yearEnd: year.end });
            const schedule = this.entitlement.monthlySchedule(result, winner.input.rounding, winner.input.tie ?? 'UP', upTo, year.start);
            for (let k = 0; k < schedule.length; k++) {
              if (schedule[k] <= 0) continue;
              const on = addMonthsIso(year.start, k);
              // A month that is not yet due is credited today; its reference is still that month's, so nothing is ever credited twice.
              const creditedOn = k > monthIndex ? asOf : on;
              const lumped = k > monthIndex;
              count(await this.creditOnce(key, schedule[k], creditedOn, expiry, `P:${year.label}:${on.slice(0, 7)}`, lumped ? `${t.name} ${on.slice(0, 7)} (on confirmation)` : `${t.name} ${on.slice(0, 7)}`, user?.profileId));
            }
          }
          continue;
        }
        if (t.accrual !== 'ANNUAL' && t.accrual !== 'MONTHLY') continue;
        // No policy covered them, so fall back to the type's own setting — only when the type applies to their country.
        if (t.countryCodes.length && !(e.countryCode && t.countryCodes.includes(e.countryCode))) continue;
        const monthly = t.accrual === 'MONTHLY';
        const days = monthly ? monthlyCredit(num(t.annualDays)) : num(t.annualDays);
        if (days <= 0) continue;
        const ref = monthly ? asOf.slice(0, 7) : year.label;
        count(await this.creditOnce(key, days, monthly ? `${asOf.slice(0, 7)}-01` : year.start, expiry, ref, `${t.name} ${ref}`, user?.profileId));
      }
    }
    if (user) await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_ACCRUAL_RUN', entityType: 'LeaveCredit', entityId: asOf, metadata: { credited, skipped } });
    return { asOf, leaveYear: defaultYear.label, credited, alreadyCredited: skipped };
  }

  /** Balance that has passed its expiry date is closed, with a record of what expired. */
  async expireCredits(): Promise<number> {
    const due = await this.prisma.leaveCredit.findMany({ where: { remaining: { gt: 0 }, expiresOn: { lt: parseIsoDate(today())! } }, include: { leaveType: { select: { carryForwardType: true, carryForwardRules: true, calendarStartMonth: true, name: true } } } });
    const settings = await this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    // The employee category decides what carrying forward means (see the leave type's carry forward rules).
    const categories = await this.employeeCategories([...new Set(due.map((c) => c.employeeId))]);
    for (const c of due) {
      let carry = c.source === 'ACCRUAL' && c.leaveType.carryForwardType === 'CARRY_FORWARD';
      if (carry) {
        const rule = pickCarryRule((c.leaveType.carryForwardRules as unknown as CarryRule[]) ?? [], categories.get(c.employeeId) ?? null);
        const days = num(c.remaining);
        if (rule.action === 'LAPSE') carry = false;
        else if (rule.action === 'UNPAID_LEAVE' && rule.targetLeaveTypeId) {
          // The days stop being this leave and become days of the unpaid leave type, valid to the end of its current calendar period.
          const target = await this.prisma.leaveType.findUnique({ where: { id: rule.targetLeaveTypeId } });
          if (target) {
            const until = target.resetBalance ? leaveYear(today(), target.calendarStartMonth ?? settings.leaveYearStartMonth).end : null;
            await this.prisma.$transaction([
              this.prisma.leaveCredit.update({ where: { id: c.id }, data: { remaining: 0 } }),
              this.prisma.leaveTransaction.create({ data: { employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, kind: 'CARRY_FORWARD', days: -days, note: `Carried forward ${days} day(s) from ${toIsoDate(c.expiresOn!)} as ${target.name} (unpaid)` } }),
              this.prisma.leaveCredit.upsert({
                where: { employeeId_leaveTypeId_source_sourceRef: { employeeId: c.employeeId, leaveTypeId: target.id, source: 'ACCRUAL', sourceRef: `CF:${c.id}` } },
                create: { employeeId: c.employeeId, leaveTypeId: target.id, quantity: days, remaining: days, creditedOn: parseIsoDate(today())!, expiresOn: until ? parseIsoDate(until)! : null, source: 'ACCRUAL', sourceRef: `CF:${c.id}`, note: `Carried forward from ${c.leaveType.name}` },
                update: {},
              }),
              this.prisma.leaveTransaction.create({ data: { employeeId: c.employeeId, leaveTypeId: target.id, kind: 'CREDIT', days, note: `Carried forward from ${c.leaveType.name}` } }),
            ]);
            continue;
          }
          carry = false;
        } else if (rule.action === 'LEAVE_SALARY') {
          // Paid out instead of kept: the days leave the balance and a LEAVE_SALARY entry is left for payroll to pay.
          await this.prisma.$transaction([
            this.prisma.leaveCredit.update({ where: { id: c.id }, data: { remaining: 0 } }),
            this.prisma.leaveTransaction.create({ data: { employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, kind: 'LEAVE_SALARY', days: -days, note: `${days} day(s) from ${toIsoDate(c.expiresOn!)} to be paid as leave salary` } }),
          ]);
          continue;
        }
      }
      // A leave type set to carry forward keeps the unused days of its own credits: they move on to the end of the calendar period we are in now.
      if (carry) {
        const next = leaveYear(today(), c.leaveType.calendarStartMonth ?? settings.leaveYearStartMonth).end;
        await this.prisma.$transaction([
          this.prisma.leaveCredit.update({ where: { id: c.id }, data: { expiresOn: parseIsoDate(next)! } }),
          this.prisma.leaveTransaction.create({ data: { employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, kind: 'CARRY_FORWARD', days: 0, note: `Carried forward ${num(c.remaining)} day(s) from ${toIsoDate(c.expiresOn!)} to ${next}` } }),
        ]);
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.leaveCredit.update({ where: { id: c.id }, data: { remaining: 0 } }),
        this.prisma.leaveTransaction.create({ data: { employeeId: c.employeeId, leaveTypeId: c.leaveTypeId, kind: 'EXPIRY', days: -num(c.remaining), note: `Expired on ${toIsoDate(c.expiresOn!)}` } }),
      ]);
    }
    return due.length;
  }

  /** The Employee Category (from the employment section of the profile) for each employee. */
  private async employeeCategories(employeeIds: number[]): Promise<Map<number, string>> {
    const rows = await this.prisma.employeeProfileSection.findMany({ where: { sectionKey: 'employment', employeeId: { in: employeeIds } }, select: { employeeId: true, data: true } });
    const out = new Map<number, string>();
    for (const r of rows) {
      const v = (r.data as { employeeCategory?: unknown } | null)?.employeeCategory;
      if (typeof v === 'string' && v) out.set(r.employeeId, v);
    }
    return out;
  }

  /** HR adds days (a credit with an optional expiry) or takes days away (earliest-expiring first). */
  async adjust(user: CurrentUserPayload, dto: AdjustBalanceDto, ip?: string) {
    if (!HR_TYPES.includes(user.userTypeId)) throw new ForbiddenException('Only HR can adjust a balance');
    await this.assertMayDecide(user, dto.employeeId);
    const type = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!type || !type.balanceTracking) throw new BadRequestException('That leave type does not keep a balance');
    if (!dto.days) throw new BadRequestException('Enter the number of days to add or take away');
    await this.prisma.$transaction(async (tx) => {
      if (dto.days > 0) {
        await tx.leaveCredit.create({ data: { employeeId: dto.employeeId, leaveTypeId: type.id, quantity: dto.days, remaining: dto.days, creditedOn: parseIsoDate(today())!, expiresOn: dto.expiresOn ? parseIsoDate(dto.expiresOn) : null, source: 'MANUAL', note: dto.note, createdById: user.profileId } });
      } else {
        const credits = (await tx.leaveCredit.findMany({ where: { employeeId: dto.employeeId, leaveTypeId: type.id, remaining: { gt: 0 } } })).map((c) => ({ id: c.id, remaining: num(c.remaining), expiresOn: c.expiresOn ? toIsoDate(c.expiresOn) : null }));
        const { allocations, shortfall } = allocateFefo(credits, -dto.days);
        if (shortfall > 0) throw new BadRequestException(`The balance only has ${-dto.days - shortfall} day(s) to take away`);
        for (const a of allocations) await tx.leaveCredit.update({ where: { id: a.creditId }, data: { remaining: { decrement: a.days } } });
      }
      await tx.leaveTransaction.create({ data: { employeeId: dto.employeeId, leaveTypeId: type.id, kind: 'ADJUSTMENT', days: dto.days, note: dto.note, createdById: user.profileId } });
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_BALANCE_ADJUSTED', entityType: 'Employee', entityId: String(dto.employeeId), ipAddress: ip, metadata: { type: type.code, days: dto.days } });
    return this.balances(dto.employeeId);
  }

  /** Active employees in a branch, a country (from the Organization tab) or the whole company, within what the caller may see. */
  async groupEmployees(user: CurrentUserPayload, scope: string, branchId?: number, countryCode?: string, siteId?: number): Promise<number[]> {
    if (!HR_TYPES.includes(user.userTypeId)) throw new ForbiddenException('Only HR can change balances');
    if (scope === 'BRANCH' && !branchId) throw new BadRequestException('Choose a branch');
    if (scope === 'SITE' && !siteId) throw new BadRequestException('Choose a site');
    const country = (countryCode ?? '').trim().toUpperCase();
    if (scope === 'COUNTRY' && !country) throw new BadRequestException('Choose a country');
    const facts = await this.entitlement.facts();
    return facts
      .filter((f) => (!user.branchAccess || (f.branchId !== null && user.branchAccess.includes(f.branchId))) && (scope === 'COMPANY' || (scope === 'BRANCH' ? f.branchId === branchId : scope === 'SITE' ? f.siteId === siteId : f.countryCode === country)))
      .map((f) => f.id);
  }

  async groupCount(user: CurrentUserPayload, scope: string, branchId?: number, countryCode?: string, siteId?: number) {
    return { count: (await this.groupEmployees(user, scope, branchId, countryCode, siteId)).length };
  }

  /** The same adjustment for each person in the group, one at a time; says who it could not be done for. */
  async adjustGroup(user: CurrentUserPayload, dto: AdjustGroupDto, ip?: string) {
    const ids = await this.groupEmployees(user, dto.scope, dto.branchId, dto.countryCode, dto.siteId);
    if (!ids.length) throw new BadRequestException('There are no active employees in that group');
    const codes = new Map((await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, employeeCode: true } })).map((e) => [e.id, e.employeeCode]));
    const failed: { employeeId: number; code: string; reason: string }[] = [];
    let done = 0;
    for (const employeeId of ids) {
      try {
        await this.adjust(user, { employeeId, leaveTypeId: dto.leaveTypeId, days: dto.days, note: dto.note, expiresOn: dto.expiresOn }, ip);
        done += 1;
      } catch (e) {
        failed.push({ employeeId, code: codes.get(employeeId) ?? String(employeeId), reason: (e as Error).message });
      }
    }
    await this.audit.log({ actorProfileId: user.profileId, action: 'LEAVE_BALANCE_ADJUSTED_GROUP', entityType: 'LeaveType', entityId: String(dto.leaveTypeId), ipAddress: ip, metadata: { scope: dto.scope, branchId: dto.branchId ?? null, siteId: dto.siteId ?? null, countryCode: dto.countryCode ?? null, days: dto.days, done, failed: failed.length } });
    return { total: ids.length, done, failed };
  }

  /** Employee's ledger: every credit, usage, expiry and adjustment. */
  async ledger(employeeId: number, leaveTypeId?: number) {
    const rows = await this.prisma.leaveTransaction.findMany({ where: { employeeId, ...(leaveTypeId ? { leaveTypeId } : {}) }, orderBy: { createdAt: 'desc' }, take: 200, include: { leaveType: { select: { name: true } } } });
    return rows.map((r) => ({ id: r.id, kind: r.kind, days: num(r.days), leaveType: r.leaveType.name, note: r.note, createdAt: r.createdAt }));
  }

  async ledgerFor(user: CurrentUserPayload, employeeId: number | undefined, leaveTypeId?: number) {
    if (!employeeId) return this.ledger(await this.myEmployeeId(user), leaveTypeId);
    await this.assertMayDecide(user, employeeId);
    return this.ledger(employeeId, leaveTypeId);
  }

  /**
   * Comp off is normally credited the moment a manager approves the day (the "Eligible for comp off"
   * checkbox in AttendanceService.edit), not by this scan. Kept as a manual backfill for days approved
   * before that checkbox existed, or missed for any other reason. One credit per day, safe to run again.
   */
  async syncCompOff(sinceDays = 45): Promise<number> {
    const settings = await this.prisma.leaveSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    if (!settings.compOffEnabled) return 0;
    const type = await this.prisma.leaveType.findFirst({ where: { isCompOff: true, isActive: true } });
    if (!type) return 0;
    const since = parseIsoDate(isoAdd(today(), -sinceDays))!;
    const days = await this.prisma.attendance.findMany({ where: { date: { gte: since }, statusCode: { in: ['WORKED_ON_HOLIDAY', 'WORKED_ON_WEEKLY_OFF'] }, approvedAt: { not: null }, workedMinutes: { gte: settings.compOffMinWorkedMinutes } }, select: { employeeId: true, date: true } });
    let granted = 0;
    for (const d of days) {
      const iso = toIsoDate(d.date);
      try {
        await this.prisma.$transaction(async (tx) => {
          const q = num(settings.compOffCreditDays);
          await tx.leaveCredit.create({ data: { employeeId: d.employeeId, leaveTypeId: type.id, quantity: q, remaining: q, creditedOn: parseIsoDate(today())!, expiresOn: compOffExpiry(today(), settings.compOffExpiryDays) ? parseIsoDate(compOffExpiry(today(), settings.compOffExpiryDays)!) : null, source: 'COMP_OFF', sourceRef: iso, note: `Worked on ${iso}` } });
          await tx.leaveTransaction.create({ data: { employeeId: d.employeeId, leaveTypeId: type.id, kind: 'CREDIT', days: q, note: `Comp off for ${iso}` } });
        });
        granted++;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    return granted;
  }

  /** Nightly housekeeping: expire old balance, and credit a new month or year when it starts. Comp off is credited at approval time, not here. */
  @Cron('30 2 * * *')
  async nightly() {
    try {
      const expired = await this.expireCredits();
      const acc = await this.runAccrual(null);
      this.logger.log(`Leave nightly: ${expired} expired, ${acc.credited} credited`);
    } catch (e) {
      this.logger.error(`Leave nightly failed: ${(e as Error).message}`);
    }
  }
}

export type { CalcResult };
