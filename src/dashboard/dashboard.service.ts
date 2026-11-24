import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HR_USER_TYPES } from '../common/guards/hr-write.guard';
import { UserType } from '../common/constants/user-types';
import { AttendanceService } from '../attendance/attendance.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86_400_000));
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: Prisma.Decimal | number | null) => (d === null ? 0 : Number(d));

export interface NotificationItem {
  id: string;
  kind: 'LEAVE_DECISION' | 'CORRECTION_DECISION' | 'LEAVE_UPCOMING' | 'BALANCE_EXPIRING' | 'APPROVAL_WAITING' | 'DOCUMENT_EXPIRING';
  title: string;
  detail: string;
  href: string;
  at: string;
}

/** Numbers and notices for the home page. Everything is worked out from existing records. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  private isHr(u: CurrentUserPayload) {
    return HR_USER_TYPES.includes(u.userTypeId);
  }

  private async me(u: CurrentUserPayload) {
    return this.prisma.employee.findUnique({ where: { profileId: u.profileId }, select: { id: true, isActive: true } });
  }

  /** Employees this user looks after: HR sees everyone (within the chosen branches), a manager sees direct reports. */
  private async scope(u: CurrentUserPayload, meId: number | null): Promise<Prisma.EmployeeWhereInput | null> {
    if (this.isHr(u)) {
      const where: Prisma.EmployeeWhereInput = { isActive: true };
      if (u.activeBranchIds) where.branchId = { in: u.activeBranchIds };
      return where;
    }
    if (meId === null) return null;
    const hasReports = await this.prisma.employee.count({ where: { reportingToId: meId, isActive: true } });
    return hasReports ? { reportingToId: meId, isActive: true } : null;
  }

  async summary(u: CurrentUserPayload, todayStr = iso(new Date())) {
    const me = await this.me(u);
    const meId = me?.isActive ? me.id : null;
    const today = day(todayStr);

    const mine = meId === null ? null : await this.mineToday(meId, today, todayStr);
    const scope = await this.scope(u, meId);
    const team = scope ? await this.teamToday(scope, today, todayStr) : null;
    const hr = this.isHr(u) ? await this.hrNumbers(u, today, todayStr) : null;
    const charts = scope ? await this.charts(scope, todayStr) : null;
    return { today: todayStr, role: this.isHr(u) ? 'HR' : team ? 'MANAGER' : 'EMPLOYEE', mine, team, hr, charts };
  }

  /** Headcount at the end of each of the last six months, and how people are spread across departments. */
  private async charts(scope: Prisma.EmployeeWhereInput, todayStr: string) {
    const people = await this.prisma.employee.findMany({ where: scope, select: { id: true, dateOfJoining: true } });
    const months: { month: string; count: number }[] = [];
    const base = new Date(`${todayStr.slice(0, 7)}-01T00:00:00Z`);
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59));
      months.push({ month: iso(start).slice(0, 7), count: people.filter((p) => p.dateOfJoining <= end).length });
    }
    const sections = await this.prisma.employeeProfileSection.findMany({ where: { sectionKey: 'organization', employeeId: { in: people.map((p) => p.id) } }, select: { employeeId: true, data: true } });
    const byDept = new Map<string, number>();
    const seen = new Set<number>();
    for (const s of sections) {
      seen.add(s.employeeId);
      const dept = (s.data as { department?: unknown } | null)?.department;
      const name = typeof dept === 'string' && dept ? dept : 'Unassigned';
      byDept.set(name, (byDept.get(name) ?? 0) + 1);
    }
    const missing = people.length - seen.size;
    if (missing > 0) byDept.set('Unassigned', (byDept.get('Unassigned') ?? 0) + missing);
    const departments = [...byDept.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return { headcount: months, departments };
  }

  private async mineToday(employeeId: number, today: Date, todayStr: string) {
    const [att, credits, types, pending, next] = await Promise.all([
      this.prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today } }, include: { status: { select: { name: true } } } }),
      this.prisma.leaveCredit.findMany({ where: { employeeId, remaining: { gt: 0 }, OR: [{ expiresOn: null }, { expiresOn: { gte: today } }] }, select: { leaveTypeId: true, remaining: true } }),
      this.prisma.leaveType.findMany({ where: { isActive: true, balanceTracking: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.leaveApplication.count({ where: { employeeId, status: { in: ['PENDING', 'MANAGER_APPROVED'] } } }),
      this.prisma.leaveApplication.findFirst({ where: { employeeId, status: 'APPROVED', toDate: { gte: today } }, orderBy: { fromDate: 'asc' }, include: { leaveType: { select: { name: true } } } }),
    ]);
    const balances = types
      .map((t) => ({ leaveTypeId: t.id, name: t.name, balance: credits.filter((c) => c.leaveTypeId === t.id).reduce((s, c) => s + num(c.remaining), 0) }))
      .filter((b) => b.balance > 0);
    return {
      attendance: att ? { statusName: att.status.name, isPresent: att.isPresent, firstInAt: att.firstInAt, lastOutAt: att.lastOutAt, lateMinutes: att.lateMinutes } : null,
      balances,
      pendingLeave: pending,
      nextLeave: next ? { type: next.leaveType.name, from: iso(next.fromDate), to: iso(next.toDate), days: num(next.totalDays) } : null,
      date: todayStr,
    };
  }

  private async teamToday(scope: Prisma.EmployeeWhereInput, today: Date, todayStr: string) {
    const ids = (await this.prisma.employee.findMany({ where: scope, select: { id: true } })).map((e) => e.id);
    const [att, leave, leavePending, correctionsPending, toApprove] = await Promise.all([
      this.prisma.attendance.findMany({ where: { employeeId: { in: ids }, date: today }, select: { employeeId: true, isPresent: true, statusCode: true, lateMinutes: true } }),
      this.prisma.leaveApplication.findMany({ where: { employeeId: { in: ids }, status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today } }, select: { employeeId: true } }),
      this.prisma.leaveApplication.count({ where: { employeeId: { in: ids }, status: { in: ['PENDING', 'MANAGER_APPROVED'] } } }),
      this.prisma.attendanceRegularization.count({ where: { employeeId: { in: ids }, status: 'PENDING' } }),
      this.prisma.attendance.count({ where: { employeeId: { in: ids }, approvedAt: null, isPresent: true, date: { lt: today } } }),
    ]);
    const onLeave = new Set(leave.map((l) => l.employeeId));
    for (const a of att) if (a.statusCode === 'ON_LEAVE') onLeave.add(a.employeeId);
    const present = att.filter((a) => a.isPresent && !onLeave.has(a.employeeId));
    const accounted = new Set([...present.map((a) => a.employeeId), ...onLeave]);
    // People whose weekly off or holiday it is today and who did not come in: they are not expected, so they stay out of the rate.
    // Worked out per person, so it is skipped for a very large scope.
    let offToday = 0;
    if (ids.length <= 500) {
      for (const id of ids) {
        if (accounted.has(id)) continue;
        try {
          const { day } = await this.attendance.dayInfo(id, todayStr, null);
          if (day.holiday || day.roster.isWeeklyOff) offToday += 1;
        } catch {
          /* no roster information: treat as expected */
        }
      }
    }
    return {
      total: ids.length,
      offToday,
      present: present.length,
      late: present.filter((a) => a.lateMinutes > 0).length,
      onLeave: onLeave.size,
      notYetIn: ids.filter((i) => !accounted.has(i)).length,
      leaveWaiting: leavePending,
      correctionsWaiting: correctionsPending,
      attendanceToApprove: toApprove,
      date: todayStr,
    };
  }

  private async hrNumbers(u: CurrentUserPayload, today: Date, todayStr: string) {
    const base: Prisma.DocumentWhereInput = { isActive: true, documentType: { hasExpiry: true } };
    if (u.activeBranchIds) base.profile = { employee: { branchId: { in: u.activeBranchIds } } };
    const [expired, expiring] = await Promise.all([
      this.prisma.document.count({ where: { ...base, expiryDate: { lt: today } } }),
      this.prisma.document.count({ where: { ...base, expiryDate: { gte: today, lte: day(addDays(todayStr, 30)) } } }),
    ]);
    return { documentsExpired: expired, documentsExpiring: expiring };
  }

  /* ------------------------------------------------------------------ notifications */

  async notifications(u: CurrentUserPayload, todayStr = iso(new Date())): Promise<NotificationItem[]> {
    const me = await this.me(u);
    const meId = me?.isActive ? me.id : null;
    const today = day(todayStr);
    const since = new Date(Date.now() - 14 * 86_400_000);
    const nowIso = new Date().toISOString();
    const out: NotificationItem[] = [];

    if (meId !== null) {
      const [decided, corrections, upcoming, expiring] = await Promise.all([
        this.prisma.leaveApplication.findMany({ where: { employeeId: meId, status: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: since } }, include: { leaveType: { select: { name: true } } }, orderBy: { decidedAt: 'desc' }, take: 10 }),
        this.prisma.attendanceRegularization.findMany({ where: { employeeId: meId, status: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: since } }, orderBy: { decidedAt: 'desc' }, take: 10 }),
        this.prisma.leaveApplication.findMany({ where: { employeeId: meId, status: 'APPROVED', fromDate: { gte: today, lte: day(addDays(todayStr, 3)) } }, include: { leaveType: { select: { name: true } } }, take: 5 }),
        this.prisma.leaveCredit.findMany({ where: { employeeId: meId, remaining: { gt: 0 }, expiresOn: { gte: today, lte: day(addDays(todayStr, 14)) } }, include: { leaveType: { select: { name: true } } }, take: 5 }),
      ]);
      for (const a of decided) {
        const range = a.toDate.getTime() !== a.fromDate.getTime() ? `${iso(a.fromDate)} to ${iso(a.toDate)}` : iso(a.fromDate);
        out.push({ id: `leave-${a.id}`, kind: 'LEAVE_DECISION', title: `${a.leaveType.name} ${a.status === 'APPROVED' ? 'approved' : 'rejected'}`, detail: `${range}${a.decisionNote ? ` · ${a.decisionNote}` : ''}`, href: '/leave/my', at: (a.decidedAt ?? a.createdAt).toISOString() });
      }
      for (const r of corrections) out.push({ id: `corr-${r.id}`, kind: 'CORRECTION_DECISION', title: `Attendance correction ${r.status === 'APPROVED' ? 'approved' : 'rejected'}`, detail: `${iso(r.date)}${r.decisionNote ? ` · ${r.decisionNote}` : ''}`, href: '/attendance/my', at: (r.decidedAt ?? r.createdAt).toISOString() });
      for (const a of upcoming) out.push({ id: `soon-${a.id}`, kind: 'LEAVE_UPCOMING', title: `${a.leaveType.name} starts ${iso(a.fromDate)}`, detail: `${num(a.totalDays)} day${num(a.totalDays) === 1 ? '' : 's'}`, href: '/leave/my', at: nowIso });
      for (const c of expiring) out.push({ id: `exp-${c.id}`, kind: 'BALANCE_EXPIRING', title: `${num(c.remaining)} day${num(c.remaining) === 1 ? '' : 's'} of ${c.leaveType.name} expire ${iso(c.expiresOn as Date)}`, detail: 'Use them before they lapse', href: '/leave/my', at: nowIso });
    }

    const scope = await this.scope(u, meId);
    if (scope) {
      const ids = (await this.prisma.employee.findMany({ where: scope, select: { id: true } })).map((e) => e.id);
      const [leaveWaiting, corrWaiting] = await Promise.all([
        this.prisma.leaveApplication.count({ where: { employeeId: { in: ids }, status: { in: ['PENDING', 'MANAGER_APPROVED'] } } }),
        this.prisma.attendanceRegularization.count({ where: { employeeId: { in: ids }, status: 'PENDING' } }),
      ]);
      if (leaveWaiting) out.push({ id: 'wait-leave', kind: 'APPROVAL_WAITING', title: `${leaveWaiting} leave request${leaveWaiting === 1 ? '' : 's'} waiting`, detail: 'Waiting for your decision', href: '/leave/team', at: nowIso });
      if (corrWaiting) out.push({ id: 'wait-corr', kind: 'APPROVAL_WAITING', title: `${corrWaiting} attendance correction${corrWaiting === 1 ? '' : 's'} waiting`, detail: 'Waiting for your decision', href: '/attendance/corrections', at: nowIso });
    }
    if (this.isHr(u)) {
      const h = await this.hrNumbers(u, today, todayStr);
      if (h.documentsExpiring || h.documentsExpired) out.push({ id: 'docs', kind: 'DOCUMENT_EXPIRING', title: `${h.documentsExpired} expired, ${h.documentsExpiring} expiring documents`, detail: 'Expiring within 30 days', href: '/documents', at: nowIso });
    }
    if (u.userTypeId === UserType.SystemAdmin) {
      const lic = await this.prisma.systemConfiguration.findUnique({ where: { name: 'Trade Licence Expiry Date' }, select: { value: true } });
      if (lic?.value && /^\d{4}-\d{2}-\d{2}$/.test(lic.value)) {
        const days = Math.round((day(lic.value).getTime() - today.getTime()) / 86_400_000);
        if (days <= 60) out.push({ id: 'licence', kind: 'DOCUMENT_EXPIRING', title: days < 0 ? `Trade licence expired on ${lic.value}` : days === 0 ? 'Trade licence expires today' : `Trade licence expires in ${days} day${days === 1 ? '' : 's'} (${lic.value})`, detail: 'Renew it and update the date in System settings, Company', href: '/system-settings', at: nowIso });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }
}
