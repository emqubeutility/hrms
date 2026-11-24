import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { ExceptionKind, ExceptionRow, SummaryRow, downloadCsv, getAttendanceExceptions, getAttendanceSummary, minutesText } from '../../lib/attendance-marking-api';
import StatusBadge from '../../components/StatusBadge';
import Pagination from '../../components/Pagination';
import { usePagedRows } from '../../lib/usePagedRows';

type Kind = 'summary' | ExceptionKind;
const REPORTS: { key: Kind; label: string; hint: string }[] = [
  { key: 'summary', label: 'Summary', hint: 'One line per employee for the period' },
  { key: 'late', label: 'Late', hint: 'Days with late minutes' },
  { key: 'short', label: 'Short hours', hint: 'Days worked less than required' },
  { key: 'overtime', label: 'Overtime', hint: 'Days with overtime' },
  { key: 'missing-punch', label: 'Missing punch', hint: 'An IN with no OUT' },
  { key: 'absent', label: 'Absent', hint: 'Absent and not found present' },
  { key: 'pending', label: 'Pending approval', hint: 'Days nobody has approved' },
];

const first = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10); };
const last = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10); };
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

/** Attendance reports for managers (their team) and HR (their branches), with CSV download. */
export default function AttendanceReportsPage() {
  const { isAuthenticated } = useAuth();
  const [kind, setKind] = useState<Kind>('summary');
  const [from, setFrom] = useState(first());
  const [to, setTo] = useState(last());
  const [summary, setSummary] = useState<{ statuses: { code: string; name: string; color: string }[]; rows: SummaryRow[]; truncated: boolean } | null>(null);
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const summaryPaged = usePagedRows(summary?.rows ?? []);
  const rowsPaged = usePagedRows(rows);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (kind === 'summary') setSummary((await getAttendanceSummary(from, to)).data);
      else setRows((await getAttendanceExceptions(kind, from, to)).data);
    } catch (e: any) {
      setError(e.message || 'Could not load the report');
    } finally {
      setLoading(false);
    }
  }, [kind, from, to]);
  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const csv = () => {
    if (kind === 'summary' && summary) {
      downloadCsv(`attendance-summary-${from}-${to}.csv`, ['Code', 'Employee', ...summary.statuses.map((s) => s.name), 'Late days', 'Late minutes', 'Worked minutes', 'Short minutes', 'Overtime minutes', 'Pending days'],
        summary.rows.map((r) => [r.employeeCode, r.employeeName, ...summary.statuses.map((s) => r.days[s.code] ?? 0), r.lateDays, r.lateMinutes, r.workedMinutes, r.shortMinutes, r.overtimeMinutes, r.pending]));
    } else {
      downloadCsv(`attendance-${kind}-${from}-${to}.csv`, ['Date', 'Code', 'Employee', 'Status', 'In', 'Out', 'Late min', 'Worked min', 'Required min', 'Short min', 'Overtime min', 'Approved'],
        rows.map((r) => [r.date, r.employeeCode, r.employeeName, r.statusName, hm(r.firstInAt), hm(r.lastOutAt), r.lateMinutes, r.workedMinutes, r.requiredMinutes, r.shortMinutes, r.overtimeMinutes, r.approved ? 'Yes' : 'No']));
    }
  };

  const cur = REPORTS.find((r) => r.key === kind)!;
  const count = kind === 'summary' ? summary?.rows.length ?? 0 : rows.length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Attendance reports</h2>
        <p className="mt-1 text-gray-500">{cur.hint}. Pick a period, then download it as a CSV file for Excel.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
        {REPORTS.map((r) => (
          <button key={r.key} role="tab" aria-selected={kind === r.key} type="button" onClick={() => setKind(r.key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${kind === r.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{r.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
        <label className="text-xs font-medium text-gray-600">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
        <button type="button" onClick={csv} disabled={!count} className="ml-auto rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Download CSV ({count})</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {summary?.truncated && kind === 'summary' && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">The period has too many days to show in full. Use a shorter period.</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {kind === 'summary' ? (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-3">Employee</th>{summary?.statuses.map((s) => <th key={s.code} className="px-3 py-3 text-center" title={s.name}><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} /><span className="ml-1 hidden xl:inline">{s.name}</span></th>)}<th className="px-3 py-3">Late</th><th className="px-3 py-3">Worked</th><th className="px-3 py-3">Short</th><th className="px-3 py-3">Overtime</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={20} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr> : !summary?.rows.length ? <tr><td colSpan={20} className="px-4 py-8 text-center text-gray-500">No attendance in this period.</td></tr> : summaryPaged.pageRows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="px-4 py-2 text-gray-900">{r.employeeName} <span className="text-xs text-gray-400">{r.employeeCode}</span>{r.pending > 0 && <span className="ml-2 text-xs text-amber-700">{r.pending} pending</span>}</td>
                  {summary.statuses.map((s) => <td key={s.code} className="px-3 py-2 text-center text-gray-700">{r.days[s.code] ?? <span className="text-gray-300">·</span>}</td>)}
                  <td className="px-3 py-2 text-gray-700">{r.lateDays ? `${r.lateDays}d / ${r.lateMinutes}m` : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{minutesText(r.workedMinutes)}</td>
                  <td className="px-3 py-2 text-gray-700">{r.shortMinutes ? minutesText(r.shortMinutes) : '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{r.overtimeMinutes ? minutesText(r.overtimeMinutes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">In</th><th className="px-4 py-3">Out</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Worked / required</th><th className="px-4 py-3">Short</th><th className="px-4 py-3">Overtime</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nothing to report for this period.</td></tr> : rowsPaged.pageRows.map((r, i) => (
                <tr key={`${r.employeeId}-${r.date}-${i}`}>
                  <td className="px-4 py-2 font-mono text-[13px] text-gray-800">{r.date}</td>
                  <td className="px-4 py-2 text-gray-900">{r.employeeName} <span className="text-xs text-gray-400">{r.employeeCode}</span></td>
                  <td className="px-4 py-2"><StatusBadge name={r.statusName} color={r.statusColor} approved={r.approved} /></td>
                  <td className="px-4 py-2 font-mono text-[13px] text-gray-700">{hm(r.firstInAt)}</td>
                  <td className="px-4 py-2 font-mono text-[13px] text-gray-700">{hm(r.lastOutAt)}</td>
                  <td className="px-4 py-2 text-gray-700">{r.lateMinutes ? `${r.lateMinutes} min` : '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{minutesText(r.workedMinutes)} / {minutesText(r.requiredMinutes)}</td>
                  <td className="px-4 py-2 text-gray-700">{r.shortMinutes ? minutesText(r.shortMinutes) : '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{r.overtimeMinutes ? minutesText(r.overtimeMinutes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {kind === 'summary' && !!summary?.rows.length && <Pagination {...summaryPaged.pagination} />}
        {kind !== 'summary' && rows.length > 0 && <Pagination {...rowsPaged.pagination} />}
      </div>
    </div>
  );
}
