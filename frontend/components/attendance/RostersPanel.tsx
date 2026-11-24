import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { ShiftItem, getShifts } from '../../lib/api';
import { RosterPattern, createRosterPattern, getRosterPatterns, importRoster, updateRosterPattern } from '../../lib/attendance-api';
import Drawer, { fieldClass } from '../Drawer';
import ExcelImport from '../ExcelImport';
import Select from '../Select';

const OFF = 'OFF';

/** Roster patterns (a repeating cycle of shifts and weekly offs) and Excel import of single days. */
export default function RostersPanel() {
  const { isAuthenticated } = useAuth();
  const [patterns, setPatterns] = useState<RosterPattern[]>([]);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [cycleDays, setCycleDays] = useState(7);
  const [days, setDays] = useState<string[]>([]); // shift id as text, or OFF
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setPatterns((await getRosterPatterns()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load roster patterns');
    }
  };
  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    getShifts().then((r) => setShifts(r.data.filter((s) => s.isActive))).catch(() => {});
  }, [isAuthenticated]);

  const shiftName = (id: number | null) => shifts.find((s) => s.id === id)?.name ?? '?';
  const defaultDays = (n: number) => Array.from({ length: n }, (_, i) => (i % 7 >= 5 ? OFF : String(shifts[0]?.id ?? OFF)));

  const startNew = () => {
    setName('');
    setCycleDays(7);
    setDays(defaultDays(7));
    setIsActive(true);
    setEditing('new');
    setError('');
  };
  const startEdit = (p: RosterPattern) => {
    setName(p.name);
    setCycleDays(p.cycleDays);
    setDays(Array.from({ length: p.cycleDays }, (_, i) => { const d = p.days.find((x) => x.dayIndex === i); return !d || d.isWeeklyOff ? OFF : String(d.shiftId); }));
    setIsActive(p.isActive);
    setEditing(p.id);
    setError('');
  };
  const changeCycle = (n: number) => {
    setCycleDays(n);
    setDays((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? (i % 7 >= 5 ? OFF : String(shifts[0]?.id ?? OFF))));
  };

  const save = async () => {
    if (!name.trim()) return setError('Name is required');
    setSaving(true);
    setError('');
    try {
      const payload = { name: name.trim(), cycleDays, isActive, days: days.map((d, i) => (d === OFF ? { dayIndex: i, isWeeklyOff: true } : { dayIndex: i, shiftId: Number(d), isWeeklyOff: false })) };
      if (editing === 'new') await createRosterPattern(payload);
      else await updateRosterPattern(editing as number, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const summary = (p: RosterPattern) =>
    p.days.map((d) => (d.isWeeklyOff ? 'Off' : shiftName(d.shiftId).slice(0, 3))).join(' · ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Roster</h2>
          <p className="mt-1 text-gray-500">Define a pattern once and it repeats, or upload single days from Excel. Assign patterns to employees under Assignments.</p>
        </div>
        <button type="button" onClick={startNew} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ Add roster pattern</button>
      </div>

      {error && !editing && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr><th className="px-4 py-3">Pattern</th><th className="px-4 py-3">Cycle</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Employees</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {patterns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No roster patterns yet.</td></tr>
            ) : (
              patterns.map((p) => (
                <tr key={p.id} className={!p.isActive ? 'bg-gray-50/60' : undefined}>
                  <td className={`px-4 py-3 font-medium ${p.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{p.name}</td>
                  <td className="px-4 py-3 text-gray-700">{p.cycleDays} days</td>
                  <td className="max-w-md truncate px-4 py-3 text-xs text-gray-600" title={summary(p)}>{summary(p)}</td>
                  <td className="px-4 py-3 text-gray-700">{p.employeeCount}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${p.isActive ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-500'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => startEdit(p)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Edit</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ExcelImport
        title="Import roster days from Excel"
        help="One row per employee and day. Columns: Employee Code, Date (YYYY-MM-DD), Shift (a shift name, or OFF for a weekly off). A single-day row replaces that day of the employee's pattern."
        templatePath="/attendance/roster/template"
        templateName="roster-template.xlsx"
        run={importRoster}
      />

      {editing !== null && (
        <Drawer
          title={editing === 'new' ? 'New roster pattern' : 'Edit roster pattern'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-gray-700">Name
            <input className={fieldClass} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Repeats every
            <Select className={fieldClass} value={cycleDays} onChange={(e) => changeCycle(Number(e.target.value))}>
              {[7, 14, 21, 28].map((n) => <option key={n} value={n}>{n} days ({n / 7} week{n > 7 ? 's' : ''})</option>)}
            </Select>
          </label>
          <div>
            <p className="text-sm font-medium text-gray-700">Each day of the cycle</p>
            <p className="mt-1 text-xs text-gray-500">Day 1 is the date you choose when assigning the pattern to an employee.</p>
            <div className="mt-2 space-y-2">
              {days.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-gray-600">Day {i + 1}</span>
                  <Select aria-label={`Day ${i + 1}`} className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm" value={d} onChange={(e) => setDays((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}>
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value={OFF}>Weekly off</option>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Active
          </label>
        </Drawer>
      )}
    </div>
  );
}
