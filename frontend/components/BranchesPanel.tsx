import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { BranchPayload, BranchRow, createBranch, deleteBranch, getBranchesToManage, updateBranch } from '../lib/api';
import Drawer, { fieldClass } from './Drawer';
import Select from './Select';

type Country = { isoCode: string; name: string; defaultTimezone: string };

const blank = (): BranchPayload => ({ code: '', name: '', countryCode: null, timezone: null, employeeCodePrefix: null, address: null, city: null, phone: null, email: null, isActive: true, sortOrder: 0 });

const timeZones: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    return ['Asia/Dubai', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'UTC'];
  }
})();

const Label = ({ text, children }: { text: string; children: React.ReactNode }) => <label className="block text-xs font-medium text-gray-600">{text}{children}</label>;

/** HR and System Admin: the places the company works from, each with its country and timezone. */
export default function BranchesPanel() {
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; form: BranchPayload } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getBranchesToManage();
      setRows(r.data.branches);
      setCountries(r.data.countries);
    } catch (e: any) {
      setError(e.message || 'Could not load branches');
    }
  }, []);
  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const setForm = (patch: Partial<BranchPayload>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));
  const countryName = (c: string | null) => countries.find((x) => x.isoCode === c)?.name ?? c ?? '';

  const save = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim() || !f.code.trim()) return setError('Name and code are required');
    setSaving(true);
    setError('');
    try {
      const payload = { ...f, code: f.code.trim(), name: f.name.trim() };
      if (editing.id === null) await createBranch(payload);
      else await updateBranch(editing.id, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: BranchRow) => {
    if (!window.confirm(`Delete the branch "${b.name}"?`)) return;
    setError('');
    setNotice('');
    try {
      await deleteBranch(b.id);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete');
    }
  };

  const chosen = countries.find((c) => c.isoCode === editing?.form.countryCode);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Branches</h3>
          <p className="mt-1 max-w-2xl text-gray-500">The places the company works from. A branch has a country (from System settings → Countries) and optionally its own timezone. Branches appear in the header switcher, on each employee, and in holiday calendars and policies.</p>
        </div>
        <button type="button" onClick={() => { setEditing({ id: null, form: blank() }); setError(''); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Add branch</button>
      </div>
      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Timezone</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Employees</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No branches yet.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className={b.isActive ? '' : 'opacity-60'}>
                <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-gray-600">{b.code}</td>
                <td className="px-4 py-3 text-gray-700">{b.countryCode ? countryName(b.countryCode) : <span className="text-amber-700">Not set</span>}</td>
                <td className="px-4 py-3 text-gray-700">{b.timezone ?? <span className="text-gray-400">{countries.find((c) => c.isoCode === b.countryCode)?.defaultTimezone ?? 'Country default'}</span>}</td>
                <td className="px-4 py-3 text-gray-700">{b.city ?? ''}</td>
                <td className="px-4 py-3 text-gray-700">{b.employeeCount}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{b.isActive ? 'Active' : 'Switched off'}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => { setEditing({ id: b.id, form: { code: b.code, name: b.name, countryCode: b.countryCode, timezone: b.timezone ?? null, employeeCodePrefix: b.employeeCodePrefix, address: b.address, city: b.city, phone: b.phone, email: b.email, isActive: b.isActive, sortOrder: b.sortOrder } }); setError(''); }} className="text-sm font-medium text-blue-600 hover:text-blue-800">Edit</button>
                  <button type="button" onClick={() => remove(b)} className="ml-3 text-sm text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer
          title={editing.id === null ? 'Add branch' : editing.form.name || 'Branch'}
          onClose={() => setEditing(null)}
          footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="Name"><input className={fieldClass} value={editing.form.name} maxLength={100} onChange={(e) => setForm({ name: e.target.value })} /></Label>
            <Label text="Code"><input className={fieldClass} value={editing.form.code} maxLength={20} placeholder="DXB" onChange={(e) => setForm({ code: e.target.value.toUpperCase() })} /></Label>
          </div>
          <Label text="Country">
            <Select className={fieldClass} value={editing.form.countryCode ?? ''} onChange={(e) => setForm({ countryCode: e.target.value || null })}>
              <option value="">Select…</option>
              {countries.map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
            </Select>
          </Label>
          {countries.length === 0 && <p className="text-xs text-amber-700">No countries yet. Add them in System settings → Countries first.</p>}
          <Label text="Timezone (optional)">
            <input className={fieldClass} list="branch-tz" value={editing.form.timezone ?? ''} placeholder={chosen ? `Uses ${chosen.defaultTimezone}` : 'Uses the country timezone'} onChange={(e) => setForm({ timezone: e.target.value || null })} />
            <datalist id="branch-tz">{timeZones.map((z) => <option key={z} value={z} />)}</datalist>
          </Label>
          <Label text="Employee code prefix (optional)">
            <input className={fieldClass} value={editing.form.employeeCodePrefix ?? ''} maxLength={10} placeholder="EA-" onChange={(e) => setForm({ employeeCodePrefix: e.target.value.toUpperCase() || null })} />
            <span className="mt-1 block text-xs text-gray-500">New employees of this branch get codes like {(editing.form.employeeCodePrefix || 'EA-')}001, {(editing.form.employeeCodePrefix || 'EA-')}002. Empty: the code comes from the employee type.</span>
          </Label>
          <Label text="Address"><textarea className={fieldClass} rows={2} maxLength={300} value={editing.form.address ?? ''} onChange={(e) => setForm({ address: e.target.value || null })} /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="City"><input className={fieldClass} value={editing.form.city ?? ''} maxLength={80} onChange={(e) => setForm({ city: e.target.value || null })} /></Label>
            <Label text="Phone"><input className={fieldClass} value={editing.form.phone ?? ''} maxLength={40} onChange={(e) => setForm({ phone: e.target.value || null })} /></Label>
            <Label text="Email"><input type="email" className={fieldClass} value={editing.form.email ?? ''} maxLength={120} onChange={(e) => setForm({ email: e.target.value || null })} /></Label>
            <Label text="Order in lists"><input type="number" min={0} className={fieldClass} value={editing.form.sortOrder} onChange={(e) => setForm({ sortOrder: Number(e.target.value) })} /></Label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={editing.form.isActive} onChange={(e) => setForm({ isActive: e.target.checked })} /> Active (switching off hides it from lists)</label>
        </Drawer>
      )}
    </div>
  );
}
