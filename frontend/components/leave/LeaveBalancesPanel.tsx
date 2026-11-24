import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { BranchOption, CountryItem, MasterItem, getBranches, getCountries, getSites } from '../../lib/api';
import { searchEmployeeOptions } from '../../lib/bulk-api';
import { GroupTarget, LeaveBalance, LeaveType, LedgerRow, adjustBalance, adjustGroup, fmtDays, getBalancesOf, getGroupCount, getLeaveTypes, getLedger } from '../../lib/leave-api';
import { fieldClass } from '../Drawer';
import Select from '../Select';

const KIND: Record<string, string> = { CREDIT: 'Credit', DEBIT: 'Used', REVERSAL: 'Returned', EXPIRY: 'Expired', CARRY_FORWARD: 'Carried forward', ADJUSTMENT: 'Adjustment' };

/** HR: employees' balances and ledger, and adding or taking away days with a reason. */
export default function LeaveBalancesPanel() {
  const { isAuthenticated } = useAuth();
  const [names, setNames] = useState<Record<number, string>>({});
  // Who the change is for: people, or a whole branch, country or the company.
  const [level, setLevel] = useState<'EMPLOYEE' | 'SITE' | 'BRANCH' | 'COUNTRY' | 'COMPANY'>('EMPLOYEE');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [branchId, setBranchId] = useState('');
  const [sites, setSites] = useState<MasterItem[]>([]);
  const [siteId, setSiteId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [adj, setAdj] = useState({ leaveTypeId: '', days: '', note: '', expiresOn: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // One employee chosen: show their balances and ledger. Several: only the add / take away form.
  const employeeId = picked.length === 1 ? picked[0] : null;

  useEffect(() => {
    if (!isAuthenticated) return;
    getBranches().then((r) => setBranches(r.data)).catch(() => {});
    getSites().then((r) => setSites(r.data)).catch(() => setSites([]));
    getCountries().then((r) => setCountries(r.data.filter((c) => c.isActive))).catch(() => {});
    getLeaveTypes().then((r) => setTypes(r.data.filter((t) => t.balanceTracking))).catch(() => {});
  }, [isAuthenticated]);

  const load = useCallback(async () => {
    if (employeeId === null) return;
    try {
      const [b, l] = await Promise.all([getBalancesOf(employeeId), getLedger(employeeId)]);
      setBalances(b.data);
      setLedger(l.data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load this employee');
    }
  }, [employeeId]);
  useEffect(() => {
    setBalances([]);
    setLedger([]);
    load();
  }, [load]);

  const target: GroupTarget | null =
    level === 'COMPANY' ? { scope: 'COMPANY' } : level === 'BRANCH' && branchId ? { scope: 'BRANCH', branchId: Number(branchId) } : level === 'SITE' && siteId ? { scope: 'SITE', siteId: Number(siteId) } : level === 'COUNTRY' && countryCode ? { scope: 'COUNTRY', countryCode } : null;
  const targetName = level === 'COMPANY' ? 'the whole company' : level === 'BRANCH' ? branches.find((b) => String(b.id) === branchId)?.name ?? '' : level === 'SITE' ? sites.find((x) => String(x.id) === siteId)?.name ?? '' : countries.find((c) => c.isoCode === countryCode)?.name ?? '';

  /** The same change for everyone in the group. Asks first, saying how many people it reaches. */
  const saveGroup = async () => {
    if (!target) return;
    const days = Number(adj.days);
    if (!adj.leaveTypeId || !days) return setError('Choose a leave type and the number of days (negative to take away)');
    if (!adj.note.trim()) return setError('A reason is required');
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const { count } = (await getGroupCount(target)).data;
      if (count === 0) return setError('There are no active employees in that group.');
      const typeName = types.find((t) => String(t.id) === adj.leaveTypeId)?.name ?? 'leave';
      if (!window.confirm(`${days > 0 ? 'Add' : 'Take away'} ${Math.abs(days)} day(s) of ${typeName} ${days > 0 ? 'to' : 'from'} ${count} employee(s) in ${targetName}?`)) return;
      const r = (await adjustGroup({ ...target, leaveTypeId: Number(adj.leaveTypeId), days, note: adj.note.trim(), expiresOn: adj.expiresOn || undefined })).data;
      if (r.done) setNotice(`Balance adjusted for ${r.done} of ${r.total} employees in ${targetName}`);
      if (r.failed.length) setError(`Not changed for ${r.failed.length}: ${r.failed.slice(0, 5).map((f) => `${f.code} (${f.reason})`).join('; ')}${r.failed.length > 5 ? '…' : ''}`);
      if (r.done) setAdj({ leaveTypeId: adj.leaveTypeId, days: '', note: '', expiresOn: '' });
    } catch (e: any) {
      setError(e.message || 'Could not adjust');
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!picked.length) return;
    const days = Number(adj.days);
    if (!adj.leaveTypeId || !days) return setError('Choose a leave type and the number of days (negative to take away)');
    if (!adj.note.trim()) return setError('A reason is required');
    setError('');
    setNotice('');
    setSaving(true);
    const failed: string[] = [];
    let done = 0;
    for (const id of picked) {
      try {
        await adjustBalance({ employeeId: id, leaveTypeId: Number(adj.leaveTypeId), days, note: adj.note.trim(), expiresOn: adj.expiresOn || undefined });
        done++;
      } catch (e: any) {
        failed.push(`${names[id] ?? id}: ${e.message || 'failed'}`);
      }
    }
    setSaving(false);
    if (done) {
      setAdj({ leaveTypeId: adj.leaveTypeId, days: '', note: '', expiresOn: '' });
      await load();
    }
    if (failed.length) setError(`Not changed for ${failed.length}: ${failed.slice(0, 5).join('; ')}${failed.length > 5 ? '…' : ''}`);
  };

  return (
    <div className="space-y-5">
      <p className="text-gray-500">Every change to a balance is recorded. Days taken away use the earliest-expiring balance first.</p>

      <div role="tablist" aria-label="Who is this for" className="inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {([['EMPLOYEE', 'Employees'], ['SITE', 'A site'], ['BRANCH', 'A branch'], ['COUNTRY', 'A country'], ['COMPANY', 'Whole company']] as const).map(([key, text]) => (
          <button key={key} type="button" role="tab" aria-selected={level === key} onClick={() => { setLevel(key); setError(''); setNotice(''); }} className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${level === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{text}</button>
        ))}
      </div>

      {level !== 'EMPLOYEE' && (
        <>
          {level === 'SITE' && (
            <div className="max-w-sm">
              <Select label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Select a site…</option>
                {sites.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </div>
          )}
          {level === 'BRANCH' && (
            <div className="max-w-sm">
              <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select a branch…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          )}
          {level === 'COUNTRY' && (
            <div className="max-w-sm">
              <Select label="Country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                <option value="">Select a country…</option>
                {countries.map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
              </Select>
            </div>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}
          {!target ? (
            <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{level === 'BRANCH' ? 'Choose a branch.' : level === 'SITE' ? 'Choose a site.' : 'Choose a country.'}</p>
          ) : (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Add or take away days for everyone in {targetName}</h3>
              <p className="mt-1 text-sm text-gray-500">The same change is made for every active employee there, and each one gets a line in their own history. You are asked to confirm, with the number of people, before anything is saved. Only people who join later are not included.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-gray-600">Leave type
                  <Select value={adj.leaveTypeId} onChange={(e) => setAdj({ ...adj, leaveTypeId: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"><option value="">Select…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
                </label>
                <label className="text-xs font-medium text-gray-600">Days (use − to take away)<input type="number" step="0.5" value={adj.days} onChange={(e) => setAdj({ ...adj, days: e.target.value })} className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
                <label className="text-xs font-medium text-gray-600">Expires (optional)<input type="date" value={adj.expiresOn} onChange={(e) => setAdj({ ...adj, expiresOn: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
                <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-600">Reason<input value={adj.note} maxLength={200} onChange={(e) => setAdj({ ...adj, note: e.target.value })} className={`${fieldClass} !mt-1`} /></label>
                <button type="button" disabled={saving} onClick={saveGroup} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </section>
          )}
        </>
      )}

      {level === 'EMPLOYEE' && (
      <>

      <div className="max-w-xl">
        <Select multiple
          label="Employees"
          loadOptions={searchEmployeeOptions}
          values={picked.map(String)}
          onValuesChange={(v, chosen) => { setPicked(v.map(Number)); setNames(Object.fromEntries(chosen.map((o) => [Number(o.value), o.label]))); setNotice(''); setError(''); }}
          placeholder="Select one or more employees…"
          allText=""
          noun="employees"
        />
        <p className="mt-1.5 text-xs text-gray-500">Choose one employee to see their balances and history. Choose several to give or take away the same days from all of them.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {picked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Choose an employee.</p>
      ) : (
        <>
          {employeeId !== null && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {balances.filter((b) => b.balanceTracking).map((b) => (
                <div key={b.leaveTypeId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{b.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{fmtDays(b.balance)}</p>
                  <p className="mt-1 text-xs text-gray-500">{b.pending > 0 ? `${fmtDays(b.pending)} waiting approval` : 'None waiting'}{b.nextExpiry ? ` · expires ${b.nextExpiry}` : ''}</p>
                </div>
              ))}
            </div>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">Add or take away days</h3>
            {picked.length > 1 && <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm text-blue-800"><b>{picked.length}</b> employees chosen. The same change is made for each of them.</p>}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-gray-600">Leave type
                <Select value={adj.leaveTypeId} onChange={(e) => setAdj({ ...adj, leaveTypeId: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"><option value="">Select…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              </label>
              <label className="text-xs font-medium text-gray-600">Days (use − to take away)<input type="number" step="0.5" value={adj.days} onChange={(e) => setAdj({ ...adj, days: e.target.value })} className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
              <label className="text-xs font-medium text-gray-600">Expires (optional)<input type="date" value={adj.expiresOn} onChange={(e) => setAdj({ ...adj, expiresOn: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
              <label className="min-w-[14rem] flex-1 text-xs font-medium text-gray-600">Reason<input value={adj.note} maxLength={200} onChange={(e) => setAdj({ ...adj, note: e.target.value })} className={`${fieldClass} !mt-1`} /></label>
              <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </section>

          {employeeId !== null && (
            <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Note</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {ledger.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No movements yet.</td></tr> : ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 text-gray-600">{new Date(l.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2 text-gray-900">{l.leaveType}</td>
                      <td className="px-4 py-2 text-gray-700">{KIND[l.kind] ?? l.kind}</td>
                      <td className={`px-4 py-2 font-medium ${l.days >= 0 ? 'text-green-700' : 'text-red-700'}`}>{l.days > 0 ? `+${l.days}` : l.days}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{l.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
