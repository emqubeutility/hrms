import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Employee, getEmployees } from '../../lib/api';
import { AttendanceRow, AttendanceStatus, editAttendance, getStatuses, getTeamAttendance, minutesText } from '../../lib/attendance-marking-api';
import { UserType } from '../../lib/user-types';
import StatusBadge from '../../components/StatusBadge';
import Drawer, { fieldClass } from '../../components/Drawer';
import Select from '../../components/Select';

const monthStart = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
const MANAGER_STATUSES = ['PRESENT', 'ABSENT', 'NOT_FOUND_PRESENT'];
// Filter bar: one shared look for every control (labels above, same height).
const filterLabelClass = 'mb-1.5 block text-xs font-medium text-gray-600';
const filterFieldClass = 'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

interface Target {
  employeeId: number;
  employeeName: string;
  date: string;
  inTime: string;
  outTime: string;
  statusCode: string;
  remarks: string;
  isNew: boolean;
  compOffEligible: boolean;
  /** Comp off was already given for this day: the box starts ticked, and un-ticking takes it back. */
  hadCompOff: boolean;
  /** The day's status as it is now, to know whether comp off can apply. */
  currentStatus: string;
}

/** Managers approve and correct their team's unapproved days. HR can correct any day or add a missing one. */
export default function TeamAttendancePage() {
  const { isAuthenticated, user } = useAuth();
  const isHr = user?.userTypeId === UserType.SystemAdmin || user?.userTypeId === UserType.HRAdmin;

  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [statuses, setStatuses] = useState<AttendanceStatus[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const [empFilter, setEmpFilter] = useState<string[]>([]);
  // More filters: status, a range of days in the month, and quick checks.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dayFrom, setDayFrom] = useState('');
  const [dayTo, setDayTo] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyMissingOut, setOnlyMissingOut] = useState(false);
  const [onlyCompOff, setOnlyCompOff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const toast = useToast();
  /** Messages with real detail (counts, comp off) appear as toasts. */
  const setNotice = (m: string) => {
    if (m) toast.success(m);
  };
  const [edit, setEdit] = useState<Target | null>(null);
  const [saving, setSaving] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [emps, setEmps] = useState<Employee[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows((await getTeamAttendance(monthStart(month.y, month.m), monthEnd(month.y, month.m))).data);
    } catch (e: any) {
      setError(e.message || 'Could not load attendance');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
  }, [isAuthenticated, load]);
  useEffect(() => {
    if (isAuthenticated) getStatuses().then((r) => setStatuses(r.data)).catch(() => {});
  }, [isAuthenticated]);

  // Employee picker for "Add a day" (HR only).
  useEffect(() => {
    if (!isAuthenticated || !isHr || !edit?.isNew) return;
    const t = setTimeout(() => getEmployees({ pageSize: 25, isActive: true, ...(empSearch.trim() ? { search: empSearch.trim() } : {}) }).then((r) => setEmps(r.data)).catch(() => setEmps([])), 300);
    return () => clearTimeout(t);
  }, [isAuthenticated, isHr, edit?.isNew, empSearch]);

  const shown = useMemo(() => {
    return rows.filter(
      (r) =>
        (filter === 'all' || !r.approved) &&
        (empFilter.length === 0 || empFilter.includes(String(r.employeeId))) &&
        (statusFilter.length === 0 || statusFilter.includes(r.statusCode)) &&
        (!dayFrom || r.date >= dayFrom) &&
        (!dayTo || r.date <= dayTo) &&
        (!onlyLate || r.lateMinutes > 0) &&
        (!onlyMissingOut || (!!r.inLocal && !r.outLocal)) &&
        (!onlyCompOff || r.hasCompOff),
    );
  }, [rows, filter, empFilter, statusFilter, dayFrom, dayTo, onlyLate, onlyMissingOut, onlyCompOff]);
  const filtersOn = empFilter.length > 0 || filter !== 'all' || statusFilter.length > 0 || !!dayFrom || !!dayTo || onlyLate || onlyMissingOut || onlyCompOff;
  const clearFilters = () => { setEmpFilter([]); setFilter('all'); setStatusFilter([]); setDayFrom(''); setDayTo(''); setOnlyLate(false); setOnlyMissingOut(false); setOnlyCompOff(false); };
  const pending = rows.filter((r) => !r.approved).length;
  // The people who have days this month, for the employee filter.
  const empOptions = useMemo(() => {
    const seen = new Map<number, { value: string; label: string }>();
    for (const r of rows) if (!seen.has(r.employeeId)) seen.set(r.employeeId, { value: String(r.employeeId), label: `${r.employeeName} (${r.employeeCode})` });
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const label = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shiftMonth = (d: number) => setMonth((p) => { const n = new Date(Date.UTC(p.y, p.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  const open = (r: AttendanceRow) => { setError(''); setEdit({ employeeId: r.employeeId, employeeName: `${r.employeeName} (${r.employeeCode})`, date: r.date, inTime: r.inLocal ?? '', outTime: r.outLocal ?? '', statusCode: '', remarks: '', isNew: false, compOffEligible: r.hasCompOff, hadCompOff: r.hasCompOff, currentStatus: r.statusCode }); };
  const openNew = () => { setError(''); setEmpSearch(''); setEdit({ employeeId: 0, employeeName: '', date: new Date().toISOString().slice(0, 10), inTime: '', outTime: '', statusCode: '', remarks: '', isNew: true, compOffEligible: false, hadCompOff: false, currentStatus: '' }); };

  // Approving opens the same popup as Edit, so the manager can check the times and comp off before confirming.
  const approve = (r: AttendanceRow) => open(r);

  const save = async () => {
    if (!edit) return;
    if (!edit.employeeId) return setError('Choose an employee');
    setSaving(true);
    setError('');
    try {
      const original = rows.find((r) => r.employeeId === edit.employeeId && r.date === edit.date);
      const result = await editAttendance(edit.employeeId, edit.date, {
        // Only send times that were changed, so a plain status change keeps the punches.
        ...(edit.inTime && edit.inTime !== (original?.inLocal ?? '') ? { inTime: edit.inTime } : {}),
        ...(edit.outTime && edit.outTime !== (original?.outLocal ?? '') ? { outTime: edit.outTime } : {}),
        ...(edit.isNew && edit.inTime ? { inTime: edit.inTime } : {}),
        ...(edit.isNew && edit.outTime ? { outTime: edit.outTime } : {}),
        ...(edit.statusCode ? { statusCode: edit.statusCode } : {}),
        ...(edit.remarks.trim() ? { remarks: edit.remarks.trim() } : {}),
        // Only send the box when it can apply: ticked to give it, un-ticked to take back one that was given.
        ...(compOffApplies ? { compOffEligible: edit.compOffEligible } : {}),
      });
      setNotice(result.data.compOffGranted ? 'Attendance saved and approved. Comp off credited.' : result.data.compOffRemoved ? 'Attendance saved. Comp off removed.' : 'Attendance saved and approved');
      setEdit(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // Comp off applies to a day worked on a holiday or weekly off, or to a day that already has one (so it can be taken back).
  const compOffApplies = !!edit && (edit.hadCompOff || ['WORKED_ON_HOLIDAY', 'WORKED_ON_WEEKLY_OFF'].includes(edit.statusCode || edit.currentStatus));
  const allowed = statuses.filter((s) => s.isActive && (isHr || MANAGER_STATUSES.includes(s.code)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team attendance</h2>
          <p className="mt-1 text-gray-500">
            {isHr ? 'Everyone in your branches. HR can correct any day or add a missing one.' : 'The people who report to you. You can approve or correct days that are not approved yet.'}
          </p>
        </div>
        {isHr && <button type="button" onClick={openNew} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Add or correct a day</button>}
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50" aria-label="Previous month">←</button>
            <span className="min-w-[9rem] text-center text-sm font-semibold text-gray-900">{label}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50" aria-label="Next month">→</button>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm">
            <button type="button" onClick={() => setFilter('all')} className={`px-3.5 py-1.5 ${filter === 'all' ? 'bg-blue-600 font-medium text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>All days</button>
            <button type="button" onClick={() => setFilter('pending')} className={`border-l border-gray-300 px-3.5 py-1.5 ${filter === 'pending' ? 'bg-blue-600 font-medium text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              Pending approval <span className={`ml-1 rounded-full px-1.5 text-xs ${filter === 'pending' ? 'bg-white/20' : 'bg-amber-100 text-amber-800'}`}>{pending}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className={filterLabelClass}>Employees</p>
            <Select multiple aria-label="Employees" options={empOptions} values={empFilter} onValuesChange={setEmpFilter} placeholder="All employees" allText="All employees" noun="employees" className={filterFieldClass} />
          </div>
          <div>
            <p className={filterLabelClass}>Status</p>
            <Select
              multiple
              aria-label="Status"
              options={statuses.filter((x) => x.isActive).map((x) => ({ value: x.code, label: x.name }))}
              values={statusFilter}
              onValuesChange={setStatusFilter}
              placeholder="Any status"
              allText="Any status"
              noun="statuses"
              className={filterFieldClass}
            />
          </div>
          <label className="block">
            <span className={filterLabelClass}>From day</span>
            <input type="date" min={monthStart(month.y, month.m)} max={monthEnd(month.y, month.m)} value={dayFrom} onChange={(e) => setDayFrom(e.target.value)} className={filterFieldClass} />
          </label>
          <label className="block">
            <span className={filterLabelClass}>To day</span>
            <input type="date" min={dayFrom || monthStart(month.y, month.m)} max={monthEnd(month.y, month.m)} value={dayTo} onChange={(e) => setDayTo(e.target.value)} className={filterFieldClass} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <span className="mr-1 text-xs font-medium uppercase tracking-wider text-gray-500">Only</span>
          {([['Late', onlyLate, setOnlyLate], ['Missing OUT', onlyMissingOut, setOnlyMissingOut], ['Comp off given', onlyCompOff, setOnlyCompOff]] as const).map(([text, on, set]) => (
            <label key={text} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="sr-only" />
              {text}
            </label>
          ))}
          {filtersOn && (
            <button type="button" onClick={clearFilters} className="ml-1 text-sm font-medium text-blue-600 hover:text-blue-800">Clear all</button>
          )}
          <p className="ml-auto text-xs text-gray-500">{loading ? '' : `Showing ${shown.length} of ${rows.length} days`}</p>
        </div>
      </div>

      {error && !edit && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">In</th><th className="px-4 py-3">Out</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{filtersOn ? 'Nothing matches these filters.' : 'No attendance this month.'}</td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{new Date(`${r.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}</td>
                  <td className="px-4 py-3 text-gray-900">{r.employeeName} <span className="text-xs text-gray-400">{r.employeeCode}</span></td>
                  <td className="px-4 py-3"><StatusBadge name={r.statusName} color={r.statusColor} approved={r.approved} /></td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{r.inLocal ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{r.outLocal ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{r.lateMinutes ? `${r.lateMinutes} min` : '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{minutesText(r.workedMinutes)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!r.approved && <button type="button" onClick={() => approve(r)} className="mr-3 text-xs font-medium text-green-700 hover:text-green-900">Approve</button>}
                    {(isHr || !r.approved) ? <button type="button" onClick={() => open(r)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button> : <span className="text-xs text-gray-400">Approved</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Drawer
          title={edit.isNew ? 'Add or correct a day' : `Edit ${edit.date}`}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save and approve'}</button>
            </>
          }
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          {edit.isNew ? (
            <>
              <label className="block text-sm font-medium text-gray-700">Find employee
                <input type="search" className={fieldClass} placeholder="Name or code…" value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">Employee
                <Select className={fieldClass} value={edit.employeeId || ''} onChange={(e) => setEdit({ ...edit, employeeId: Number(e.target.value) })}>
                  <option value="">Select…</option>
                  {emps.map((e) => <option key={e.id} value={e.id}>{[e.profile?.name, e.profile?.lastName].filter(Boolean).join(' ')} ({e.employeeCode})</option>)}
                </Select>
              </label>
              <label className="block text-sm font-medium text-gray-700">Date
                <input type="date" className={fieldClass} value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
              </label>
            </>
          ) : (
            <p className="text-sm text-gray-600">{edit.employeeName}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">IN time<input type="time" className={fieldClass} value={edit.inTime} onChange={(e) => setEdit({ ...edit, inTime: e.target.value })} /></label>
            <label className="block text-sm font-medium text-gray-700">OUT time<input type="time" className={fieldClass} value={edit.outTime} onChange={(e) => setEdit({ ...edit, outTime: e.target.value })} /></label>
          </div>
          <p className="-mt-2 text-xs text-gray-500">Times are in the employee's own timezone. Late and half day are worked out again from the IN time.</p>
          <label className={`flex items-start gap-3 text-sm ${compOffApplies ? 'text-gray-700' : 'text-gray-400'}`}>
            <input type="checkbox" disabled={!compOffApplies} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" checked={compOffApplies && edit.compOffEligible} onChange={(e) => setEdit({ ...edit, compOffEligible: e.target.checked })} />
            <span>
              <span className="font-medium">Eligible for comp off</span>
              <span className="block text-xs text-gray-500">
                {edit.hadCompOff
                  ? 'Comp off was given for this day. Un-tick it and save to take it back (only if it has not been used).'
                  : compOffApplies
                    ? 'Credited the moment you approve.'
                    : 'Only for a day worked on a holiday or weekly off. Set the status to "Worked on holiday" or "Worked on weekly off" first.'}
              </span>
            </span>
          </label>
          <label className="block text-sm font-medium text-gray-700">Status
            <Select className={fieldClass} value={edit.statusCode} onChange={(e) => setEdit({ ...edit, statusCode: e.target.value })}>
              <option value="">Work it out from the times</option>
              {allowed.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </Select>
          </label>
          <label className="block text-sm font-medium text-gray-700">Remarks
            <input className={fieldClass} maxLength={150} value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} placeholder="Optional" />
          </label>
        </Drawer>
      )}
    </div>
  );
}
