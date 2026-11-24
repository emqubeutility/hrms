import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { Employee, getEmployees } from '../../lib/api';
import { UserType } from '../../lib/user-types';
import {
  AttendanceConfig,
  Policy,
  PolicyPayload,
  addRamadan,
  assignPolicy,
  createPolicy,
  ProcessingRun,
  getAttendanceConfig,
  getProcessingRuns,
  runProcessing,
  removeRamadan,
  saveAttendanceSettings,
  saveAttendanceStatus,
  unassignPolicy,
  deletePolicy,
  updatePolicy,
} from '../../lib/attendance-marking-api';
import Drawer, { fieldClass } from '../Drawer';
import Select from '../Select';

type Tab = 'policies' | 'periods' | 'settings' | 'statuses' | 'processing';
const TABS: { key: Tab; label: string }[] = [
  { key: 'policies', label: 'Policies' },
  { key: 'periods', label: 'Special periods' },
  { key: 'settings', label: 'Marking settings' },
  { key: 'statuses', label: 'Statuses' },
  { key: 'processing', label: 'Daily processing' },
];

const blankPolicy: PolicyPayload = {
  code: '',
  name: '',
  isActive: true,
  lateEnabled: true,
  halfDayEnabled: true,
  allowPastDateSelfMarking: false,
  applyLateRulesToPastDates: false,
  selfMarkCutoffTime: null,
  cutoffExemptHr: true,
  managerEditsOnlyUnapproved: true,
  requiresApproval: true,
  useRamadanShiftStart: false,
  shortHoursEnabled: true,
  shortHoursGraceMinutes: 0,
  overtimeEnabled: false,
  overtimeAfterMinutes: 0,
};

const RULES: { key: keyof PolicyPayload; label: string; hint: string }[] = [
  { key: 'lateEnabled', label: 'Late rule', hint: 'Mark Late when the first IN is after the grace minutes on the shift.' },
  { key: 'halfDayEnabled', label: 'Half-day rule', hint: 'Mark Half day when the first IN is later than the half-day minutes on the shift.' },
  { key: 'requiresApproval', label: 'Days need approval', hint: 'A self-marked day stays pending until a manager or HR approves it.' },
  { key: 'managerEditsOnlyUnapproved', label: 'Managers edit only unapproved days', hint: 'Once approved, only HR can change a day.' },
  { key: 'allowPastDateSelfMarking', label: 'Employees can mark a past day', hint: 'Off means a forgotten day must be added by a manager or HR.' },
  { key: 'applyLateRulesToPastDates', label: 'Apply late rules to past days', hint: 'Normally off: a past day is stamped at the time it was entered.' },
  { key: 'cutoffExemptHr', label: 'HR exempt from the time limit', hint: 'HR can still mark or correct after the limit.' },
  { key: 'shortHoursEnabled', label: 'Short hours rule', hint: 'Mark Short hours when the worked time (after the break) is below the required time.' },
  { key: 'overtimeEnabled', label: 'Count overtime', hint: 'Time worked beyond the required time, after the threshold below, is overtime.' },
  { key: 'useRamadanShiftStart', label: 'Use the alternate shift start in special periods', hint: 'Uses the shift\'s alternate start time during the periods set on the Ramadan tab.' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

/** System Settings > Attendance configuration: values for each country, never logic. */
export default function AttendanceConfigPanel() {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.userTypeId === UserType.SystemAdmin;
  const [tab, setTab] = useState<Tab>('policies');
  const [cfg, setCfg] = useState<AttendanceConfig | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setCfg((await getAttendanceConfig()).data);
    } catch (e: any) {
      setError(e.message || 'Could not load the configuration');
    }
  }, []);
  useEffect(() => {
    if (isAuthenticated && isAdmin) load();
  }, [isAuthenticated, isAdmin, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    }
  };

  /* ---- policies ---- */
  const [editing, setEditing] = useState<{ id: number | null; form: PolicyPayload } | null>(null);
  const [assigning, setAssigning] = useState<Policy | null>(null);
  const [asg, setAsg] = useState({ scope: 'COUNTRY', countryCode: '', branchId: '', employeeId: '', effectiveFrom: todayIso(), effectiveTo: '' });
  const [empSearch, setEmpSearch] = useState('');
  const [emps, setEmps] = useState<Employee[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!assigning || asg.scope !== 'EMPLOYEE') return;
    const t = setTimeout(() => getEmployees({ pageSize: 25, isActive: true, ...(empSearch.trim() ? { search: empSearch.trim() } : {}) }).then((r) => setEmps(r.data)).catch(() => setEmps([])), 300);
    return () => clearTimeout(t);
  }, [assigning, asg.scope, empSearch]);

  const startPolicy = (p?: Policy) => {
    setError('');
    setEditing(p ? { id: p.id, form: { ...p, code: p.code } as PolicyPayload } : { id: null, form: { ...blankPolicy } });
  };
  const savePolicy = async () => {
    if (!editing) return;
    const f = editing.form;
    if (!f.name.trim()) return setError('Name is required');
    if (editing.id === null && !f.code?.trim()) return setError('A code is required');
    setSaving(true);
    try {
      // Send only the fields the server accepts (a saved policy also carries id, version, dates and assignments).
      const KEYS = ['code', 'name', 'isActive', 'lateEnabled', 'halfDayEnabled', 'allowPastDateSelfMarking', 'applyLateRulesToPastDates', 'cutoffExemptHr', 'managerEditsOnlyUnapproved', 'requiresApproval', 'useRamadanShiftStart', 'shortHoursEnabled', 'shortHoursGraceMinutes', 'overtimeEnabled', 'overtimeAfterMinutes'] as const;
      const payload = { ...Object.fromEntries(KEYS.filter((k) => (f as any)[k] !== undefined).map((k) => [k, (f as any)[k]])), selfMarkCutoffTime: f.selfMarkCutoffTime || null } as PolicyPayload;
      if (editing.id === null) await createPolicy(payload);
      else await updatePolicy(editing.id, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  const addAssignment = async () => {
    if (!assigning) return;
    setSaving(true);
    setError('');
    try {
      await assignPolicy(assigning.id, {
        scope: asg.scope,
        countryCode: asg.scope === 'COUNTRY' ? asg.countryCode : undefined,
        branchId: asg.scope === 'BRANCH' && asg.branchId ? Number(asg.branchId) : undefined,
        employeeId: asg.scope === 'EMPLOYEE' && asg.employeeId ? Number(asg.employeeId) : undefined,
        effectiveFrom: asg.effectiveFrom,
        effectiveTo: asg.effectiveTo || undefined,
      });
      setAssigning(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not assign');
    } finally {
      setSaving(false);
    }
  };

  /* ---- periods ---- */
  const [period, setPeriod] = useState({ countryCode: '', startDate: '', endDate: '' });

  /* ---- processing ---- */
  const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [proc, setProc] = useState({ from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), to: yesterday() });
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const [procBusy, setProcBusy] = useState(false);
  useEffect(() => {
    if (tab === 'processing') getProcessingRuns().then((r) => setRuns(r.data)).catch(() => {});
  }, [tab, notice]);

  /* ---- statuses ---- */
  const [draft, setDraft] = useState<Record<string, { name: string; color: string }>>({});

  const countryName = (c: string | null) => cfg?.countries.find((x) => x.isoCode === c)?.name ?? c ?? '';
  const scopeText = (a: Policy['assignments'][number]) =>
    a.scope === 'COUNTRY' ? `Country · ${countryName(a.countryCode)}` : a.scope === 'BRANCH' ? `Branch · ${a.branchName}` : `Employee · ${a.employeeName}`;

  const sortedPolicies = useMemo(() => cfg?.policies ?? [], [cfg]);

  if (isAuthenticated && !isAdmin) return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Only System Admin can change the attendance configuration.</div>;

  const check = 'rounded border-gray-300 text-blue-600 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Attendance configuration</h2>
        <p className="mt-1 text-gray-500">Rules and values for each country. Late and half-day minutes stay on the Shift under Administration &gt; Attendance setup.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => { setTab(t.key); setError(''); setNotice(''); }} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t.label}</button>
        ))}
      </div>

      {error && !editing && !assigning && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}
      {!cfg && !error && <p className="text-sm text-gray-400">Loading…</p>}

      {cfg && tab === 'policies' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-gray-600">A policy is a set of rules. Assign it to a country, a branch or one employee. The most specific assignment wins: employee, then branch, then country. To support a new country, create its policy and assign it here.</p>
            <button type="button" onClick={() => startPolicy()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">+ New policy</button>
          </div>
          {sortedPolicies.map((p) => (
            <section key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className={`text-base font-semibold ${p.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{p.name} <span className="ml-1 font-mono text-xs font-normal text-gray-400">{p.code} · v{p.version}</span></h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {[p.lateEnabled && 'Late', p.halfDayEnabled && 'Half day', p.shortHoursEnabled && 'Short hours', p.overtimeEnabled && 'Overtime', p.requiresApproval && 'Approval', p.selfMarkCutoffTime && `Limit ${p.selfMarkCutoffTime}`, p.allowPastDateSelfMarking && 'Past days', p.useRamadanShiftStart && 'Ramadan start'].filter(Boolean).join(' · ') || 'No rules switched on'}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button type="button" onClick={() => startPolicy(p)} className="font-medium text-blue-600 hover:text-blue-800">Edit rules</button>
                  <button type="button" onClick={() => { setAssigning(p); setError(''); setAsg({ scope: 'COUNTRY', countryCode: cfg.countries[0]?.isoCode ?? '', branchId: '', employeeId: '', effectiveFrom: todayIso(), effectiveTo: '' }); }} className="font-medium text-blue-600 hover:text-blue-800">Assign</button>
                  <button type="button" onClick={() => window.confirm(`Delete the policy "${p.name}" and its assignments?`) && run(() => deletePolicy(p.id), 'Policy deleted')} className="font-medium text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
              {p.assignments.length === 0 ? (
                <p className="mt-3 text-sm text-amber-700">Not assigned to anyone yet.</p>
              ) : (
                <table className="mt-3 min-w-full text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-1">Applies to</th><th className="py-1">From</th><th className="py-1">To</th><th /></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {p.assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-1.5 text-gray-900">{scopeText(a)}</td>
                        <td className="py-1.5 font-mono text-[13px] text-gray-700">{a.effectiveFrom}</td>
                        <td className="py-1.5 font-mono text-[13px] text-gray-700">{a.effectiveTo ?? 'open'}</td>
                        <td className="py-1.5 text-right"><button type="button" onClick={() => window.confirm('Remove this assignment?') && run(() => unassignPolicy(a.id), 'Assignment removed')} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}

      {cfg && tab === 'periods' && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600">During a period, a policy that uses the alternate shift start measures lateness against the shift's alternate start time (for example shorter Ramadan hours).</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-gray-600">Country
              <Select value={period.countryCode} onChange={(e) => setPeriod({ ...period, countryCode: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
                <option value="">Select…</option>{cfg.countries.map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
              </Select>
            </label>
            <label className="text-xs font-medium text-gray-600">From<input type="date" value={period.startDate} onChange={(e) => setPeriod({ ...period, startDate: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
            <label className="text-xs font-medium text-gray-600">To<input type="date" value={period.endDate} onChange={(e) => setPeriod({ ...period, endDate: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
            <button type="button" disabled={!period.countryCode || !period.startDate || !period.endDate} onClick={() => run(async () => { await addRamadan(period); setPeriod({ countryCode: '', startDate: '', endDate: '' }); }, 'Period added')} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">Add period</button>
          </div>
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-1">Country</th><th className="py-1">From</th><th className="py-1">To</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {cfg.ramadan.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-500">No periods yet.</td></tr>}
              {cfg.ramadan.map((r) => (
                <tr key={r.id}><td className="py-1.5 text-gray-900">{countryName(r.countryCode)}</td><td className="py-1.5 font-mono text-[13px]">{r.startDate}</td><td className="py-1.5 font-mono text-[13px]">{r.endDate}</td>
                  <td className="py-1.5 text-right"><button type="button" onClick={() => run(() => removeRamadan(r.id), 'Period removed')} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {cfg && tab === 'settings' && (
        <section className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input type="checkbox" className={`${check} mt-0.5`} checked={cfg.settings.moodEnabled} onChange={(e) => setCfg({ ...cfg, settings: { ...cfg.settings, moodEnabled: e.target.checked } })} />
            <span><span className="font-medium">Ask for a mood on the first IN of the day</span><span className="block text-gray-500">Options are the "Mood" parameters in Masters.</span></span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            GPS location
            <Select className={fieldClass} value={cfg.settings.gpsRequirement} onChange={(e) => setCfg({ ...cfg, settings: { ...cfg.settings, gpsRequirement: e.target.value as 'OFF' | 'OPTIONAL' | 'REQUIRED' } })}>
              <option value="OFF">Not collected</option><option value="OPTIONAL">Optional</option><option value="REQUIRED">Required to mark attendance</option>
            </Select>
          </label>
          <p className="text-xs text-gray-500">The server always records the IP address itself.</p>
          <button type="button" onClick={() => run(() => saveAttendanceSettings(cfg.settings), 'Settings saved')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">Save settings</button>
        </section>
      )}

      {cfg && tab === 'statuses' && (
        <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Colour</th><th className="px-4 py-3">Behaviour</th><th className="px-4 py-3">Active</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {cfg.statuses.map((s) => {
                const d = draft[s.code] ?? { name: s.name, color: s.color };
                const dirty = d.name !== s.name || d.color !== s.color;
                return (
                  <tr key={s.code}>
                    <td className="px-4 py-2 font-mono text-[12px] text-gray-500">{s.code}</td>
                    <td className="px-4 py-2"><input value={d.name} onChange={(e) => setDraft({ ...draft, [s.code]: { ...d, name: e.target.value } })} className="w-44 rounded-lg border border-gray-300 px-2 py-1 text-sm" /></td>
                    <td className="px-4 py-2"><input type="color" value={d.color} onChange={(e) => setDraft({ ...draft, [s.code]: { ...d, color: e.target.value } })} className="h-8 w-12 cursor-pointer rounded border border-gray-300" /></td>
                    <td className="px-4 py-2 text-xs text-gray-500">{[s.skipsLateRule && 'skips the late rule', s.clearsPunches && 'no punches'].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-2"><input type="checkbox" className={check} checked={s.isActive} onChange={(e) => run(() => saveAttendanceStatus(s.code, { isActive: e.target.checked }), 'Status updated')} /></td>
                    <td className="px-4 py-2 text-right">{dirty && <button type="button" onClick={() => run(async () => { await saveAttendanceStatus(s.code, d); setDraft((p) => { const n = { ...p }; delete n[s.code]; return n; }); }, 'Status saved')} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {cfg && tab === 'processing' && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="max-w-2xl text-sm text-gray-600">
            Every night the system builds the last finished days: holidays, weekly offs, approved leave and absences for days nobody marked, and the worked time, short hours and overtime for days with punches. Days someone has approved are never overwritten. Run it by hand to catch up or after changing a roster.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-gray-600">From<input type="date" value={proc.from} onChange={(e) => setProc({ ...proc, from: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
            <label className="text-xs font-medium text-gray-600">To (up to yesterday)<input type="date" max={yesterday()} value={proc.to} onChange={(e) => setProc({ ...proc, to: e.target.value })} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /></label>
            <button type="button" disabled={procBusy} onClick={async () => { setProcBusy(true); setError(''); setNotice(''); try { const r = (await runProcessing(proc.from, proc.to)).data; setNotice(`Processed: ${r.createdDays} days created, ${r.updatedDays} updated, ${r.skippedDays} unchanged${r.errors?.length ? `, ${r.errors.length} could not be processed` : ''}.`); } catch (e: any) { setError(e.message || 'Processing failed'); } finally { setProcBusy(false); } }} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{procBusy ? 'Running…' : 'Run now'}</button>
          </div>
          <p className="text-xs text-gray-500">At most 31 days at a time.</p>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-1">Run</th><th className="py-1">Dates</th><th className="py-1">Created</th><th className="py-1">Updated</th><th className="py-1">Unchanged</th><th className="py-1">By</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-500">No runs yet.</td></tr>}
              {runs.map((r) => (
                <tr key={r.id}><td className="py-1.5 text-gray-700">{new Date(r.startedAt).toLocaleString()}</td><td className="py-1.5 font-mono text-[13px]">{r.fromDate.slice(0, 10)} to {r.toDate.slice(0, 10)}</td><td className="py-1.5">{r.createdDays}</td><td className="py-1.5">{r.updatedDays}</td><td className="py-1.5">{r.skippedDays}</td><td className="py-1.5 text-gray-500">{r.trigger === 'CRON' ? 'Nightly' : 'Manual'}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editing && (
        <Drawer
          title={editing.id === null ? 'New attendance policy' : `Edit ${editing.form.name}`}
          wide
          onClose={() => setEditing(null)}
          footer={<>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={savePolicy} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <div className="grid grid-cols-3 gap-4">
            <label className="col-span-1 block text-sm font-medium text-gray-700">Code
              <input className={`${fieldClass} font-mono uppercase`} disabled={editing.id !== null} maxLength={30} value={editing.form.code ?? ''} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, code: e.target.value } })} />
            </label>
            <label className="col-span-2 block text-sm font-medium text-gray-700">Name
              <input className={fieldClass} maxLength={100} value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">Time limit for the first IN (local time)
            <input type="time" className={fieldClass} value={editing.form.selfMarkCutoffTime ?? ''} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, selfMarkCutoffTime: e.target.value || null } })} />
            <span className="mt-1 block text-xs text-gray-500">Employees cannot press IN after this time. Leave empty for no limit. Ending the day (OUT) is always allowed.</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">Short hours grace (minutes)
              <input type="number" min="0" className={fieldClass} value={editing.form.shortHoursGraceMinutes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, shortHoursGraceMinutes: Number(e.target.value) } })} />
            </label>
            <label className="block text-sm font-medium text-gray-700">Overtime starts after (minutes)
              <input type="number" min="0" className={fieldClass} value={editing.form.overtimeAfterMinutes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, overtimeAfterMinutes: Number(e.target.value) } })} />
            </label>
          </div>
          <div className="space-y-3">
            {RULES.map((r) => (
              <label key={r.key} className="flex items-start gap-3 text-sm text-gray-700">
                <input type="checkbox" className={`${check} mt-0.5`} checked={!!editing.form[r.key]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [r.key]: e.target.checked } })} />
                <span><span className="font-medium">{r.label}</span><span className="block text-xs text-gray-500">{r.hint}</span></span>
              </label>
            ))}
            <label className="flex items-center gap-3 text-sm text-gray-700">
              <input type="checkbox" className={check} checked={editing.form.isActive} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, isActive: e.target.checked } })} />
              <span className="font-medium">Active</span>
            </label>
          </div>
        </Drawer>
      )}

      {assigning && cfg && (
        <Drawer
          title={`Assign ${assigning.name}`}
          onClose={() => setAssigning(null)}
          footer={<>
            <button type="button" onClick={() => setAssigning(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={addAssignment} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Assign'}</button>
          </>}
        >
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-gray-700">Applies to
            <Select className={fieldClass} value={asg.scope} onChange={(e) => setAsg({ ...asg, scope: e.target.value })}>
              <option value="COUNTRY">A country</option><option value="BRANCH">A branch</option><option value="EMPLOYEE">One employee</option>
            </Select>
          </label>
          {asg.scope === 'COUNTRY' && (
            <label className="block text-sm font-medium text-gray-700">Country
              <Select className={fieldClass} value={asg.countryCode} onChange={(e) => setAsg({ ...asg, countryCode: e.target.value })}>{cfg.countries.map((c) => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}</Select>
            </label>
          )}
          {asg.scope === 'BRANCH' && (
            <label className="block text-sm font-medium text-gray-700">Branch
              <Select className={fieldClass} value={asg.branchId} onChange={(e) => setAsg({ ...asg, branchId: e.target.value })}><option value="">Select…</option>{cfg.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            </label>
          )}
          {asg.scope === 'EMPLOYEE' && (
            <>
              <label className="block text-sm font-medium text-gray-700">Find employee<input type="search" className={fieldClass} value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Name or code…" /></label>
              <label className="block text-sm font-medium text-gray-700">Employee
                <Select className={fieldClass} value={asg.employeeId} onChange={(e) => setAsg({ ...asg, employeeId: e.target.value })}><option value="">Select…</option>{emps.map((e) => <option key={e.id} value={e.id}>{[e.profile?.name, e.profile?.lastName].filter(Boolean).join(' ')} ({e.employeeCode})</option>)}</Select>
              </label>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">From<input type="date" className={fieldClass} value={asg.effectiveFrom} onChange={(e) => setAsg({ ...asg, effectiveFrom: e.target.value })} /></label>
            <label className="block text-sm font-medium text-gray-700">To (optional)<input type="date" className={fieldClass} value={asg.effectiveTo} onChange={(e) => setAsg({ ...asg, effectiveTo: e.target.value })} /></label>
          </div>
          <p className="text-xs text-gray-500">Two assignments at the same level cannot cover the same dates. End the old one first.</p>
        </Drawer>
      )}
    </div>
  );
}
