import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { WeeklyOffRule, WeeklyOffTemplate, createWeeklyOffTemplate, deleteWeeklyOffTemplate, getWeeklyOffTemplates, updateWeeklyOffTemplate } from '../../lib/attendance-api';
import Drawer, { fieldClass } from '../Drawer';
import Select from '../Select';

/** Days shown Monday first; the number is the weekday used by the server (0 = Sunday ... 6 = Saturday). */
const WEEK: { day: number; short: string; long: string }[] = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 0, short: 'Sun', long: 'Sunday' },
];
const WEEKS: { value: number; label: string }[] = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
  { value: 5, label: '5th' },
  { value: -1, label: 'Last' },
];

type Mode = 'WORK' | 'ALL' | 'WEEKS' | 'ALTERNATE';
type DayRow = { mode: Mode; weeks: number[]; anchor: string };
type Form = { name: string; rows: Record<number, DayRow>; note: string; isActive: boolean };

const emptyRows = (): Record<number, DayRow> => Object.fromEntries(WEEK.map((w) => [w.day, { mode: 'WORK' as Mode, weeks: [], anchor: '' }]));
const blank = (): Form => ({ name: '', rows: emptyRows(), note: '', isActive: true });

const rowsFrom = (t: WeeklyOffTemplate): Record<number, DayRow> => {
  const rows = emptyRows();
  for (const d of t.days) rows[d] = { mode: 'ALL', weeks: [], anchor: '' };
  for (const r of t.rules ?? []) rows[r.day] = r.kind === 'WEEKS' ? { mode: 'WEEKS', weeks: [...r.weeks], anchor: '' } : { mode: 'ALTERNATE', weeks: [], anchor: r.anchor };
  return rows;
};

const toPayload = (rows: Record<number, DayRow>) => {
  const days: number[] = [];
  const rules: WeeklyOffRule[] = [];
  for (const w of WEEK) {
    const r = rows[w.day];
    if (r.mode === 'ALL') days.push(w.day);
    else if (r.mode === 'WEEKS') rules.push({ day: w.day, kind: 'WEEKS', weeks: r.weeks });
    else if (r.mode === 'ALTERNATE') rules.push({ day: w.day, kind: 'ALTERNATE', anchor: r.anchor });
  }
  return { days, rules };
};

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const weekLabel = (weeks: number[]) => [...weeks].sort((a, b) => (a === -1 ? 9 : b === -1 ? -9 : a - b)).map((w) => WEEKS.find((x) => x.value === w)?.label).join(', ');

/** What a weekday does under a saved template, for the list. */
function chipFor(t: WeeklyOffTemplate, day: number): { on: boolean; note: string } {
  if (t.days.includes(day)) return { on: true, note: '' };
  const r = (t.rules ?? []).find((x) => x.day === day);
  if (!r) return { on: false, note: '' };
  return { on: true, note: r.kind === 'WEEKS' ? weekLabel(r.weeks) : 'alternate' };
}

/** Weekly off templates: for each weekday choose working, off every week, off in some weeks of the month, or off every other week. */
export default function WeeklyOffPanel() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<WeeklyOffTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await getWeeklyOffTemplates()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load weekly off templates');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated]);

  const open = (t?: WeeklyOffTemplate) => {
    setError('');
    setNotice('');
    setForm(t ? { name: t.name, rows: rowsFrom(t), note: t.note ?? '', isActive: t.isActive } : blank());
    setEditing(t ? t.id : 'new');
  };
  const setRow = (day: number, patch: Partial<DayRow>) => setForm((f) => ({ ...f, rows: { ...f.rows, [day]: { ...f.rows[day], ...patch } } }));
  const preset = (days: number[], weeks?: { day: number; weeks: number[] }) => {
    const rows = emptyRows();
    for (const d of days) rows[d] = { mode: 'ALL', weeks: [], anchor: '' };
    if (weeks) rows[weeks.day] = { mode: 'WEEKS', weeks: weeks.weeks, anchor: '' };
    setForm((f) => ({ ...f, rows }));
  };

  const problem = (): string => {
    if (!form.name.trim()) return 'Give the template a name';
    const { days, rules } = toPayload(form.rows);
    if (days.length + rules.length === 0) return 'Choose at least one day off';
    if (days.length === 7) return 'At least one day of the week must be a working day';
    for (const w of WEEK) {
      const r = form.rows[w.day];
      if (r.mode === 'WEEKS' && r.weeks.length === 0) return `${w.long}: choose at least one week of the month`;
      if (r.mode === 'ALTERNATE') {
        if (!r.anchor) return `${w.long}: give the first day off`;
        if (weekdayOf(r.anchor) !== w.day) return `${w.long}: the first day off must fall on a ${w.long}`;
      }
    }
    return '';
  };

  const save = async () => {
    const p = problem();
    if (p) return setError(p);
    setSaving(true);
    setError('');
    try {
      const { days, rules } = toPayload(form.rows);
      const payload = { name: form.name.trim(), days, rules, note: form.note.trim() || null, isActive: form.isActive };
      if (editing === 'new') await createWeeklyOffTemplate(payload);
      else await updateWeeklyOffTemplate(editing as number, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: WeeklyOffTemplate) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    setError('');
    setNotice('');
    try {
      await deleteWeeklyOffTemplate(t.id);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-gray-500">A weekly off template says which weekdays are off. A day can be off every week, only in some weeks of the month (for example the 2nd and 4th Saturday), or every other week. Give a template to employees on their profile (Attendance &amp; Leave → Weekly off) or in bulk under Administration → Bulk update. A roster entry or roster pattern still wins for the days it covers. Weekly off days are not marked absent and count in the leave sandwich rule.</p>
        <button type="button" onClick={() => open()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">New template</button>
      </div>
      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Days off</th><th className="px-4 py-3">Employees now</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No templates yet. Create one, for example Saturday and Sunday.</td></tr>}
            {items.map((t) => (
              <tr key={t.id} className={t.isActive ? '' : 'opacity-60'}>
                <td className="px-4 py-3"><p className="font-medium text-gray-900">{t.name}</p>{t.note && <p className="text-xs text-gray-500">{t.note}</p>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {WEEK.map((w) => {
                      const c = chipFor(t, w.day);
                      return (
                        <span key={w.day} className={`rounded-md px-2 py-0.5 text-xs font-medium ${c.on ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-400'}`}>
                          {w.short}{c.note && <span className="ml-1 font-normal">({c.note})</span>}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{t.employeeCount}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{t.isActive ? 'Active' : 'Switched off'}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => open(t)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Edit</button>
                  <button type="button" onClick={() => remove(t)} className="ml-3 text-sm text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <Drawer
          wide
          title={editing === 'new' ? 'New weekly off template' : form.name || 'Weekly off template'}
          onClose={() => setEditing(null)}
          footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <label className="block text-xs font-medium text-gray-600">Name
            <input className={fieldClass} maxLength={80} placeholder="Sunday and 2nd, 4th Saturday" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-600">For each weekday</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <button type="button" onClick={() => preset([6, 0])} className="font-medium text-blue-600 hover:text-blue-800">Sat + Sun</button>
                <button type="button" onClick={() => preset([5, 6])} className="font-medium text-blue-600 hover:text-blue-800">Fri + Sat</button>
                <button type="button" onClick={() => preset([0])} className="font-medium text-blue-600 hover:text-blue-800">Sunday only</button>
                <button type="button" onClick={() => preset([0], { day: 6, weeks: [2, 4] })} className="font-medium text-blue-600 hover:text-blue-800">Sun + 2nd &amp; 4th Sat</button>
                <button type="button" onClick={() => preset([0], { day: 6, weeks: [1, 3] })} className="font-medium text-blue-600 hover:text-blue-800">Sun + 1st &amp; 3rd Sat</button>
                <button type="button" onClick={() => preset([])} className="font-medium text-gray-500 hover:text-gray-800">Clear</button>
              </div>
            </div>
            <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {WEEK.map((w) => {
                const r = form.rows[w.day];
                return (
                  <div key={w.day} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${r.mode !== 'WORK' ? 'bg-orange-50/50' : ''}`}>
                    <span className="w-24 text-sm font-medium text-gray-800">{w.long}</span>
                    <Select aria-label={`${w.long} rule`} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm" value={r.mode} onChange={(e) => setRow(w.day, { mode: e.target.value as Mode })}>
                      <option value="WORK">Working day</option>
                      <option value="ALL">Off every week</option>
                      <option value="WEEKS">Off in some weeks of the month</option>
                      <option value="ALTERNATE">Off every other week</option>
                    </Select>
                    {r.mode === 'WEEKS' && (
                      <div className="flex flex-wrap gap-1.5">
                        {WEEKS.map((k) => (
                          <label key={k.value} className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium ${r.weeks.includes(k.value) ? 'border-orange-400 bg-orange-100 text-orange-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
                            <input type="checkbox" className="sr-only" checked={r.weeks.includes(k.value)} onChange={() => setRow(w.day, { weeks: r.weeks.includes(k.value) ? r.weeks.filter((x) => x !== k.value) : [...r.weeks, k.value] })} />
                            {k.label}
                          </label>
                        ))}
                      </div>
                    )}
                    {r.mode === 'ALTERNATE' && (
                      <label className="flex items-center gap-2 text-xs text-gray-600">First day off
                        <input type="date" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" value={r.anchor} onChange={(e) => setRow(w.day, { anchor: e.target.value })} />
                        <span className="text-gray-400">then every 2 weeks</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">For "some weeks of the month", the 5th and Last are for months that have five of that weekday. "Last" is the final one of the month, whether it is the 4th or the 5th.</p>
          </div>

          <label className="block text-xs font-medium text-gray-600">Note (optional)
            <input className={fieldClass} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (switching off hides it from the pickers, employees keep it)</label>
        </Drawer>
      )}
    </div>
  );
}
