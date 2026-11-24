import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { Regularization, decideCorrection, getTeamCorrections } from '../../lib/attendance-marking-api';

/** Managers and HR: approve or reject correction requests from their team. */
export default function CorrectionRequestsPage() {
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<Regularization[]>([]);
  const [status, setStatus] = useState<'PENDING' | ''>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await getTeamCorrections(status || undefined)).data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load the requests');
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const decide = async (r: Regularization, approve: boolean) => {
    setError('');
    setNotice('');
    try {
      await decideCorrection(r.id, approve, note[r.id]);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save the decision');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Correction requests</h2>
          <p className="mt-1 text-gray-500">Approving applies the corrected times to the day, and late, short hours and overtime are worked out again.</p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm">
          <button type="button" onClick={() => setStatus('PENDING')} className={`px-3 py-1.5 ${status === 'PENDING' ? 'bg-blue-50 font-medium text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Waiting</button>
          <button type="button" onClick={() => setStatus('')} className={`border-l border-gray-300 px-3 py-1.5 ${status === '' ? 'bg-blue-50 font-medium text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>All</button>
        </div>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{status === 'PENDING' ? 'Nothing is waiting for you.' : 'No requests.'}</p>
        ) : (
          rows.map((r) => (
            <section key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.employeeName} <span className="text-xs font-normal text-gray-400">{r.employeeCode}</span></p>
                  <p className="mt-0.5 text-sm text-gray-700">
                    <span className="font-mono">{r.date}</span>: IN <span className="font-mono">{r.requestedIn ?? 'unchanged'}</span>, OUT <span className="font-mono">{r.requestedOut ?? 'unchanged'}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{r.reason}</p>
                </div>
                {r.status === 'PENDING' ? (
                  <div className="flex flex-col items-end gap-2">
                    <input value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="Note (optional)" maxLength={300} className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => decide(r, false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Reject</button>
                      <button type="button" onClick={() => decide(r, true)} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-green-700">Approve</button>
                    </div>
                  </div>
                ) : (
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${r.status === 'APPROVED' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
