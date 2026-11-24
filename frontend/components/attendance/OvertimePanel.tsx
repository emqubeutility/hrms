import React, { useEffect, useState } from 'react';
import {
  OvertimeConfigurationItem,
  OvertimeConfigurationPayload,
  OvertimeType,
  createOvertimeConfiguration,
  getOvertimeConfigurations,
  updateOvertimeConfiguration,
} from '../../lib/api';

interface FormState {
  name: string;
  type: OvertimeType;
  fixedAmount: string;
  weekdayMultiplier: string;
  weekendMultiplier: string;
}

const emptyForm: FormState = { name: '', type: 'FIXED_PER_DAY', fixedAmount: '', weekdayMultiplier: '', weekendMultiplier: '' };

const TYPE_LABEL: Record<OvertimeType, string> = {
  FIXED_PER_DAY: 'Fixed per weekend or holiday day',
  FIXED_MONTHLY: 'Fixed monthly',
  HOURLY: 'Hourly',
};

const inputClass =
  'mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-colors';

/** One line that says what the rule pays, for the list. */
function describe(c: OvertimeConfigurationItem): string {
  if (c.type === 'FIXED_PER_DAY') return `AED ${c.fixedAmount ?? 0} per weekend or holiday day worked`;
  if (c.type === 'FIXED_MONTHLY') return `AED ${c.fixedAmount ?? 0} per month`;
  const parts: string[] = [];
  if (c.weekdayMultiplier !== null) parts.push(`${c.weekdayMultiplier}x weekday`);
  if (c.weekendMultiplier !== null) parts.push(`${c.weekendMultiplier}x weekend or holiday`);
  return `Hours x hourly rate: ${parts.join(', ')}`;
}

/** Attendance setup > Overtime: OT rules to assign to employees in their profile (Attendance section). */
export default function OvertimePanel() {
  const [items, setItems] = useState<OvertimeConfigurationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    return getOvertimeConfigurations()
      .then((res) => setItems(res.data))
      .catch((err: any) => setError(err.message || 'Could not load overtime configurations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setEditingId('new');
    setForm(emptyForm);
    setError('');
    setNotice('');
  };

  const startEdit = (c: OvertimeConfigurationItem) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      fixedAmount: c.fixedAmount === null ? '' : String(c.fixedAmount),
      weekdayMultiplier: c.weekdayMultiplier === null ? '' : String(c.weekdayMultiplier),
      weekendMultiplier: c.weekendMultiplier === null ? '' : String(c.weekendMultiplier),
    });
    setError('');
    setNotice('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
  };

  const isFixed = form.type !== 'HOURLY';

  /** Builds the payload; the server checks the rule again and is the final word. */
  const buildPayload = (): OvertimeConfigurationPayload | string => {
    if (!form.name.trim()) return 'Name is required';
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    if (isFixed) {
      const amount = num(form.fixedAmount);
      if (amount === null || !(amount > 0)) return 'Enter the fixed amount (more than 0)';
      return { name: form.name.trim(), type: form.type, fixedAmount: amount, weekdayMultiplier: null, weekendMultiplier: null };
    }
    const weekday = num(form.weekdayMultiplier);
    const weekend = num(form.weekendMultiplier);
    if (weekday === null && weekend === null) return 'Enter a weekday multiplier, a weekend or holiday multiplier, or both';
    return { name: form.name.trim(), type: 'HOURLY', fixedAmount: null, weekdayMultiplier: weekday, weekendMultiplier: weekend };
  };

  const save = async () => {
    const payload = buildPayload();
    if (typeof payload === 'string') {
      setError(payload);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') await createOvertimeConfiguration(payload);
      else await updateOvertimeConfiguration(editingId as number, payload);
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: OvertimeConfigurationItem) => {
    setError('');
    setNotice('');
    try {
      await updateOvertimeConfiguration(c.id, { isActive: !c.isActive });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update status');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Overtime (OT)</h3>
          <p className="mt-1 text-sm text-gray-500">
            OT rules to assign to employees in their profile (Attendance section). An employee has one fixed rule, or hourly rules.
            Deactivated rules stay on the employees who already have them.
          </p>
        </div>
        <button type="button" onClick={startNew} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
          Add OT rule
        </button>
      </div>

      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}
      {error && editingId === null && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Pays</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No overtime rules yet.</td></tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className={!c.isActive ? 'bg-gray-50/60' : undefined}>
                  <td className={`px-4 py-3 font-medium ${c.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{c.name}</td>
                  <td className="px-4 py-3 text-gray-700">{TYPE_LABEL[c.type]}</td>
                  <td className="px-4 py-3 text-gray-700">{describe(c)}</td>
                  <td className="px-4 py-3">
                    {c.isActive ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
                    ) : (
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" onClick={() => startEdit(c)} className="mr-4 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                    <button type="button" onClick={() => toggleActive(c)} className={`text-xs font-medium ${c.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={cancelEdit} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h4 className="text-base font-semibold text-gray-900">{editingId === 'new' ? 'New OT rule' : 'Edit OT rule'}</h4>
              <button type="button" onClick={cancelEdit} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">×</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

              <label className="block text-sm font-medium text-gray-700">
                Name
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Type
                <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as OvertimeType })}>
                  <option value="FIXED_PER_DAY">Fixed per weekend or holiday day</option>
                  <option value="FIXED_MONTHLY">Fixed monthly</option>
                  <option value="HOURLY">Hourly (OT hours x hourly rate)</option>
                </select>
              </label>

              {isFixed ? (
                <label className="block text-sm font-medium text-gray-700">
                  {form.type === 'FIXED_PER_DAY' ? 'Amount per weekend or holiday day (AED)' : 'Amount per month (AED)'}
                  <input className={inputClass} inputMode="decimal" value={form.fixedAmount} onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })} />
                  <span className="mt-1 block text-xs font-normal text-gray-500">An employee can have a different amount in their profile.</span>
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Weekday multiplier
                    <input className={inputClass} inputMode="decimal" placeholder="e.g. 1.25" value={form.weekdayMultiplier} onChange={(e) => setForm({ ...form, weekdayMultiplier: e.target.value })} />
                    <span className="mt-1 block text-xs font-normal text-gray-500">Leave blank if not paid</span>
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Weekend / holiday multiplier
                    <input className={inputClass} inputMode="decimal" placeholder="e.g. 1.5" value={form.weekendMultiplier} onChange={(e) => setForm({ ...form, weekendMultiplier: e.target.value })} />
                    <span className="mt-1 block text-xs font-normal text-gray-500">Leave blank if not paid</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
              <button onClick={cancelEdit} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
