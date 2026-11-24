import React, { useEffect, useState } from 'react';
import { ShiftItem, ShiftPayload, getShifts, createShift, updateShift, deactivateShift, deleteMaster } from '../../lib/api';

interface FormState {
  name: string;
  startTime: string;
  endTime: string;
  lateMinutes: string;
  halfDayMinutes: string;
  altStartTime: string;
  altEndTime: string;
}

const emptyForm: FormState = {
  name: '',
  startTime: '',
  endTime: '',
  lateMinutes: '0',
  halfDayMinutes: '0',
  altStartTime: '',
  altEndTime: '',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The backend stores shift times as 1970-01-01T<HH:mm>; read them back as HH:mm. */
function toTimeInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(11, 16);
}

const inputClass =
  'mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-colors';

/** Attendance setup > Shifts: the work shifts employees are assigned to, with timing and grace rules. */
export default function ShiftsPanel() {
  const [items, setItems] = useState<ShiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    return getShifts()
      .then((res) => setItems(res.data))
      .catch((err: any) => setError(err.message || 'Could not load shifts'))
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

  const startEdit = (s: ShiftItem) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      startTime: toTimeInput(s.startTime),
      endTime: toTimeInput(s.endTime),
      lateMinutes: String(s.lateMinutes ?? 0),
      halfDayMinutes: String(s.halfDayMinutes ?? 0),
      altStartTime: toTimeInput(s.altStartTime),
      altEndTime: toTimeInput(s.altEndTime),
    });
    setError('');
    setNotice('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError('');
  };

  const validate = (): string => {
    if (!form.name.trim()) return 'Name is required';
    if (!TIME.test(form.startTime)) return 'Start time is required (HH:mm)';
    if (!TIME.test(form.endTime)) return 'End time is required (HH:mm)';
    if (!/^\d+$/.test(form.lateMinutes)) return 'Late minutes must be a whole number';
    if (!/^\d+$/.test(form.halfDayMinutes)) return 'Half-day minutes must be a whole number';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const payload: ShiftPayload = {
      name: form.name.trim(),
      startTime: form.startTime,
      endTime: form.endTime,
      lateMinutes: Number(form.lateMinutes),
      halfDayMinutes: Number(form.halfDayMinutes),
      altStartTime: form.altStartTime || undefined,
      altEndTime: form.altEndTime || undefined,
    };
    setSaving(true);
    setError('');
    try {
      if (editingId === 'new') await createShift(payload);
      else await updateShift(editingId as number, payload);
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: ShiftItem) => {
    setError('');
    setNotice('');
    try {
      if (s.isActive) {
        await deactivateShift(s.id);
      } else {
        await updateShift(s.id, { isActive: true });
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update status');
    }
  };

  const removeItem = async (s: ShiftItem) => {
    if (!window.confirm(`Delete "${s.name}" permanently? This cannot be undone. If it is in use you will be told to deactivate it instead.`)) return;
    setError('');
    setNotice('');
    try {
      await deleteMaster('shifts', s.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Shifts</h3>
          <p className="mt-1 text-sm text-gray-500">Work shifts with timing and grace rules. An employee without a roster works to their own shift.</p>
        </div>
        <button type="button" onClick={startNew} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
          Add shift
        </button>
      </div>

      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}
      {error && editingId === null && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Timing</th>
              <th className="px-4 py-3">Late / Half-day</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No shifts yet.</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className={!s.isActive ? 'bg-gray-50/60' : undefined}>
                  <td className={`px-4 py-3 font-medium ${s.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{s.name}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{toTimeInput(s.startTime)} – {toTimeInput(s.endTime)}</td>
                  <td className="px-4 py-3 text-gray-700">{s.lateMinutes}m / {s.halfDayMinutes}m</td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
                    ) : (
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" onClick={() => startEdit(s)} className="mr-4 text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button>
                    <button type="button" onClick={() => toggleActive(s)} className={`text-xs font-medium ${s.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => removeItem(s)} className="ml-4 text-xs font-medium text-red-600 hover:text-red-800">Delete</button>
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
              <h4 className="text-base font-semibold text-gray-900">{editingId === 'new' ? 'New shift' : 'Edit shift'}</h4>
              <button type="button" onClick={cancelEdit} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">×</button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

              <label className="block text-sm font-medium text-gray-700">
                Name
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Start time
                  <input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  End time
                  <input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Late after (minutes)
                  <input className={inputClass} value={form.lateMinutes} onChange={(e) => setForm({ ...form, lateMinutes: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Half-day threshold (minutes)
                  <input className={inputClass} value={form.halfDayMinutes} onChange={(e) => setForm({ ...form, halfDayMinutes: e.target.value })} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Alternate start time
                  <input type="time" className={inputClass} value={form.altStartTime} onChange={(e) => setForm({ ...form, altStartTime: e.target.value })} />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Alternate end time
                  <input type="time" className={inputClass} value={form.altEndTime} onChange={(e) => setForm({ ...form, altEndTime: e.target.value })} />
                </label>
              </div>
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
