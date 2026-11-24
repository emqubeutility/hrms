import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { AttendanceRow, Regularization, cancelCorrection, getMyAttendance, getMyCorrections, minutesText, requestCorrection } from '../../lib/attendance-marking-api';
import StatusBadge from '../../components/StatusBadge';
import Drawer, { fieldClass } from '../../components/Drawer';

const monthStart = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

/** The signed-in employee's own attendance, by month. */
export default function MyAttendancePage() {
  const { isAuthenticated } = useAuth();
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fixes, setFixes] = useState<Regularization[]>([]);
  const [req, setReq] = useState<{ date: string; inTime: string; outTime: string; reason: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows((await getMyAttendance(monthStart(month.y, month.m), monthEnd(month.y, month.m))).data);
    } catch (e: any) {
      setError(e.message || 'Could not load your attendance');
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadFixes = useCallback(() => getMyCorrections().then((r) => setFixes(r.data)).catch(() => {}), []);

  useEffect(() => {
    if (isAuthenticated) {
      load();
      loadFixes();
    }
  }, [isAuthenticated, load, loadFixes]);

  const send = async () => {
    if (!req) return;
    if (!req.reason.trim()) return setError('Tell your manager why the day needs correcting');
    if (!req.inTime && !req.outTime) return setError('Give the IN time, the OUT time, or both');
    setSending(true);
    setError('');
    try {
      await requestCorrection({ date: req.date, inTime: req.inTime || undefined, outTime: req.outTime || undefined, reason: req.reason.trim() });
      setReq(null);
      loadFixes();
    } catch (e: any) {
      setError(e.message || 'Could not send the request');
    } finally {
      setSending(false);
    }
  };

  const label = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (d: number) => setMonth((p) => { const n = new Date(Date.UTC(p.y, p.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  const summary = useMemo(() => {
    const count: Record<string, { name: string; color: string; n: number }> = {};
    rows.forEach((r) => { (count[r.statusCode] ??= { name: r.statusName, color: r.statusColor, n: 0 }).n++; });
    return Object.values(count);
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My attendance</h2>
          <p className="mt-1 text-gray-500">Your days, times and status. "Pending" means your manager has not approved the day yet.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Previous month">←</button>
          <span className="w-36 text-center text-sm font-medium text-gray-800">{label}</span>
          <button type="button" onClick={() => shift(1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Next month">→</button>
        </div>
      </div>

      {error && !req && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <span key={s.name} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm">
              <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name} <b className="ml-1">{s.n}</b>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">In</th><th className="px-4 py-3">Out</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3">Remarks</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No attendance this month.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{new Date(`${r.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}</td>
                  <td className="px-4 py-3"><StatusBadge name={r.statusName} color={r.statusColor} approved={r.approved} /></td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{r.inLocal ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{r.outLocal ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{r.lateMinutes ? `${r.lateMinutes} min` : '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{minutesText(r.workedMinutes)}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500" title={r.remarks ?? ''}>{r.remarks ?? ''}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setError(''); setReq({ date: r.date, inTime: r.inLocal ?? '', outTime: r.outLocal ?? '', reason: '' }); }} className="text-xs font-medium text-blue-600 hover:text-blue-800">Request correction</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">My correction requests</h3>
          <button type="button" onClick={() => { setError(''); setReq({ date: new Date().toISOString().slice(0, 10), inTime: '', outTime: '', reason: '' }); }} className="text-sm font-medium text-blue-600 hover:text-blue-800">+ New request</button>
        </div>
        {fixes.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No requests yet. Forgot to punch? Ask your manager to correct the day.</p>
        ) : (
          <table className="mt-3 min-w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-1">Day</th><th className="py-1">In</th><th className="py-1">Out</th><th className="py-1">Reason</th><th className="py-1">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {fixes.map((f) => (
                <tr key={f.id}>
                  <td className="py-1.5 font-mono text-[13px] text-gray-800">{f.date}</td>
                  <td className="py-1.5 font-mono text-[13px] text-gray-700">{f.requestedIn ?? '—'}</td>
                  <td className="py-1.5 font-mono text-[13px] text-gray-700">{f.requestedOut ?? '—'}</td>
                  <td className="max-w-xs truncate py-1.5 text-gray-600" title={f.reason}>{f.reason}</td>
                  <td className="py-1.5"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${f.status === 'APPROVED' ? 'border-green-200 bg-green-50 text-green-700' : f.status === 'PENDING' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>{f.status.charAt(0) + f.status.slice(1).toLowerCase()}</span>{f.decisionNote && <span className="ml-2 text-xs text-gray-500">{f.decisionNote}</span>}</td>
                  <td className="py-1.5 text-right">{f.status === 'PENDING' && <button type="button" onClick={() => cancelCorrection(f.id).then(loadFixes).catch((e) => setError(e.message))} className="text-xs font-medium text-red-600 hover:text-red-800">Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {req && (
        <Drawer
          title="Request a correction"
          onClose={() => setReq(null)}
          footer={<>
            <button type="button" onClick={() => setReq(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={send} disabled={sending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{sending ? 'Sending…' : 'Send request'}</button>
          </>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-gray-700">Day<input type="date" max={new Date().toISOString().slice(0, 10)} className={fieldClass} value={req.date} onChange={(e) => setReq({ ...req, date: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">IN time<input type="time" className={fieldClass} value={req.inTime} onChange={(e) => setReq({ ...req, inTime: e.target.value })} /></label>
            <label className="block text-sm font-medium text-gray-700">OUT time<input type="time" className={fieldClass} value={req.outTime} onChange={(e) => setReq({ ...req, outTime: e.target.value })} /></label>
          </div>
          <label className="block text-sm font-medium text-gray-700">Reason<textarea rows={3} maxLength={300} className={fieldClass} value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} placeholder="For example: forgot to press OUT" /></label>
          <p className="text-xs text-gray-500">Times are in your local time. Your manager approves or rejects the request.</p>
        </Drawer>
      )}
    </div>
  );
}
