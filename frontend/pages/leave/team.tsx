import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import Select from '../../components/Select';
import CompOffList from '../../components/leave/CompOffList';
import { LEAVE_STATUS_LABEL, LeaveApplication, REASON_TEXT, decideLeave, getLeaveCalendar, getTeamLeave } from '../../lib/leave-api';
import LeaveDocumentsModal from '../../components/leave/LeaveDocumentsModal';
import Pagination from '../../components/Pagination';
import { usePagedRows } from '../../lib/usePagedRows';

type Tab = 'waiting' | 'calendar' | 'compoff';

const monthStart = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

/** Managers and HR: leave waiting for a decision, and who is off this month. */
export default function TeamLeavePage() {
  const { isAuthenticated, user } = useAuth();
  // HR confirms a leave after the manager has approved it; the manager's own approval is the first step.
  const isHr = !!user && [3, 4].includes(user.userTypeId);
  const [tab, setTab] = useState<Tab>('waiting');
  // Leave whose documents are open in the popup (id of the leave application, and a label for the title).
  const [docsFor, setDocsFor] = useState<{ id: number; label: string } | null>(null);
  const [waiting, setWaiting] = useState<LeaveApplication[]>([]);
  const waitingPaged = usePagedRows(waiting);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [cal, setCal] = useState<LeaveApplication[]>([]);
  // Filters for Who is off.
  const [offEmp, setOffEmp] = useState<string[]>([]);
  const [offTypes, setOffTypes] = useState<string[]>([]);
  const [offStatus, setOffStatus] = useState<string[]>([]);
  const [offToday, setOffToday] = useState(false);
  const [note, setNote] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadWaiting = useCallback(async () => {
    try {
      setWaiting((await getTeamLeave('PENDING')).data);
    } catch (e: any) {
      setError(e.message || 'Could not load leave');
    }
  }, []);
  const loadCal = useCallback(async () => {
    try {
      setCal((await getLeaveCalendar(monthStart(month.y, month.m), monthEnd(month.y, month.m), 'team')).data);
    } catch (e: any) {
      setError(e.message || 'Could not load the calendar');
    }
  }, [month]);

  useEffect(() => {
    if (isAuthenticated) loadWaiting();
  }, [isAuthenticated, loadWaiting]);
  useEffect(() => {
    if (isAuthenticated && tab === 'calendar') loadCal();
  }, [isAuthenticated, tab, loadCal]);

  const decide = async (a: LeaveApplication, approve: boolean) => {
    setError('');
    setNotice('');
    try {
      await decideLeave(a.id, approve, note[a.id]);
      await loadWaiting();
    } catch (e: any) {
      setError(e.message || 'Could not save the decision');
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of cal) seen.set(String(a.leaveType.id), a.leaveType.name);
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [cal]);
  const empOptions = useMemo(() => {
    const seen = new Map<number, { value: string; label: string }>();
    for (const a of cal) if (!seen.has(a.employeeId)) seen.set(a.employeeId, { value: String(a.employeeId), label: `${a.employeeName} (${a.employeeCode})` });
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [cal]);
  const offShown = useMemo(() => {
    return cal.filter(
      (a) =>
        (offEmp.length === 0 || offEmp.includes(String(a.employeeId))) &&
        (offTypes.length === 0 || offTypes.includes(String(a.leaveType.id))) &&
        (offStatus.length === 0 || offStatus.includes(a.status)) &&
        (!offToday || (a.fromDate <= todayIso && a.toDate >= todayIso)),
    );
  }, [cal, offEmp, offTypes, offStatus, offToday, todayIso]);
  const offFiltersOn = offEmp.length > 0 || offTypes.length > 0 || offStatus.length > 0 || offToday;
  const clearOff = () => { setOffEmp([]); setOffTypes([]); setOffStatus([]); setOffToday(false); };

  const label = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (d: number) => setMonth((p) => { const n = new Date(Date.UTC(p.y, p.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Team leave</h2>
        <p className="mt-1 text-gray-500">Approving takes the days from the balance and marks the days on attendance. The days are counted again when you approve.</p>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {([['waiting', `Waiting for approval (${waiting.length})`], ['calendar', 'Who is off'], ['compoff', 'Comp off']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {tab === 'waiting' && (
        <div className="space-y-3">
          {waiting.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Nothing is waiting for you.</p>}
          {waitingPaged.pageRows.map((a) => {
            const initials = a.employeeName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
            const dates = a.toDate !== a.fromDate ? `${a.fromDate} to ${a.toDate}` : a.halfDayPart ? `${a.fromDate}, ${a.halfDayPart === 'FIRST' ? 'first' : 'second'} half` : a.fromDate;
            return (
              <section key={a.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">{initials}</div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{a.employeeName}</p>
                      <p className="text-xs text-gray-500">{a.employeeCode}{a.createdAt ? ` · applied ${a.createdAt.slice(0, 10)}` : ''}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{a.leaveType.name}{a.variant ? ` · ${a.variant}` : ''}</span>
                        <span className="font-mono text-sm text-gray-700">{dates}</span>
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${a.status === 'MANAGER_APPROVED' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{LEAVE_STATUS_LABEL[a.status]}</span>
                      </div>
                      {a.reason && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{a.reason}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-3xl font-semibold leading-none text-gray-900">{a.totalDays}</p>
                    <p className="mt-1 text-xs text-gray-500">day{a.totalDays === 1 ? '' : 's'}{a.sandwichDays > 0 ? ` · ${a.sandwichDays} sandwich` : ''}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {a.hasAttachment && (
                      <button type="button" onClick={() => setDocsFor({ id: a.id, label: `${a.employeeName}, ${a.leaveType.name}` })} className="font-medium text-blue-600 hover:text-blue-800">
                        Documents ({a.attachments.length})
                      </button>
                    )}
                    <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="text-gray-600 hover:text-gray-900">
                      {open === a.id ? 'Hide' : 'Show'} day breakdown
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={note[a.id] ?? ''}
                      onChange={(e) => setNote({ ...note, [a.id]: e.target.value })}
                      placeholder="Note (optional)"
                      maxLength={300}
                      className="w-56 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => decide(a, false)} className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Reject</button>
                    {a.status === 'MANAGER_APPROVED' && !isHr ? (
                      <span className="px-2 text-sm text-blue-700">Approved by you. Waiting for HR.</span>
                    ) : (
                      <button type="button" onClick={() => decide(a, true)} className="rounded-lg bg-green-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-green-700">
                        {a.status === 'MANAGER_APPROVED' ? 'Confirm' : 'Approve'}
                      </button>
                    )}
                  </div>
                </div>

                {open === a.id && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <tr><th className="pb-2">Date</th><th className="pb-2">Counted as</th><th className="pb-2 text-right">Days</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {a.calculation.map((d) => (
                          <tr key={d.date}>
                            <td className="py-1.5 font-mono text-[13px] text-gray-800">{d.date}</td>
                            <td className="py-1.5 text-gray-600">{REASON_TEXT[d.reason]}</td>
                            <td className="py-1.5 text-right font-medium text-gray-900">{d.days || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {docsFor?.id === a.id && <LeaveDocumentsModal applicationId={a.id} title={docsFor.label} canManage={false} onClose={() => setDocsFor(null)} />}
              </section>
            );
          })}
          {waiting.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <Pagination {...waitingPaged.pagination} />
            </div>
          )}
        </div>
      )}

      {tab === 'compoff' && <CompOffList scope="team" />}

      {tab === 'calendar' && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Previous month">←</button>
            <span className="w-36 text-center text-sm font-medium text-gray-800">{label}</span>
            <button type="button" onClick={() => shift(1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Next month">→</button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-60">
              <Select multiple aria-label="Employees" options={empOptions} values={offEmp} onValuesChange={setOffEmp} placeholder="All employees" allText="All employees" noun="employees" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" />
            </div>
            <div className="w-52">
              <Select multiple aria-label="Leave type" options={typeOptions} values={offTypes} onValuesChange={setOffTypes} placeholder="Any leave type" allText="Any leave type" noun="leave types" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" />
            </div>
            <div className="w-44">
              <Select multiple aria-label="Status" options={[{ value: 'APPROVED', label: 'Approved' }, { value: 'PENDING', label: 'Waiting' }]} values={offStatus} onValuesChange={setOffStatus} placeholder="Any status" allText="Any status" noun="statuses" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" />
            </div>
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${offToday ? 'border-blue-300 bg-blue-50 font-medium text-blue-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={offToday} onChange={(e) => setOffToday(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Off today
            </label>
            {offFiltersOn && <button type="button" onClick={clearOff} className="pb-1.5 text-sm font-medium text-blue-600 hover:text-blue-800">Clear filters</button>}
            <p className="ml-auto pb-1.5 text-xs text-gray-500">Showing {offShown.length} of {cal.length}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Leave</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {offShown.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{offFiltersOn ? 'Nothing matches these filters.' : 'Nobody is on leave this month.'}</td></tr> : offShown.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-gray-900">{a.employeeName} <span className="text-xs text-gray-400">{a.employeeCode}</span></td>
                    <td className="px-4 py-2 text-gray-700">{a.leaveType.name}</td>
                    <td className="px-4 py-2 font-mono text-[13px] text-gray-700">{a.fromDate}{a.toDate !== a.fromDate ? ` to ${a.toDate}` : ''}</td>
                    <td className="px-4 py-2 text-gray-700">{a.totalDays}</td>
                    <td className="px-4 py-2"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${a.status === 'APPROVED' ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{a.status === 'APPROVED' ? 'Approved' : 'Waiting'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
