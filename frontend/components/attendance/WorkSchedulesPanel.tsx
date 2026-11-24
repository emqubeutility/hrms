import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { WorkSchedule, createWorkSchedule, getWorkSchedules, updateWorkSchedule } from '../../lib/attendance-api';
import Drawer, { fieldClass } from '../Drawer';

const blank = {
  code: '',
  name: '',
  scheduleType: 'FIXED' as 'FIXED' | 'FLEXIBLE',
  startTime: '09:00',
  endTime: '18:00',
  earliestStartTime: '',
  latestStartTime: '',
  requiredHours: '8',
  breakMinutes: '60',
  breakAfterHours: '5',
  isActive: true,
};

const hours = (min: number) => `${+(min / 60).toFixed(2)} h`;

/** Work schedules: required working time, fixed or flexible start, and the automatic break deduction. */
export default function WorkSchedulesPanel() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await getWorkSchedules()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load work schedules');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated]);

  const startNew = () => {
    setForm(blank);
    setEditing('new');
    setError('');
    setNotice('');
  };
  const startEdit = (s: WorkSchedule) => {
    setForm({
      code: s.code,
      name: s.name,
      scheduleType: s.scheduleType,
      startTime: s.startTime ?? '09:00',
      endTime: s.endTime ?? '18:00',
      earliestStartTime: s.earliestStartTime ?? '',
      latestStartTime: s.latestStartTime ?? '',
      requiredHours: String(+(s.requiredDailyMinutes / 60).toFixed(2)),
      breakMinutes: String(s.breakMinutes),
      breakAfterHours: String(+(s.breakAfterMinutes / 60).toFixed(2)),
      isActive: s.isActive,
    });
    setEditing(s.id);
    setError('');
    setNotice('');
  };

  const save = async () => {
    const required = Math.round(Number(form.requiredHours) * 60);
    const breakAfter = Math.round(Number(form.breakAfterHours || '0') * 60);
    if (!form.code.trim() || !form.name.trim()) return setError('Code and name are required');
    if (!Number.isFinite(required) || required < 1) return setError('Required hours per day must be more than zero');
    setSaving(true);
    setError('');
    try {
      const fixed = form.scheduleType === 'FIXED';
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        scheduleType: form.scheduleType,
        startTime: fixed ? form.startTime : null,
        endTime: fixed ? form.endTime : null,
        earliestStartTime: !fixed && form.earliestStartTime ? form.earliestStartTime : null,
        latestStartTime: !fixed && form.latestStartTime ? form.latestStartTime : null,
        requiredDailyMinutes: required,
        breakMinutes: Math.round(Number(form.breakMinutes || '0')),
        breakAfterMinutes: breakAfter,
        isActive: form.isActive,
      };
      if (editing === 'new') await createWorkSchedule(payload);
      else await updateWorkSchedule(editing as number, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<typeof blank>) => setForm((f) => ({ ...f, ...patch }));
  const fixed = form.scheduleType === 'FIXED';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Work schedules</h2>
          <p className="mt-1 text-gray-500">How much an employee should work, and when. Shifts, rosters and holidays are set up separately.</p>
        </div>
        <button type="button" onClick={startNew} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Add work schedule</button>
      </div>

      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Hours</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">Break</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No work schedules yet.</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className={!s.isActive ? 'bg-gray-50/60' : undefined}>
                  <td className="px-4 py-3 font-mono text-[13px] text-gray-700">{s.code}</td>
                  <td className={`px-4 py-3 font-medium ${s.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{s.name}</td>
                  <td className="px-4 py-3 text-gray-700">{s.scheduleType === 'FIXED' ? 'Fixed' : 'Flexible'}</td>
                  <td className="px-4 py-3 text-gray-700">{hours(s.requiredDailyMinutes)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.scheduleType === 'FIXED' ? `${s.startTime} – ${s.endTime}` : s.earliestStartTime ? `${s.earliestStartTime} – ${s.latestStartTime}` : 'Any time'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{s.breakMinutes ? `${s.breakMinutes} min${s.breakAfterMinutes ? ` after ${hours(s.breakAfterMinutes)}` : ''}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.isActive ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-500'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => startEdit(s)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? 'New work schedule' : 'Edit work schedule'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-1 block text-sm font-medium text-gray-700">Code
              <input className={`${fieldClass} font-mono uppercase`} maxLength={20} value={form.code} onChange={(e) => set({ code: e.target.value })} />
            </label>
            <label className="col-span-2 block text-sm font-medium text-gray-700">Name
              <input className={fieldClass} maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Type</legend>
            <div className="mt-1.5 flex gap-3">
              {(['FIXED', 'FLEXIBLE'] as const).map((t) => (
                <label key={t} className={`flex-1 cursor-pointer rounded-lg border p-3 text-sm ${form.scheduleType === t ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
                  <input type="radio" className="mr-2" checked={form.scheduleType === t} onChange={() => set({ scheduleType: t })} />
                  <span className="font-medium">{t === 'FIXED' ? 'Fixed hours' : 'Flexible hours'}</span>
                  <span className="mt-1 block text-xs text-gray-500">{t === 'FIXED' ? 'A set start and end time, such as 09:00 to 18:00.' : 'A required number of hours, starting any time (or within a window).'}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {fixed ? (
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm font-medium text-gray-700">Start time<input type="time" className={fieldClass} value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} /></label>
              <label className="block text-sm font-medium text-gray-700">End time<input type="time" className={fieldClass} value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} /></label>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">Earliest start<input type="time" className={fieldClass} value={form.earliestStartTime} onChange={(e) => set({ earliestStartTime: e.target.value })} /></label>
                <label className="block text-sm font-medium text-gray-700">Latest start<input type="time" className={fieldClass} value={form.latestStartTime} onChange={(e) => set({ latestStartTime: e.target.value })} /></label>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Optional start window. Leave both empty to allow any start time.</p>
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700">Required hours per day
            <input type="number" min="0.5" step="0.25" className={fieldClass} value={form.requiredHours} onChange={(e) => set({ requiredHours: e.target.value })} />
          </label>

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-700">Automatic break deduction</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-gray-600">Break (minutes)
                <input type="number" min="0" className={fieldClass} value={form.breakMinutes} onChange={(e) => set({ breakMinutes: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-gray-600">Only if worked at least (hours)
                <input type="number" min="0" step="0.5" className={fieldClass} value={form.breakAfterHours} onChange={(e) => set({ breakAfterHours: e.target.value })} />
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">The break is taken off the worked time. Use 0 minutes for no deduction, or 0 hours to always deduct.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Active
          </label>
        </Drawer>
      )}
    </div>
  );
}
