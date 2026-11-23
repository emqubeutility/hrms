import { request } from './api';

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  isPaid: boolean;
  balanceTracking: boolean;
  accrual: 'NONE' | 'ANNUAL' | 'MONTHLY';
  annualDays: string | number;
  allowHalfDay: boolean;
  allowNegative: boolean;
  requiresDocument: boolean;
  documentAfterDays: number;
  maxDaysPerRequest: number | null;
  isSandwichEligible: boolean;
  requiresApproval: boolean;
  isEncashable: boolean;
  excludeWeeklyOffs: boolean;
  excludeHolidays: boolean;
  resetBalance: boolean;
  carryForwardType: 'NONE' | 'CARRY_FORWARD';
  /** What carrying forward means per Employee Category. */
  carryForwardRules: CarryRule[];
  genderRestriction: string | null;
  maxTimesInService: number | null;
  eventWindowMonths: number | null;
  eventLabel: string | null;
  payPercent: number;
  /** Leave type ids whose balance must be used up before this one is available. */
  unlockAfterTypeIds: number[];
  /** Month (1-12) this type's calendar starts in; null = the company leave year. */
  calendarStartMonth: number | null;
  isCompOff: boolean;
  isActive: boolean;
  /** Country.isoCode values this type applies to. Empty = every country. */
  countryCodes: string[];
}
export interface CarryRule {
  /** Employee Category text; empty = everyone else. */
  category: string;
  action: 'KEEP' | 'UNPAID_LEAVE' | 'LEAVE_SALARY' | 'LAPSE';
  targetLeaveTypeId?: number | null;
}
export type LeaveTypePayload = Omit<LeaveType, 'id'>;

export interface LeaveSettings {
  sandwichEnabled: boolean;
  sandwichWeeklyOffs: boolean;
  sandwichHolidays: boolean;
  sandwichRequireBothSides: boolean;
  leaveYearStartMonth: number;
  compOffEnabled: boolean;
  compOffCreditDays: string | number;
  compOffExpiryDays: number | null;
  compOffMinWorkedMinutes: number;
}

export interface LeaveBalance {
  leaveTypeId: number;
  code: string;
  name: string;
  isPaid: boolean;
  balanceTracking: boolean;
  balance: number;
  pending: number;
  available: number;
  nextExpiry: string | null;
}

export interface CalcDay {
  date: string;
  kind: 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY';
  days: number;
  reason: 'LEAVE' | 'HALF_DAY' | 'OFF_NOT_COUNTED' | 'SANDWICH_WEEKLY_OFF' | 'SANDWICH_HOLIDAY';
}

export interface LeavePreview {
  requestedDays: number;
  sandwichDays: number;
  totalDays: number;
  days: CalcDay[];
  leaveType: { id: number; name: string; isPaid: boolean };
  /** false = the leave is approved the moment it is sent. */
  requiresApproval?: boolean;
  available: number | null;
  enough: boolean;
  warnings: string[];
}

export interface LeaveApplication {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  leaveType: { id: number; code: string; name: string; isPaid: boolean };
  fromDate: string;
  toDate: string;
  halfDayPart: string | null;
  requestedDays: number;
  sandwichDays: number;
  totalDays: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  decisionNote: string | null;
  createdAt: string;
  calculation: CalcDay[];
}

export interface LedgerRow {
  id: number;
  kind: string;
  days: number;
  leaveType: string;
  note: string | null;
  createdAt: string;
}

export interface LeaveRequestPayload {
  leaveTypeId: number;
  fromDate: string;
  toDate: string;
  halfDayPart?: 'FIRST' | 'SECOND';
  eventDate?: string;
  reason?: string;
}

const json = (b: unknown) => JSON.stringify(b);

export const getLeaveTypes = () => request<LeaveType[]>('/leave/types');
/** Apply for leave: only the types that apply to my own country. */
export const getMyLeaveTypes = () => request<LeaveType[]>('/leave/types?scope=mine');
export const getMyBalances = () => request<LeaveBalance[]>('/leave/balances');
export interface CompOffRow {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  leaveType: string;
  /** The day that was worked. */
  workedOn: string | null;
  creditedOn: string;
  expiresOn: string | null;
  daysLeft: number | null;
  quantity: number;
  used: number;
  remaining: number;
  lost: number;
  state: 'ACTIVE' | 'EXPIRING' | 'USED' | 'EXPIRED';
}
export const getCompOff = (scope: 'me' | 'team') => request<CompOffRow[]>(`/leave/comp-off?scope=${scope}`);
export const getBalancesOf = (employeeId: number) => request<LeaveBalance[]>(`/leave/balances/${employeeId}`);
export const previewLeave = (p: LeaveRequestPayload) => request<LeavePreview>('/leave/preview', { method: 'POST', body: json(p) });
export const applyLeave = (p: LeaveRequestPayload) => request<LeaveApplication>('/leave/applications', { method: 'POST', body: json(p) });
export interface MyLeaveFilters {
  status?: string;
  leaveTypeId?: string;
  from?: string;
  to?: string;
}
export const getMyLeave = (f: MyLeaveFilters = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  const text = q.toString();
  return request<LeaveApplication[]>('/leave/applications/me' + (text ? '?' + text : ''));
};
export const getTeamLeave = (status?: string) => request<LeaveApplication[]>(`/leave/applications/team${status ? `?status=${status}` : ''}`);
export const decideLeave = (id: number, approve: boolean, note?: string) => request<null>(`/leave/applications/${id}/decision`, { method: 'PUT', body: json({ approve, note }) });
export const cancelLeave = (id: number) => request<null>(`/leave/applications/${id}/cancel`, { method: 'PUT' });
export const getLeaveCalendar = (from: string, to: string, scope: 'me' | 'team') => request<LeaveApplication[]>(`/leave/calendar?from=${from}&to=${to}&scope=${scope}`);
export const getLedger = (employeeId?: number) => request<LedgerRow[]>(`/leave/ledger${employeeId ? `?employeeId=${employeeId}` : ''}`);
export interface GroupTarget {
  scope: 'BRANCH' | 'COUNTRY' | 'COMPANY' | 'SITE';
  branchId?: number;
  siteId?: number;
  countryCode?: string;
}
export const getGroupCount = (t: GroupTarget) =>
  request<{ count: number }>(`/leave/adjust-group/count?scope=${t.scope}${t.branchId ? `&branchId=${t.branchId}` : ''}${t.siteId ? `&siteId=${t.siteId}` : ''}${t.countryCode ? `&countryCode=${encodeURIComponent(t.countryCode)}` : ''}`);
export const adjustGroup = (p: GroupTarget & { leaveTypeId: number; days: number; note: string; expiresOn?: string }) =>
  request<{ total: number; done: number; failed: { employeeId: number; code: string; reason: string }[] }>('/leave/adjust-group', { method: 'POST', body: json(p) });
export const adjustBalance = (p: { employeeId: number; leaveTypeId: number; days: number; note: string; expiresOn?: string }) => request<LeaveBalance[]>('/leave/adjust', { method: 'POST', body: json(p) });
export const runAccrual = (asOf?: string) => request<{ asOf: string; leaveYear: string; credited: number; alreadyCredited: number }>('/leave/accrual', { method: 'POST', body: json({ asOf }) });
export const syncCompOff = () => request<{ granted: number }>('/leave/comp-off/sync', { method: 'POST' });

export const getLeaveConfig = () => request<{ types: LeaveType[]; settings: LeaveSettings }>('/leave-config');
export const createLeaveType = (p: LeaveTypePayload) => request<LeaveType>('/leave-config/types', { method: 'POST', body: json(p) });
export const deleteLeaveType = (id: number) => request<null>(`/leave-config/types/${id}`, { method: 'DELETE' });
export const updateLeaveType = (id: number, p: LeaveTypePayload) => request<LeaveType>(`/leave-config/types/${id}`, { method: 'PUT', body: json(p) });
export const saveLeaveSettings = (p: LeaveSettings) => {
  const { sandwichEnabled, sandwichWeeklyOffs, sandwichHolidays, sandwichRequireBothSides, leaveYearStartMonth, compOffEnabled, compOffCreditDays, compOffExpiryDays, compOffMinWorkedMinutes } = p;
  return request<LeaveSettings>('/leave-config/settings', {
    method: 'PUT',
    body: json({ sandwichEnabled, sandwichWeeklyOffs, sandwichHolidays, sandwichRequireBothSides, leaveYearStartMonth, compOffEnabled, compOffCreditDays, compOffExpiryDays, compOffMinWorkedMinutes }),
  });
};

export const REASON_TEXT: Record<CalcDay['reason'], string> = {
  LEAVE: 'Leave',
  HALF_DAY: 'Half day',
  OFF_NOT_COUNTED: 'Off day (not counted)',
  SANDWICH_WEEKLY_OFF: 'Weekly off counted (sandwich)',
  SANDWICH_HOLIDAY: 'Holiday counted (sandwich)',
};
