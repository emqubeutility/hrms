import React, { useCallback, useEffect, useState } from 'react';
import { getParameters } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { UserType } from '../../lib/user-types';
import { CountryItem, getCountries } from '../../lib/api';
import { LeaveSettings, LeaveType, LeaveTypePayload, createLeaveType, deleteLeaveType, getLeaveConfig, runAccrual, saveLeaveSettings, syncCompOff, updateLeaveType } from '../../lib/leave-api';
import Drawer, { fieldClass } from '../Drawer';
import Select from '../Select';
import LeavePoliciesPanel from '../leave/LeavePoliciesPanel';

const blankType: LeaveTypePayload = {
  code: '', name: '', isPaid: true, balanceTracking: true, accrual: 'NONE', annualDays: 0, allowHalfDay: true, allowNegative: false,
  requiresDocument: false, documentAfterDays: 0, maxDaysPerRequest: null, isSandwichEligible: false, requiresApproval: true, isEncashable: false, excludeWeeklyOffs: true, excludeHolidays: true, resetBalance: true, carryForwardType: 'NONE', carryForwardRules: [], genderRestriction: null, maxTimesInService: null, eventWindowMonths: null, eventLabel: null, payPercent: 100, unlockAfterTypeIds: [], variants: [], variantLabel: null, calendarStartMonth: 1, isCompOff: false, isActive: true,
  countryCodes: [],
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A titled block of related settings in the leave type form. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-gray-200 pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
      {children}
    </section>
  );
}

/** An on / off switch with a label and a line of help. */
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-700">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-gray-500">{hint}</span>}</span>
    </label>
  );
}

/** System Settings > Leave configuration: leave types, the sandwich leave switch, comp off, and the leave year. */
export default function LeaveConfigPanel() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.userTypeId === UserType.SystemAdmin;
  // Two parts: the leave types and settings, and the leave policies (who gets how many days).
  const [part, setPart] = useState<'config' | 'policies'>('config');
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [settings, setSettings] = useState<LeaveSettings | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; form: LeaveTypePayload } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [countries, setCountries] = useState<CountryItem[]>([]);

  const [categories, setCategories] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const r = (await getLeaveConfig()).data;
      setTypes(r.types);
      setSettings(r.settings);
    } catch (e: any) {
      setError(e.message || 'Could not load the leave configuration');
    }
  }, []);
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      load();
      getParameters('Employee Category').then((r) => setCategories((r.data as any[]).map((p) => p.text))).catch(() => setCategories([]));
      getCountries().then((r) => setCountries(r.data.filter((c) => c.isActive))).catch(() => setCountries([]));
    }
  }, [isAuthenticated, isAdmin, load]);

  const countryLabel = (codes: string[]) => (!codes || codes.length === 0 ? 'All countries' : codes.map((c) => countries.find((x) => x.isoCode === c)?.name ?? c).join(', '));

  const saveType = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.code.trim() || !f.name.trim()) return setError('Code and name are required');
    setSaving(true);
    setError('');
    try {
      const { id: _id, sortOrder: _sort, ...fields } = f as typeof f & { id?: number; sortOrder?: number };
      const payload = { ...fields, annualDays: Number(f.annualDays), maxDaysPerRequest: f.maxDaysPerRequest ? Number(f.maxDaysPerRequest) : null };
      if (editing.id === null) await createLeaveType(payload);
      else await updateLeaveType(editing.id, payload);
      setEditing(null);
      setNotice('Leave type saved');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setError('');
    setNotice('');
    try {
      await saveLeaveSettings({ ...settings, compOffCreditDays: Number(settings.compOffCreditDays), compOffExpiryDays: settings.compOffExpiryDays ? Number(settings.compOffExpiryDays) : null });
      setNotice('Settings saved');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    }
  };

  if (isAuthenticated && !isAdmin) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Only System Admin can change the leave configuration.</div>;

  const check = 'rounded border-gray-300 text-blue-600 focus:ring-blue-500';
  const set = (patch: Partial<LeaveSettings>) => settings && setSettings({ ...settings, ...patch });
  const removeType = async (t: LeaveType) => {
    if (!window.confirm(`Delete the leave type "${t.name}"?`)) return;
    setError('');
    setNotice('');
    try {
      await deleteLeaveType(t.id);
      setNotice('Leave type deleted');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete');
    }
  };
  const setF = (patch: Partial<LeaveTypePayload>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  if (part === 'policies') {
    return (
      <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Leave configuration</h2>
            <p className="mt-1 text-gray-500">Leave types, the sandwich leave policy, comp off and the leave year.</p>
          </div>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
            {([['config', 'Leave types and settings'], ['policies', 'Leave policies']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={part === k} type="button" onClick={() => { setPart(k); setError(''); setNotice(''); }} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${part === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
            ))}
          </div>
        <LeavePoliciesPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Leave configuration</h2>
        <p className="mt-1 text-gray-500">Leave types, the sandwich leave policy, comp off and the leave year.</p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
        {([['config', 'Leave types and settings'], ['policies', 'Leave policies']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={part === k} type="button" onClick={() => { setPart(k); setError(''); setNotice(''); }} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${part === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
        ))}
      </div>
      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Leave types</h3>
          <button type="button" onClick={() => { setError(''); setEditing({ id: null, form: { ...blankType } }); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Add leave type</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Entitlement</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Sandwich</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {types.map((t) => (
                <tr key={t.id} className={!t.isActive ? 'bg-gray-50/60' : undefined}>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{t.code}</td>
                  <td className={`px-4 py-3 font-medium ${t.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{t.name}</td>
                  <td className="px-4 py-3 text-gray-700">{t.isPaid ? 'Paid' : 'Unpaid'}</td>
                  <td className="px-4 py-3 text-gray-700">{t.isCompOff ? 'Earned (comp off)' : !t.balanceTracking ? 'No balance kept' : t.accrual === 'NONE' ? 'Set by HR' : `${t.annualDays} days / year, ${t.accrual === 'MONTHLY' ? 'monthly' : 'yearly'}`}</td>
                  <td className="px-4 py-3 text-gray-700">{countryLabel(t.countryCodes)}</td>
                  <td className="px-4 py-3">{t.isSandwichEligible ? <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">Eligible</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.isActive ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-500'}`}>{t.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => { setError(''); setEditing({ id: t.id, form: { ...t } }); }} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button><button type="button" onClick={() => removeType(t)} className="ml-3 text-xs font-medium text-red-600 hover:text-red-800">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {settings && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">Sandwich leave</h3>
            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" className={`${check} mt-0.5`} checked={settings.sandwichEnabled} onChange={(e) => set({ sandwichEnabled: e.target.checked })} />
              <span><span className="font-medium">Apply the sandwich leave policy</span><span className="block text-xs text-gray-500">Off by default. It applies only to leave types marked eligible, and some laws override a company rule, so check before turning it on.</span></span>
            </label>
            <fieldset disabled={!settings.sandwichEnabled} className="space-y-3 disabled:opacity-50">
              <label className="flex items-center gap-3 text-sm text-gray-700"><input type="checkbox" className={check} checked={settings.sandwichWeeklyOffs} onChange={(e) => set({ sandwichWeeklyOffs: e.target.checked })} />Count weekly offs</label>
              <label className="flex items-center gap-3 text-sm text-gray-700"><input type="checkbox" className={check} checked={settings.sandwichHolidays} onChange={(e) => set({ sandwichHolidays: e.target.checked })} />Count public holidays</label>
              <label className="flex items-start gap-3 text-sm text-gray-700"><input type="checkbox" className={`${check} mt-0.5`} checked={settings.sandwichRequireBothSides} onChange={(e) => set({ sandwichRequireBothSides: e.target.checked })} /><span>Leave must be on both sides<span className="block text-xs text-gray-500">Off: leave right before or right after the off days is enough.</span></span></label>
            </fieldset>
          </div>

          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900">Comp off</h3>
            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" className={`${check} mt-0.5`} checked={settings.compOffEnabled} onChange={(e) => set({ compOffEnabled: e.target.checked })} />
              <span><span className="font-medium">Earn comp off for working on a weekly off or holiday</span><span className="block text-xs text-gray-500">Credited the moment a manager ticks "Eligible for comp off" while approving the day, if enough time was worked.</span></span>
            </label>
            <fieldset disabled={!settings.compOffEnabled} className="grid grid-cols-3 gap-3 disabled:opacity-50">
              <label className="text-xs font-medium text-gray-600">Days credited<input type="number" step="0.25" min="0.25" className={fieldClass} value={settings.compOffCreditDays} onChange={(e) => set({ compOffCreditDays: e.target.value })} /></label>
              <label className="text-xs font-medium text-gray-600">Expires after (days)<input type="number" min="1" placeholder="Never" className={fieldClass} value={settings.compOffExpiryDays ?? ''} onChange={(e) => set({ compOffExpiryDays: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="text-xs font-medium text-gray-600">Minimum worked (min)<input type="number" min="0" className={fieldClass} value={settings.compOffMinWorkedMinutes} onChange={(e) => set({ compOffMinWorkedMinutes: Number(e.target.value) })} /></label>
            </fieldset>
          </div>
          <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={saveSettings} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Save settings</button>
            <button type="button" onClick={async () => { setError(''); try { const r = (await runAccrual()).data; setNotice(`Accrual for ${r.leaveYear}: ${r.credited} credited, ${r.alreadyCredited} already done.`); } catch (e: any) { setError(e.message); } }} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Credit leave now</button>
            <button type="button" onClick={async () => { setError(''); try { const r = (await syncCompOff()).data; setNotice(`Comp off checked: ${r.granted} new credit(s).`); } catch (e: any) { setError(e.message); } }} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Check comp off now</button>
            <span className="text-xs text-gray-500">Credit leave now also runs every night. Comp off is credited at approval; use this only to catch up older days. Running either again never credits twice.</span>
          </div>
        </section>
      )}

      {editing && (
        <Drawer
          title={editing.id === null ? 'New leave type' : `Edit ${editing.form.name}`}
          wide
          onClose={() => setEditing(null)}
          footer={<>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={saveType} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

          <Group title="Basics">
            <div className="grid grid-cols-3 gap-4">
              <label className="col-span-1 block text-sm font-medium text-gray-700">Code<input className={`${fieldClass} font-mono uppercase`} maxLength={10} value={editing.form.code} onChange={(e) => setF({ code: e.target.value })} /></label>
              <label className="col-span-2 block text-sm font-medium text-gray-700">Name<input className={fieldClass} maxLength={60} value={editing.form.name} onChange={(e) => setF({ name: e.target.value })} /></label>
            </div>
            <label className="block text-sm font-medium text-gray-700">Countries
              <Select
                multiple
                className={fieldClass}
                values={editing.form.countryCodes}
                onValuesChange={(v) => setF({ countryCodes: v })}
                options={countries.map((c) => ({ value: c.isoCode, label: c.name }))}
                allText="All countries"
                noun="countries"
                placeholder={countries.length === 0 ? 'Add countries in System Settings first' : 'Select…'}
              />
              <span className="mt-1 block text-xs text-gray-500">Leave empty for every country, or pick which ones this leave type applies to.</span>
            </label>
          </Group>

          <Group title="Days">
            <Switch label="Paid leave" checked={editing.form.isPaid} onChange={(v) => setF({ isPaid: v })} />
            <Switch label="Keep a balance" hint="Off for types such as loss of pay, where days are recorded but not limited." checked={editing.form.balanceTracking} onChange={(v) => setF({ balanceTracking: v, ...(v ? {} : { accrual: 'NONE' as const, resetBalance: true }) })} />
            {editing.form.balanceTracking && !editing.form.isCompOff && (
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">How days are credited
                  <Select className={fieldClass} value={editing.form.accrual} onChange={(e) => setF({ accrual: e.target.value as LeaveType['accrual'] })}>
                    <option value="NONE">Not credited automatically</option><option value="ANNUAL">All at the start of the calendar</option><option value="MONTHLY">A twelfth each month</option>
                  </Select>
                </label>
                <label className="block text-sm font-medium text-gray-700">Days per year<input type="number" min="0" step="0.5" disabled={editing.form.accrual === 'NONE'} className={fieldClass} value={editing.form.annualDays} onChange={(e) => setF({ annualDays: e.target.value })} /></label>
                <p className="col-span-2 -mt-2 text-xs text-gray-500">Used only when no leave policy covers the employee. Policies are under the Leave policies tab.</p>
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700">Longest request (days)<input type="number" min="1" placeholder="No limit" className={fieldClass} value={editing.form.maxDaysPerRequest ?? ''} onChange={(e) => setF({ maxDaysPerRequest: e.target.value ? Number(e.target.value) : null })} /></label>
            <Switch label="Allow half days" checked={editing.form.allowHalfDay} onChange={(v) => setF({ allowHalfDay: v })} />
            {editing.form.balanceTracking && <Switch label="Allow going over the balance" hint="The days beyond the balance are recorded, not blocked." checked={editing.form.allowNegative} onChange={(v) => setF({ allowNegative: v })} />}
          </Group>

          <Group title="Approval and documents">
            <Switch label="Require approval" hint="Off: the leave is approved the moment the employee sends it, and the days come off the balance at once." checked={editing.form.requiresApproval} onChange={(v) => setF({ requiresApproval: v })} />
            <Switch label="Require attachment" hint="Reminds the employee that a document is needed. Uploading a file with the request is not built yet; HR keeps the document." checked={editing.form.requiresDocument} onChange={(v) => setF({ requiresDocument: v })} />
            {editing.form.requiresDocument && (
              <label className="block text-sm font-medium text-gray-700">Needed when the leave is longer than (days)<input type="number" min="0" className={fieldClass} value={editing.form.documentAfterDays} onChange={(e) => setF({ documentAfterDays: Number(e.target.value) })} /><span className="mt-1 block text-xs text-gray-500">0 means always.</span></label>
            )}
          </Group>

          <Group title="Days that count">
            <Switch label="Exclude company weekly off" hint="A weekly off inside the request is not counted as leave. Off: it counts like a working day." checked={editing.form.excludeWeeklyOffs} onChange={(v) => setF({ excludeWeeklyOffs: v })} />
            <Switch label="Exclude holidays" hint="A holiday inside the request is not counted as leave. Off: it counts like a working day." checked={editing.form.excludeHolidays} onChange={(v) => setF({ excludeHolidays: v })} />
            <Switch label="Eligible for the sandwich leave policy" hint="Used only when the sandwich policy is switched on in this page." checked={editing.form.isSandwichEligible} onChange={(v) => setF({ isSandwichEligible: v })} />
          </Group>

          {editing.form.balanceTracking && (
            <Group title="Reset and calendar">
              <Switch label="Reset leave balance" hint="On: the days credited end with the calendar period you choose below. Off: they never expire." checked={editing.form.resetBalance} onChange={(v) => setF({ resetBalance: v, ...(v ? {} : { carryForwardType: 'NONE' as const }) })} />
              {editing.form.resetBalance && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block text-sm font-medium text-gray-700">Calendar starts in
                      <Select className={fieldClass} value={editing.form.calendarStartMonth ?? 1} onChange={(e) => setF({ calendarStartMonth: Number(e.target.value) })}>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </Select>
                    </label>
                    <label className="block text-sm font-medium text-gray-700">Calendar ends in
                      <Select className={fieldClass} value={(((editing.form.calendarStartMonth ?? 1) + 10) % 12) + 1} onChange={(e) => setF({ calendarStartMonth: (Number(e.target.value) % 12) + 1 })}>
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </Select>
                    </label>
                    <p className="col-span-2 -mt-2 text-xs text-gray-500">The days credited for this leave type follow this calendar. Choosing the start sets the end. Do not change it once days have been credited.</p>
                  </div>
                  <label className="block text-sm font-medium text-gray-700">Carryforward type
                    <Select className={fieldClass} value={editing.form.carryForwardType} onChange={(e) => setF({ carryForwardType: e.target.value as LeaveTypePayload['carryForwardType'] })}>
                      <option value="NONE">No carryforward</option>
                      <option value="CARRY_FORWARD">Carryforward</option>
                    </Select>
                    <span className="mt-1 block text-xs text-gray-500">{editing.form.carryForwardType === 'CARRY_FORWARD' ? 'Unused days move on into the next calendar period instead of being lost. There is no limit on how many.' : 'Unused days are lost when the calendar period ends.'}</span>
                  </label>
                  {editing.form.carryForwardType === 'CARRY_FORWARD' && (
                    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                      <p className="text-sm font-medium text-gray-700">What happens by employee category</p>
                      <p className="text-xs text-gray-500">Without a line for someone's category, their days are simply carried forward.</p>
                      {(editing.form.carryForwardRules ?? []).map((r, i) => {
                        const setRuleAt = (patch: Partial<LeaveTypePayload['carryForwardRules'][number]>) => setF({ carryForwardRules: editing.form.carryForwardRules.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                        return (
                          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                            <label className="block text-xs text-gray-600">Category
                              <Select className={fieldClass} value={r.category} onChange={(e) => setRuleAt({ category: e.target.value })}>
                                <option value="">Everyone else</option>
                                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                              </Select>
                            </label>
                            <label className="block text-xs text-gray-600">Carried-forward days
                              <Select className={fieldClass} value={r.action} onChange={(e) => setRuleAt({ action: e.target.value as typeof r.action })}>
                                <option value="KEEP">Stay as this leave</option>
                                <option value="UNPAID_LEAVE">Become unpaid leave</option>
                                <option value="LEAVE_SALARY">Paid as leave salary</option>
                                <option value="LAPSE">Are lost</option>
                              </Select>
                            </label>
                            <button type="button" className="pb-2 text-xs text-red-600" onClick={() => setF({ carryForwardRules: editing.form.carryForwardRules.filter((_, k) => k !== i) })}>Remove</button>
                            {r.action === 'UNPAID_LEAVE' && (
                              <label className="col-span-2 block text-xs text-gray-600">Unpaid leave type they become
                                <Select className={fieldClass} value={r.targetLeaveTypeId ?? ''} onChange={(e) => setRuleAt({ targetLeaveTypeId: e.target.value ? Number(e.target.value) : null })}>
                                  <option value="">Choose…</option>
                                  {types.filter((t) => t.balanceTracking && !t.isCompOff && !t.isPaid && t.id !== editing.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </Select>
                              </label>
                            )}
                            {r.action === 'LEAVE_SALARY' && <p className="col-span-3 text-xs text-gray-500">The days leave the balance and are recorded as leave salary due. Payroll will pick them up when it is built.</p>}
                          </div>
                        );
                      })}
                      <button type="button" className="text-sm text-blue-600" onClick={() => setF({ carryForwardRules: [...(editing.form.carryForwardRules ?? []), { category: '', action: 'KEEP' }] })}>+ Add a category</button>
                    </div>
                  )}
                </>
              )}
            </Group>
          )}

          <Group title="Who can take it, and when">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-gray-700">Only for
                <Select className={fieldClass} value={editing.form.genderRestriction ?? ''} onChange={(e) => setF({ genderRestriction: e.target.value || null })}>
                  <option value="">Everyone</option><option value="Female">Female employees</option><option value="Male">Male employees</option>
                </Select>
              </label>
              <label className="block text-sm font-medium text-gray-700">Times in a whole employment<input type="number" min="1" placeholder="No limit" className={fieldClass} value={editing.form.maxTimesInService ?? ''} onChange={(e) => setF({ maxTimesInService: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="block text-sm font-medium text-gray-700">Must be taken within (months)<input type="number" min="1" placeholder="No limit" className={fieldClass} value={editing.form.eventWindowMonths ?? ''} onChange={(e) => setF({ eventWindowMonths: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="block text-sm font-medium text-gray-700">…of this date<input disabled={!editing.form.eventWindowMonths} className={fieldClass} placeholder="Child's date of birth" value={editing.form.eventLabel ?? ''} onChange={(e) => setF({ eventLabel: e.target.value || null })} /></label>
              <label className="block text-sm font-medium text-gray-700">Salary paid (%)<input type="number" min="0" max="100" className={fieldClass} value={editing.form.payPercent} onChange={(e) => setF({ payPercent: Number(e.target.value) })} /></label>
              <label className="col-span-2 block text-sm font-medium text-gray-700">Available only after these are used up
                <Select multiple className={fieldClass} values={(editing.form.unlockAfterTypeIds ?? []).map(String)} onValuesChange={(v) => setF({ unlockAfterTypeIds: v.map(Number) })} options={types.filter((t) => t.balanceTracking && t.id !== editing.id).map((t) => ({ value: String(t.id), label: t.name }))} allText="Always available" noun="leave types" placeholder="Always available" />
                <span className="mt-1 block text-xs text-gray-500">The employee sees this leave type only when the balance of every chosen type is zero (for example half-pay medical leave after the full-pay medical leave).</span>
              </label>
              <div className="col-span-2 space-y-2 rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-700">Choices when applying (optional)</p>
                <p className="text-xs text-gray-500">For example bereavement by relationship. The employee picks one, and each choice has its own longest leave.</p>
                {(editing.form.variants ?? []).length > 0 && <input className={fieldClass} placeholder="What the choice is called, for example Relationship" value={editing.form.variantLabel ?? ''} onChange={(e) => setF({ variantLabel: e.target.value || null })} />}
                {(editing.form.variants ?? []).map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                    <input className={fieldClass} placeholder="Choice" value={v.label} onChange={(e) => setF({ variants: editing.form.variants.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                    <input type="number" min="1" className={fieldClass} placeholder="Days" value={v.maxDays} onChange={(e) => setF({ variants: editing.form.variants.map((x, k) => (k === i ? { ...x, maxDays: Number(e.target.value) } : x)) })} />
                    <button type="button" className="text-xs text-red-600" onClick={() => setF({ variants: editing.form.variants.filter((_, k) => k !== i) })}>Remove</button>
                  </div>
                ))}
                <button type="button" className="text-sm text-blue-600" onClick={() => setF({ variants: [...(editing.form.variants ?? []), { label: '', maxDays: 1 }] })}>+ Add a choice</button>
              </div>
              <p className="col-span-2 -mt-2 text-xs text-gray-500">100 is full pay, 50 half pay, 0 unpaid. It is kept for payroll; nothing pays it out yet.</p>
            </div>
          </Group>

          <details className="group rounded-lg border border-gray-200 px-4 py-3" open={editing.form.isCompOff || editing.form.isEncashable || !editing.form.isActive}>
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">More options</summary>
            <div className="mt-3 space-y-3">
              <Switch label="Encashable" hint="Marks leave that may be paid out when unused. Recorded for later: nothing pays it out yet." checked={editing.form.isEncashable} onChange={(v) => setF({ isEncashable: v })} />
              <Switch label="Comp off" hint="Earned by working on an off day instead of being credited by a calendar." checked={editing.form.isCompOff} onChange={(v) => setF({ isCompOff: v, ...(v ? { accrual: 'NONE' as const } : {}) })} />
              <Switch label="Active" checked={editing.form.isActive} onChange={(v) => setF({ isActive: v })} />
            </div>
          </details>
        </Drawer>
      )}
    </div>
  );
}
