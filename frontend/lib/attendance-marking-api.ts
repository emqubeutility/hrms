import { request } from './api';

export interface AttendanceRecord {
  id: string;
  employeeId: number;
  date: string;
  statusCode: string;
  statusName: string;
  statusColor: string;
  isPresent: boolean;
  firstInAt: string | null;
  lastOutAt: string | null;
  lateMinutes: number;
  workedMinutes: number | null;
  approved: boolean;
  source: string;
  remarks: string | null;
  /** Only set on the response to an edit/approve call. */
  compOffGranted?: boolean;
  compOffRemoved?: boolean;
}

export interface AttendanceRow extends AttendanceRecord {
  timeZone: string;
  inLocal: string | null;
  outLocal: string | null;
  employeeCode: string;
  employeeName: string;
  /** A comp off credit already exists for this day. */
  hasCompOff: boolean;
}

export interface TodayState {
  date: string;
  timeZone: string;
  localTime: string;
  next: 'IN' | 'OUT';
  canMark: boolean;
  blockedReason: string | null;
  settings: { moodEnabled: boolean; gpsRequirement: 'OFF' | 'OPTIONAL' | 'REQUIRED'; addressRequirement: 'OFF' | 'OPTIONAL' | 'REQUIRED'; moods: string[] };
  record: AttendanceRecord | null;
  punches: { type: 'IN' | 'OUT'; at: string; source: string }[];
}

export interface AttendanceStatus {
  code: string;
  name: string;
  color: string;
  sortOrder: number;
  category: string;
  skipsLateRule: boolean;
  clearsPunches: boolean;
  isActive: boolean;
}

export const getToday = () => request<TodayState>('/attendance/today');
export const markAttendance = (p: { coordinates?: string; address?: string; mood?: string; date?: string }) =>
  request<TodayState>('/attendance/mark', { method: 'POST', body: JSON.stringify(p) });
export const getStatuses = () => request<AttendanceStatus[]>('/attendance/statuses');
export const getMyAttendance = (from: string, to: string) => request<AttendanceRow[]>(`/attendance/records/me?from=${from}&to=${to}`);
export const getTeamAttendance = (from: string, to: string, employeeId?: number) =>
  request<AttendanceRow[]>(`/attendance/records/team?from=${from}&to=${to}${employeeId ? `&employeeId=${employeeId}` : ''}`);
export const editAttendance = (employeeId: number, date: string, p: { inTime?: string; outTime?: string; statusCode?: string; remarks?: string; compOffEligible?: boolean }) =>
  request<AttendanceRecord>(`/attendance/records/${employeeId}/${date}`, { method: 'PUT', body: JSON.stringify(p), silent: true });

/* ------------------------------------------------------------------ configuration (System Admin) */

export interface Policy {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  version: number;
  lateEnabled: boolean;
  halfDayEnabled: boolean;
  allowPastDateSelfMarking: boolean;
  applyLateRulesToPastDates: boolean;
  selfMarkCutoffTime: string | null;
  cutoffExemptHr: boolean;
  managerEditsOnlyUnapproved: boolean;
  requiresApproval: boolean;
  useRamadanShiftStart: boolean;
  shortHoursEnabled: boolean;
  shortHoursGraceMinutes: number;
  overtimeEnabled: boolean;
  overtimeAfterMinutes: number;
  assignments: PolicyAssignment[];
}
export interface PolicyAssignment {
  id: number;
  scope: 'COUNTRY' | 'BRANCH' | 'EMPLOYEE';
  countryCode: string | null;
  branchId: number | null;
  branchName: string | null;
  employeeId: number | null;
  employeeName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}
export type PolicyPayload = Omit<Policy, 'id' | 'version' | 'assignments' | 'code'> & { code?: string };

export interface AttendanceConfig {
  statuses: AttendanceStatus[];
  settings: { moodEnabled: boolean; gpsRequirement: 'OFF' | 'OPTIONAL' | 'REQUIRED'; addressRequirement: 'OFF' | 'OPTIONAL' | 'REQUIRED' };
  countries: { isoCode: string; name: string; defaultTimezone: string }[];
  branches: { id: number; name: string; timezone: string | null }[];
  ramadan: { id: number; countryCode: string; startDate: string; endDate: string }[];
  policies: Policy[];
}

export const getAttendanceConfig = () => request<AttendanceConfig>('/attendance-config');
export const createPolicy = (p: PolicyPayload) => request<Policy>('/attendance-config/policies', { method: 'POST', body: JSON.stringify(p) });
export const updatePolicy = (id: number, p: PolicyPayload) => request<Policy>(`/attendance-config/policies/${id}`, { method: 'PUT', body: JSON.stringify(p) });
export const assignPolicy = (id: number, p: { scope: string; countryCode?: string; branchId?: number; employeeId?: number; effectiveFrom: string; effectiveTo?: string }) =>
  request<unknown>(`/attendance-config/policies/${id}/assignments`, { method: 'POST', body: JSON.stringify(p) });
export const deletePolicy = (id: number) => request<null>(`/attendance-config/policies/${id}`, { method: 'DELETE' });
export const unassignPolicy = (assignmentId: number) => request<null>(`/attendance-config/assignments/${assignmentId}`, { method: 'DELETE' });
export const addRamadan = (p: { countryCode: string; startDate: string; endDate: string }) => request<unknown>('/attendance-config/ramadan', { method: 'POST', body: JSON.stringify(p) });
export const removeRamadan = (id: number) => request<null>(`/attendance-config/ramadan/${id}`, { method: 'DELETE' });
export const saveAttendanceSettings = (p: AttendanceConfig['settings']) => {
  const { moodEnabled, gpsRequirement, addressRequirement } = p;
  return request<unknown>('/attendance-config/settings', { method: 'PUT', body: JSON.stringify({ moodEnabled, gpsRequirement, addressRequirement }) });
};
export const saveAttendanceStatus = (code: string, p: { name?: string; color?: string; isActive?: boolean }) => request<unknown>(`/attendance-config/statuses/${code}`, { method: 'PUT', body: JSON.stringify(p) });

/* ------------------------------------------------------------------ helpers */

export const minutesText = (m: number | null | undefined) => (m === null || m === undefined ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

/* ------------------------------------------------------------------ corrections, reports, daily processing */

export interface Regularization {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  date: string;
  requestedIn: string | null;
  requestedOut: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionNote: string | null;
  createdAt: string;
}

export const requestCorrection = (p: { date: string; inTime?: string; outTime?: string; reason: string }) => request<Regularization>('/attendance/regularizations', { method: 'POST', body: JSON.stringify(p) });
export const getMyCorrections = () => request<Regularization[]>('/attendance/regularizations/me');
export const getTeamCorrections = (status?: string) => request<Regularization[]>(`/attendance/regularizations/team${status ? `?status=${status}` : ''}`);
export const cancelCorrection = (id: number) => request<null>(`/attendance/regularizations/${id}/cancel`, { method: 'PUT' });
export const decideCorrection = (id: number, approve: boolean, note?: string) => request<null>(`/attendance/regularizations/${id}/decision`, { method: 'PUT', body: JSON.stringify({ approve, note }) });

export interface SummaryRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  days: Record<string, number>;
  lateDays: number;
  lateMinutes: number;
  workedMinutes: number;
  shortMinutes: number;
  overtimeMinutes: number;
  pending: number;
}
export type ExceptionKind = 'late' | 'short' | 'overtime' | 'missing-punch' | 'absent' | 'pending';
export interface ExceptionRow {
  date: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  statusName: string;
  statusColor: string;
  firstInAt: string | null;
  lastOutAt: string | null;
  lateMinutes: number;
  workedMinutes: number | null;
  requiredMinutes: number | null;
  shortMinutes: number;
  overtimeMinutes: number;
  approved: boolean;
}
export const getAttendanceSummary = (from: string, to: string) => request<{ statuses: { code: string; name: string; color: string }[]; rows: SummaryRow[]; truncated: boolean }>(`/attendance/reports/summary?from=${from}&to=${to}`);
export const getAttendanceExceptions = (kind: ExceptionKind, from: string, to: string) => request<ExceptionRow[]>(`/attendance/reports/exceptions?kind=${kind}&from=${from}&to=${to}`);

export interface ProcessingRun {
  id: number;
  fromDate: string;
  toDate: string;
  trigger: string;
  createdDays: number;
  updatedDays: number;
  skippedDays: number;
  startedAt: string;
  finishedAt: string | null;
  errors?: { employeeId: number; date: string; message: string }[];
}
export const runProcessing = (from: string, to: string) => request<ProcessingRun>('/attendance/process', { method: 'POST', body: JSON.stringify({ from, to }) });
export const getProcessingRuns = () => request<ProcessingRun[]>('/attendance/process/runs');

/** Downloads rows as a CSV file (values are quoted, so commas and quotes are safe). */
export function downloadCsv(fileName: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
