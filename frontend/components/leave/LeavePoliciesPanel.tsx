import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { BranchOption, CountryItem, Employee, Parameter, getBranches, getCountries, getEmployees, getParameters } from '../../lib/api';
import { LeaveType, getLeaveTypes } from '../../lib/leave-api';
import {
  CREDIT_LABEL, EntitlementPreview, LeavePolicy, LeavePolicyPayload, PRORATION_LABEL, PolicyRule, ROUNDING_LABEL,
  createLeavePolicy, deleteLeavePolicy, getLeavePolicies, previewEntitlement, updateLeavePolicy,
} from '../../lib/leave-policy-api';
import Drawer, { fieldClass } from '../Drawer';
import Select from '../Select';

const blankRule = (leaveTypeId: number): PolicyRule => ({ leaveTypeId, annualDays: 0, creditMethod: 'MONTHLY', slabs: [], slabTiming: 'IMMEDIATE', proration: 'COMPLETED_MONTHS', cutoffDay: null, rounding: 'NONE', tieRule: 'UP', minDays: null, maxDays: null, formula: null, serviceBasis: 'JOINING_DATE' });
const blankPolicy = (): LeavePolicyPayload => ({ name: '', layer: 'COMPANY', countryCode: null, branchId: null, employeeTypeId: null, employeeId: null, effectiveFrom: `${new Date().getFullYear()}-01-01`, effectiveTo: null, priority: 0, isActive: true, note: null, rules: [] });
const numOrNull = (v: string) => (v === '' ? null : Number(v));

const Label = ({ text, children }: { text: string; children: React.ReactNode }) => <label className="block text-xs font-medium text-gray-600">{text}{children}</label>;

/** HR and System Admin: who gets how much leave, from when, and how it is worked out. */
export default function LeavePoliciesPanel() {
  const { isAuthenticated } = useAuth();
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [empTypes, setEmpTypes] = useState<Parameter[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; used: boolean; form: LeavePolicyPayload } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPolicies((await getLeavePolicies()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load policies');
    }
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    getLeaveTypes().then((r) => setTypes(r.data.filter((t) => t.balanceTracking && !t.isCompOff))).catch(() => {});
    getBranches().then((r) => setBranches(r.data)).catch(() => {});
    getCountries().then((r) => setCountries(r.data)).catch(() => {});
    getParameters('Employee Type').then((r) => setEmpTypes(r.data)).catch(() => {});
  }, [isAuthenticated, load]);

  const setForm = (patch: Partial<LeavePolicyPayload>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  const setRule = (i: number, patch: Partial<PolicyRule>) => setEditing((e) => (e ? { ...e, form: { ...e.form, rules: e.form.rules.map((r, k) => (k === i ? { ...r, ...patch } : r)) } } : e));

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) return setError('Give the policy a name');
    setSaving(true);
    setError('');
    try {
      const payload = { ...f, countryCode: f.countryCode?.trim() ? f.countryCode.trim().toUpperCase() : null };
      if (editing.id === null) await createLeavePolicy(payload);
      else await updateLeavePolicy(editing.id, payload);
      setEditing(null);
      setNotice('Policy saved');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: LeavePolicy) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setError('');
    try {
      await deleteLeavePolicy(p.id);
      setNotice('Policy deleted');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete');
    }
  };

  const scopeText = (p: LeavePolicy) => {
    const parts = [
      p.countryCode ? countries.find((c) => c.isoCode === p.countryCode)?.name ?? p.countryCode : 'All countries',
      p.branchId ? `branch: ${branches.find((b) => b.id === p.branchId)?.name ?? p.branchId}` : '',
      p.employeeTypeId ? `type: ${empTypes.find((t) => t.id === p.employeeTypeId)?.text ?? p.employeeTypeId}` : '',
      p.employeeId ? `employee #${p.employeeId}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Leave policies</h3>
          <p className="mt-1 max-w-2xl text-gray-500">A policy says how many days each leave type gives, to whom, from which date, and how joiners and length of service are handled. The most specific policy wins. Statutory and company policies are kept apart and the employee gets the higher.</p>
        </div>
        <button type="button" onClick={() => setEditing({ id: null, used: false, form: blankPolicy() })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">New policy</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Applies to</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Leave types</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {policies.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No policies yet. Leave types still credit days from their own setting until a policy covers them.</td></tr>}
            {policies.map((p) => (
              <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                <td className="px-4 py-3"><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-500">{p.layer === 'STATUTORY' ? 'Statutory' : 'Company'}{!p.isActive && ' · switched off'}{p.used && ' · in use'}</p></td>
                <td className="px-4 py-3 text-gray-700">{scopeText(p)}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{p.effectiveFrom} → {p.effectiveTo ?? 'open'}</td>
                <td className="px-4 py-3 text-gray-700">{p.rules.map((r) => `${r.leaveType} ${r.annualDays}`).join(', ')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => setEditing({ id: p.id, used: p.used, form: { name: p.name, layer: p.layer, countryCode: p.countryCode, branchId: p.branchId, employeeTypeId: p.employeeTypeId, employeeId: p.employeeId, effectiveFrom: p.effectiveFrom, effectiveTo: p.effectiveTo, priority: p.priority, isActive: p.isActive, note: p.note, rules: p.rules.map(({ id: _id, leaveType: _name, ...r }: any) => r) } })} className="text-sm font-medium text-blue-600 hover:text-blue-800">{p.used ? 'View / end' : 'Edit'}</button>
                  {!p.used && <button type="button" onClick={() => remove(p)} className="ml-3 text-sm text-red-600 hover:text-red-800">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Tester types={types} />

      {editing && (
        <Drawer
          wide
          title={editing.id === null ? 'New leave policy' : editing.form.name || 'Leave policy'}
          onClose={() => setEditing(null)}
          footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          {editing.used && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">This policy has already produced entitlements, so its rules are locked. You can rename it, end it with an end date, or switch it off. To change a rule, end this policy and start a new one.</p>}
          <fieldset className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Label text="Name"><input className={fieldClass} value={editing.form.name} onChange={(e) => setForm({ name: e.target.value })} maxLength={100} /></Label>
              <Label text="Kind"><Select className={fieldClass} disabled={editing.used} value={editing.form.layer} onChange={(e) => setForm({ layer: e.target.value as 'STATUTORY' | 'COMPANY' })}><option value="COMPANY">Company benefit</option><option value="STATUTORY">Statutory (required by law)</option></Select></Label>
              <Label text="From"><input type="date" className={fieldClass} disabled={editing.used} value={editing.form.effectiveFrom} onChange={(e) => setForm({ effectiveFrom: e.target.value })} /></Label>
              <Label text="Until (leave empty if open)"><input type="date" className={fieldClass} value={editing.form.effectiveTo ?? ''} onChange={(e) => setForm({ effectiveTo: e.target.value || null })} /></Label>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Applies to (leave empty for everyone)</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <Label text="Country"><Select className={fieldClass} disabled={editing.used} value={editing.form.countryCode ?? ''} onChange={(e) => setForm({ countryCode: e.target.value || null })}><option value="">Any country</option>{countries.filter((c) => c.isActive || c.isoCode === editing.form.countryCode).map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}</Select></Label>
                <Label text="Branch"><Select className={fieldClass} disabled={editing.used} value={editing.form.branchId ?? ''} onChange={(e) => setForm({ branchId: numOrNull(e.target.value) })}><option value="">Any branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Label>
                <Label text="Employee type"><Select className={fieldClass} disabled={editing.used} value={editing.form.employeeTypeId ?? ''} onChange={(e) => setForm({ employeeTypeId: numOrNull(e.target.value) })}><option value="">Any type</option>{empTypes.map((t) => <option key={t.id} value={t.id}>{t.text}</option>)}</Select></Label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Label text="Priority (breaks ties)"><input type="number" min={0} max={100} className={fieldClass} value={editing.form.priority} onChange={(e) => setForm({ priority: Number(e.target.value) })} /></Label>
                <label className="mt-6 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={editing.form.isActive} onChange={(e) => setForm({ isActive: e.target.checked })} /> Switched on</label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-900">Rules by leave type</p>
                {!editing.used && <Select className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm" value="" onChange={(e) => { if (e.target.value) setForm({ rules: [...editing.form.rules, blankRule(Number(e.target.value))] }); }}><option value="">+ Add leave type…</option>{types.filter((t) => !editing.form.rules.some((r) => r.leaveTypeId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
              </div>
              {editing.form.rules.map((r, i) => (
                <fieldset key={r.leaveTypeId} disabled={editing.used} className="space-y-3 rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between"><p className="font-medium text-gray-900">{types.find((t) => t.id === r.leaveTypeId)?.name ?? r.leaveType}</p>{!editing.used && <button type="button" className="text-xs text-red-600" onClick={() => setForm({ rules: editing.form.rules.filter((_, k) => k !== i) })}>Remove</button>}</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Label text="Days per year"><input type="number" step="0.5" min={0} className={fieldClass} value={r.annualDays} onChange={(e) => setRule(i, { annualDays: Number(e.target.value) })} /></Label>
                    <Label text="Credited"><Select className={fieldClass} value={r.creditMethod} onChange={(e) => setRule(i, { creditMethod: e.target.value as PolicyRule['creditMethod'] })}>{Object.entries(CREDIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Label>
                    <Label text="Joining part-way through the year"><Select className={fieldClass} value={r.proration} onChange={(e) => setRule(i, { proration: e.target.value as PolicyRule['proration'] })}>{Object.entries(PRORATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Label>
                    <Label text="Service counts from"><Select className={fieldClass} value={r.serviceBasis ?? 'JOINING_DATE'} onChange={(e) => setRule(i, { serviceBasis: e.target.value as PolicyRule['serviceBasis'] })}><option value="JOINING_DATE">Date of joining</option><option value="REJOINING_DATE">Rejoining date (if they took this leave before it)</option></Select></Label>
                    <div className="sm:col-span-3"><Label text="Formula (optional)"><input className={`${fieldClass} font-mono`} placeholder="workdays * annualDays / yearDays" value={r.formula ?? ''} onChange={(e) => setRule(i, { formula: e.target.value || null })} /></Label>
                      <p className="mt-1 text-xs text-gray-500">Replaces the joining part-way setting. Use <b>workdays</b> (days employed), <b>yearDays</b> (365/366), <b>annualDays</b> (days a year for this service, from the slabs or the number above) and <b>serviceMonths</b>, with + - * / ( ) and min() max() round() floor() ceil(). Example for the UAE: <span className="font-mono">workdays * 30 / 365</span>. It is worked out for each month and the results are added up.</p></div>
                    {r.proration === 'CUTOFF_DAY' && <Label text="Cut-off day of month"><input type="number" min={1} max={31} className={fieldClass} value={r.cutoffDay ?? ''} onChange={(e) => setRule(i, { cutoffDay: numOrNull(e.target.value) })} /></Label>}
                    <Label text="Rounding"><Select className={fieldClass} value={r.rounding} onChange={(e) => setRule(i, { rounding: e.target.value as PolicyRule['rounding'] })}>{Object.entries(ROUNDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Label>
                    <Label text="Exactly halfway rounds"><Select className={fieldClass} value={r.tieRule} onChange={(e) => setRule(i, { tieRule: e.target.value as 'UP' | 'DOWN' })}><option value="UP">Up</option><option value="DOWN">Down</option></Select></Label>
                    <Label text="At least (days)"><input type="number" step="0.5" min={0} className={fieldClass} value={r.minDays ?? ''} onChange={(e) => setRule(i, { minDays: numOrNull(e.target.value) })} /></Label>
                    <Label text="At most (days)"><input type="number" step="0.5" min={0} className={fieldClass} value={r.maxDays ?? ''} onChange={(e) => setRule(i, { maxDays: numOrNull(e.target.value) })} /></Label>
                  </div>
                  <div className="rounded-md bg-gray-50 p-3">
                    <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Length of service (optional)</p>{!editing.used && <button type="button" className="text-xs font-medium text-blue-600" onClick={() => { const last = r.slabs[r.slabs.length - 1]; const from = last ? last.toMonths ?? last.fromMonths + 12 : 0; setRule(i, { slabs: [...r.slabs.map((s, k) => (k === r.slabs.length - 1 && s.toMonths === null ? { ...s, toMonths: from } : s)), { fromMonths: from, toMonths: null, annualDays: r.annualDays }] }); }}>+ Add slab</button>}</div>
                    {r.slabs.length === 0 ? <p className="mt-1 text-xs text-gray-500">The same days for everyone. Add slabs to give more days after a number of months of service.</p> : (
                      <div className="mt-2 space-y-2">
                        {r.slabs.map((s, k) => (
                          <div key={k} className="flex flex-wrap items-end gap-2 text-xs">
                            <Label text="From month"><input type="number" min={0} className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={s.fromMonths} onChange={(e) => setRule(i, { slabs: r.slabs.map((x, j) => (j === k ? { ...x, fromMonths: Number(e.target.value) } : x)) })} /></Label>
                            <Label text="Until month (empty = no end)"><input type="number" min={1} className="mt-1 block w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={s.toMonths ?? ''} onChange={(e) => setRule(i, { slabs: r.slabs.map((x, j) => (j === k ? { ...x, toMonths: numOrNull(e.target.value) } : x)) })} /></Label>
                            <Label text="Days per year"><input type="number" step="0.5" min={0} className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" value={s.annualDays} onChange={(e) => setRule(i, { slabs: r.slabs.map((x, j) => (j === k ? { ...x, annualDays: Number(e.target.value) } : x)) })} /></Label>
                            {!editing.used && <button type="button" className="pb-1.5 text-red-600" onClick={() => setRule(i, { slabs: r.slabs.filter((_, j) => j !== k) })}>Remove</button>}
                          </div>
                        ))}
                        <Label text="A new slab starts"><Select className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" value={r.slabTiming} onChange={(e) => setRule(i, { slabTiming: e.target.value as 'NEXT_YEAR' | 'IMMEDIATE' })}><option value="IMMEDIATE">As soon as the milestone is reached</option><option value="NEXT_YEAR">From the next leave year</option></Select></Label>
                      </div>
                    )}
                  </div>
                </fieldset>
              ))}
              {editing.form.rules.length === 0 && <p className="text-sm text-gray-500">Add the leave types this policy covers.</p>}
            </div>
            <Label text="Note"><input className={fieldClass} value={editing.form.note ?? ''} onChange={(e) => setForm({ note: e.target.value || null })} maxLength={300} /></Label>
          </fieldset>
        </Drawer>
      )}
    </div>
  );
}

/** Shows how many days one employee gets in a leave year, line by line, without saving anything. */
function Tester({ types }: { types: LeaveType[] }) {
  const [search, setSearch] = useState('');
  const [emps, setEmps] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [yearStart, setYearStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [result, setResult] = useState<EntitlementPreview | null | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => getEmployees({ pageSize: 25, isActive: true, ...(search.trim() ? { search: search.trim() } : {}) }).then((r) => setEmps(r.data)).catch(() => setEmps([])), 300);
    return () => clearTimeout(t);
  }, [search]);

  const run = async () => {
    setError('');
    setResult(undefined);
    try {
      setResult((await previewEntitlement(Number(employeeId), Number(typeId), yearStart)).data);
    } catch (e: any) {
      setError(e.message || 'Could not work it out');
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">Check an employee</h3>
      <p className="mt-1 text-sm text-gray-500">See which policy applies and how the days are worked out. Nothing is saved.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Label text="Find employee"><input type="search" className="mt-1 block w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" placeholder="Name or code…" value={search} onChange={(e) => setSearch(e.target.value)} /></Label>
        <Label text="Employee"><Select className="mt-1 block w-60 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Select…</option>{emps.map((e) => <option key={e.id} value={e.id}>{[e.profile?.name, e.profile?.lastName].filter(Boolean).join(' ')} ({e.employeeCode})</option>)}</Select></Label>
        <Label text="Leave type"><Select className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">Select…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Label>
        <Label text="Leave year starting"><input type="date" className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={yearStart} onChange={(e) => setYearStart(e.target.value)} /></Label>
        <button type="button" disabled={!employeeId || !typeId} onClick={run} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">Work it out</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {result === null && <p className="mt-3 text-sm text-gray-500">Employee not found.</p>}
      {result && (
        <div className="mt-4 space-y-3 text-sm">
          {result.winner ? (
            <p className="text-gray-800"><b className="text-lg">{result.quantity}</b> days for {result.yearStart} to {result.yearEnd}, from <b>{result.winner.policy}</b> ({result.winner.layer === 'STATUTORY' ? 'statutory' : 'company'}, {CREDIT_LABEL[result.winner.creditMethod as keyof typeof CREDIT_LABEL].toLowerCase()}). Before rounding: {result.raw}.</p>
          ) : (
            <p className="text-amber-700">No policy covers this employee and leave type on that date. The leave type's own setting is used instead.</p>
          )}
          {result.winner?.creditMethod === 'MONTHLY_LUMP' && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {result.confirmedOn
                ? `Date of confirmation: ${result.confirmedOn}. ${result.confirmedOn >= result.yearStart && result.confirmedOn <= result.yearEnd ? 'It falls in this leave year, so once that date is reached every remaining month of the year is credited at once.' : result.confirmedOn > result.yearEnd ? 'It is after this leave year, so the days are credited month by month.' : 'It was in an earlier leave year, so this year is credited month by month.'}`
                : 'No date of confirmation is set yet, so the days are credited month by month. The rest of the year is credited at once when a date of confirmation (on or before today) is set on the Employment tab.'}
            </p>
          )}
          {result.applied.length > 1 && <p className="text-xs text-gray-500">Both a statutory and a company policy apply. The higher figure is used.</p>}
          {result.lines.length > 0 && (
            <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
              {result.lines.map((l) => (
                <div key={l.from} className={`rounded-md border px-2 py-1.5 ${l.counted ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                  <p className="font-mono">{l.from.slice(0, 7)}</p><p className="font-semibold">{l.days}</p><p>{l.annualDays}/yr</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
