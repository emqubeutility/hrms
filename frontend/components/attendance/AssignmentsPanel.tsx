import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { BranchOption, CountryItem, MasterItem, ShiftItem, getBranches, getCountries, getShifts, getSites } from '../../lib/api';
import { searchEmployeeOptions } from '../../lib/bulk-api';
import {
  AssignmentRow,
  Assignments,
  GroupAssignment,
  HolidayCalendar,
  ResolvedDay,
  RosterPattern,
  WeeklyOffTemplate,
  WorkSchedule,
  assignHolidayCalendar,
  assignToGroup,
  assignRosterPattern,
  assignWeeklyOffTemplate,
  assignWorkSchedule,
  clearRosterEntry,
  getAssignments,
  getEmployeeCalendar,
  getGroupAssignments,
  getHolidayCalendars,
  getRosterPatterns,
  getWeeklyOffTemplates,
  getWorkSchedules,
  removeAssignment,
  removeGroupAssignment,
  setRosterEntry,
} from '../../lib/attendance-api';
import Select from '../Select';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`;
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
const LEVEL = { EMPLOYEE: 'Employee', SITE: 'Site', BRANCH: 'Branch', COUNTRY: 'Country', COMPANY: 'Company' } as const;

type Kind = 'work-schedule' | 'roster-pattern' | 'holiday-calendar' | 'weekly-off';

function AssignmentCard({
  title,
  hint,
  rows,
  options,
  withAnchor,
  bulk,
  onAssign,
  onRemove,
}: {
  title: string;
  hint: string;
  rows: AssignmentRow[];
  options: { id: number; name: string }[];
  withAnchor?: boolean;
  /** Several employees chosen: only assigning makes sense (no current value or history to show). */
  bulk?: boolean;
  onAssign: (id: number, from: string, anchor?: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [pick, setPick] = useState('');
  const [from, setFrom] = useState(today());
  const [anchor, setAnchor] = useState('');
  const [busy, setBusy] = useState(false);
  const current = rows.find((r) => r.effectiveTo === null) ?? null;

  const assign = async () => {
    if (!pick || !from) return;
    setBusy(true);
    try {
      await onAssign(Number(pick), from, withAnchor && anchor ? anchor : undefined);
      setPick('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      {!bulk && (
        <p className="mt-3 text-sm">
          Current: <span className="font-medium text-gray-900">{current ? `${current.ref.name} (from ${current.effectiveFrom})` : 'none'}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">Assign
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm">
            <option value="">Select…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-gray-600">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        </label>
        {withAnchor && (
          <label className="text-xs font-medium text-gray-600" title="The date where day 1 of the pattern falls">Day 1 falls on
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} placeholder={from} className="mt-1 block rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          </label>
        )}
        <button type="button" onClick={assign} disabled={!pick || busy} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">Assign</button>
      </div>
      <p className="mt-2 text-xs text-gray-500">A new assignment ends the previous one the day before it starts.</p>

      {!bulk && rows.length > 0 && (
        <table className="mt-3 min-w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-1">Name</th><th className="py-1">From</th><th className="py-1">To</th><th /></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 text-gray-900">{r.ref.name}</td>
                <td className="py-1.5 font-mono text-[13px] text-gray-700">{r.effectiveFrom}</td>
                <td className="py-1.5 font-mono text-[13px] text-gray-700">{r.effectiveTo ?? 'open'}</td>
                <td className="py-1.5 text-right"><button type="button" onClick={() => window.confirm('Remove this assignment?') && onRemove(r.id)} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Per employee: work schedule, weekly off, roster pattern and holiday calendar (all effective-dated), plus a month preview. */
export default function AssignmentsPanel() {
  const { isAuthenticated } = useAuth();
  const [names, setNames] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<number[]>([]);
  // Who the assignment is for: people, or a whole branch, country or the company.
  const [level, setLevel] = useState<'EMPLOYEE' | 'SITE' | 'BRANCH' | 'COUNTRY' | 'COMPANY'>('EMPLOYEE');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [branchId, setBranchId] = useState('');
  const [sites, setSites] = useState<MasterItem[]>([]);
  const [siteId, setSiteId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [groupRows, setGroupRows] = useState<GroupAssignment[]>([]);
  // One employee: their own schedule history and month preview. Several: assign the same thing to all of them.
  const employeeId = picked.length === 1 ? picked[0] : null;
  const [assignments, setAssignments] = useState<Assignments | null>(null);
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [patterns, setPatterns] = useState<RosterPattern[]>([]);
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [weeklyOffs, setWeeklyOffs] = useState<WeeklyOffTemplate[]>([]);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [days, setDays] = useState<ResolvedDay[]>([]);
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    getWorkSchedules().then((r) => setSchedules(r.data.filter((s) => s.isActive))).catch(() => {});
    getRosterPatterns().then((r) => setPatterns(r.data.filter((p) => p.isActive))).catch(() => {});
    getHolidayCalendars().then((r) => setCalendars(r.data.filter((c) => c.isActive))).catch(() => {});
    getWeeklyOffTemplates().then((r) => setWeeklyOffs(r.data.filter((t) => t.isActive))).catch(() => {});
    getShifts().then((r) => setShifts(r.data.filter((s) => s.isActive))).catch(() => {});
    getBranches().then((r) => setBranches(r.data)).catch(() => {});
    getSites().then((r) => setSites(r.data)).catch(() => setSites([]));
    getCountries().then((r) => setCountries(r.data.filter((c) => c.isActive))).catch(() => {});
  }, [isAuthenticated]);

  const loadGroups = useCallback(async () => {
    try {
      setGroupRows((await getGroupAssignments()).data);
    } catch {
      setGroupRows([]);
    }
  }, []);
  useEffect(() => {
    if (isAuthenticated) loadGroups();
  }, [isAuthenticated, loadGroups]);

  const reload = useCallback(async () => {
    if (employeeId === null) return;
    setError('');
    try {
      const [a, c] = await Promise.all([getAssignments(employeeId), getEmployeeCalendar(employeeId, monthStart(month.y, month.m), monthEnd(month.y, month.m))]);
      setAssignments(a.data);
      setDays(c.data.days);
      setCountry(c.data.country);
    } catch (e: any) {
      setError(e.message || 'Could not load this employee');
    }
  }, [employeeId, month]);

  useEffect(() => {
    setAssignments(null);
    setDays([]);
    reload();
  }, [reload]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      await reload();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    }
  };

  /** The same change for every chosen employee, one after the other; says who it could not be done for. */
  const runMany = async (fn: (id: number) => Promise<unknown>, ok: string) => {
    setError('');
    setNotice('');
    const failed: string[] = [];
    let done = 0;
    for (const id of picked) {
      try {
        await fn(id);
        done++;
      } catch (e: any) {
        failed.push(`${names[id] ?? id}: ${e.message || 'failed'}`);
      }
    }
    if (failed.length) setError(`Not done for ${failed.length}: ${failed.slice(0, 5).join('; ')}${failed.length > 5 ? '…' : ''}`);
  };

  /** The group chosen above, ready to send; null until a branch or country is picked. */
  const target = useMemo(() => {
    if (level === 'COMPANY') return { scope: 'COMPANY' as const };
    if (level === 'BRANCH' && branchId) return { scope: 'BRANCH' as const, branchId: Number(branchId) };
    if (level === 'SITE' && siteId) return { scope: 'SITE' as const, siteId: Number(siteId) };
    if (level === 'COUNTRY' && countryCode) return { scope: 'COUNTRY' as const, countryCode };
    return null;
  }, [level, branchId, siteId, countryCode]);
  const targetName = level === 'COMPANY' ? 'the whole company' : level === 'BRANCH' ? branches.find((b) => String(b.id) === branchId)?.name ?? '' : level === 'SITE' ? sites.find((x) => String(x.id) === siteId)?.name ?? '' : countries.find((c) => c.isoCode === countryCode)?.name ?? '';
  const rowsFor = (kind: GroupAssignment['kind']): AssignmentRow[] =>
    !target
      ? []
      : groupRows
          .filter((g) => g.kind === kind && g.scope === target.scope && (g.scope !== 'BRANCH' || g.branchId === target.branchId) && (g.scope !== 'SITE' || g.siteId === target.siteId) && (g.scope !== 'COUNTRY' || g.countryCode === target.countryCode))
          .map((g) => ({ id: g.id, ref: g.ref, effectiveFrom: g.effectiveFrom, effectiveTo: g.effectiveTo, anchorDate: g.anchorDate }));
  const runGroup = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      await loadGroups();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    }
  };
  const giveToGroup = (kind: GroupAssignment['kind'], refId: number, from: string, anchor?: string) =>
    target ? runGroup(() => assignToGroup({ kind, ...target, refId, effectiveFrom: from, ...(anchor ? { anchorDate: anchor } : {}) }), `Assigned to ${targetName}`) : Promise.resolve();

  const selectedName = employeeId !== null ? (names[employeeId] ?? '').replace(/ \([^)]*\)$/, '') : '';
  const monthLabel = useMemo(() => new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }), [month]);
  const shiftMonth = (d: number) => setMonth((p) => { const n = new Date(Date.UTC(p.y, p.m + d, 1)); return { y: n.getUTCFullYear(), m: n.getUTCMonth() }; });

  const statusOf = (d: ResolvedDay) => {
    if (d.holiday) return { text: `Holiday: ${d.holiday.name}`, tone: 'bg-purple-50 text-purple-700 border-purple-200', note: `${LEVEL[d.holiday.calendarLevel]} calendar` };
    if (d.roster.source === 'NONE') return { text: 'No roster', tone: 'bg-gray-50 text-gray-500 border-gray-200', note: '' };
    if (d.roster.isWeeklyOff) return { text: 'Weekly off', tone: 'bg-gray-100 text-gray-600 border-gray-200', note: d.roster.source === 'ENTRY' ? 'single day' : d.roster.source === 'TEMPLATE' ? 'weekly off template' : '' };
    return { text: d.roster.shift?.name ?? 'Working', tone: 'bg-green-50 text-green-700 border-green-200', note: d.roster.source === 'ENTRY' ? 'single day' : '' };
  };

  const override = (date: string, value: string) => {
    if (!employeeId || !value) return;
    if (value === 'PATTERN') return run(() => clearRosterEntry(employeeId, date), 'Back to the pattern');
    return run(() => setRosterEntry(value === 'OFF' ? { employeeId, date, isWeeklyOff: true } : { employeeId, date, shiftId: Number(value), isWeeklyOff: false }), 'Day updated');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Assignments</h2>
        <p className="mt-1 text-gray-500">Give employees, a whole branch, a country or the whole company a work schedule, a weekly off and a roster pattern. Each has an effective date, so history is kept. An employee's own assignment always wins over the branch, country and company ones.</p>
      </div>

      <div role="tablist" aria-label="Who is this for" className="inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {([['EMPLOYEE', 'Employees'], ['SITE', 'A site'], ['BRANCH', 'A branch'], ['COUNTRY', 'A country'], ['COMPANY', 'Whole company']] as const).map(([key, text]) => (
          <button key={key} type="button" role="tab" aria-selected={level === key} onClick={() => { setLevel(key); setError(''); setNotice(''); }} className={`rounded-md px-3.5 py-1.5 text-sm font-medium ${level === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{text}</button>
        ))}
      </div>

      {level !== 'EMPLOYEE' && (
        <>
          {level === 'SITE' && (
            <div className="max-w-sm">
              <Select label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="Select a site…">
                <option value="">Select a site…</option>
                {sites.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </div>
          )}
          {level === 'BRANCH' && (
            <div className="max-w-sm">
              <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="Select a branch…">
                <option value="">Select a branch…</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          )}
          {level === 'COUNTRY' && (
            <div className="max-w-sm">
              <Select label="Country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="Select a country…">
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
            <>
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
                What you assign here applies to everyone in <b>{targetName}</b>, including people who join later, from the date you give. It is used for anyone who has no assignment of their own; a site beats its branch, a branch beats a country, and a country beats the company.
              </p>
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <AssignmentCard title="Work schedule" hint="Required hours and start model." rows={rowsFor('WORK_SCHEDULE')} options={schedules.map((x) => ({ id: x.id, name: `${x.name} (${x.code})` }))} onAssign={(id, from) => giveToGroup('WORK_SCHEDULE', id, from)} onRemove={(id) => runGroup(() => removeGroupAssignment(id), 'Assignment removed')} />
                <AssignmentCard title="Weekly off" hint="Which weekdays are off. A roster entry or pattern still wins for the days it covers." rows={rowsFor('WEEKLY_OFF')} options={weeklyOffs.map((t) => ({ id: t.id, name: t.name }))} onAssign={(id, from) => giveToGroup('WEEKLY_OFF', id, from)} onRemove={(id) => runGroup(() => removeGroupAssignment(id), 'Assignment removed')} />
                <AssignmentCard withAnchor title="Roster pattern" hint="The repeating cycle of shifts and weekly offs." rows={rowsFor('ROSTER_PATTERN')} options={patterns.map((x) => ({ id: x.id, name: `${x.name} (${x.cycleDays} days)` }))} onAssign={(id, from, anchor) => giveToGroup('ROSTER_PATTERN', id, from, anchor)} onRemove={(id) => runGroup(() => removeGroupAssignment(id), 'Assignment removed')} />
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900">Holiday calendar</h3>
                  <p className="mt-2 text-sm text-gray-600">Holiday calendars are tied to a company, country or branch on the calendar itself. Open the <b>Holiday calendars</b> tab and set "Applies to" there. The order in which they apply is set on the same tab.</p>
                </section>
              </div>
            </>
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
        <p className="mt-1.5 text-xs text-gray-500">Choose one employee to see their history and month. Choose several to give them all the same schedule, weekly off, roster pattern or calendar.</p>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">{notice}</p>}

      {employeeId === null && picked.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Choose an employee to see and change their schedule.</p>
      ) : employeeId === null ? (
        <>
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800"><b>{picked.length}</b> employees chosen. What you assign below applies to all of them, from the date you give.</p>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <AssignmentCard bulk title="Work schedule" hint="Required hours and start model." rows={[]} options={schedules.map((x) => ({ id: x.id, name: `${x.name} (${x.code})` }))} onAssign={(id, from) => runMany((e) => assignWorkSchedule(e, { workScheduleId: id, effectiveFrom: from }), 'Work schedule assigned')} onRemove={async () => {}} />
            <AssignmentCard bulk title="Weekly off" hint="Which weekdays are off." rows={[]} options={weeklyOffs.map((t) => ({ id: t.id, name: t.name }))} onAssign={(id, from) => runMany((e) => assignWeeklyOffTemplate(e, { templateId: id, effectiveFrom: from }), 'Weekly off assigned')} onRemove={async () => {}} />
            <AssignmentCard bulk withAnchor title="Roster pattern" hint="The repeating cycle of shifts and weekly offs." rows={[]} options={patterns.map((x) => ({ id: x.id, name: `${x.name} (${x.cycleDays} days)` }))} onAssign={(id, from, anchor) => runMany((e) => assignRosterPattern(e, { patternId: id, effectiveFrom: from, anchorDate: anchor }), 'Roster pattern assigned')} onRemove={async () => {}} />
            <AssignmentCard bulk title="Employee holiday calendar" hint="Only if these people need a calendar of their own." rows={[]} options={calendars.map((c) => ({ id: c.id, name: c.name }))} onAssign={(id, from) => runMany((e) => assignHolidayCalendar(e, { calendarId: id, effectiveFrom: from }), 'Holiday calendar assigned')} onRemove={async () => {}} />
          </div>
        </>
      ) : !assignments ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <AssignmentCard
              title="Work schedule"
              hint="Required hours and start model."
              rows={assignments.workSchedules}
              options={schedules.map((s) => ({ id: s.id, name: `${s.name} (${s.code})` }))}
              onAssign={(id, from) => run(() => assignWorkSchedule(employeeId, { workScheduleId: id, effectiveFrom: from }), 'Work schedule assigned')}
              onRemove={(id) => run(() => removeAssignment(employeeId, 'work-schedule' as Kind, id), 'Assignment removed')}
            />
            <AssignmentCard
              title="Weekly off"
              hint="Which weekdays are off (templates are made under Weekly off). A roster entry or pattern still wins for the days it covers."
              rows={assignments.weeklyOffs ?? []}
              options={weeklyOffs.map((t) => ({ id: t.id, name: t.name }))}
              onAssign={(id, from) => run(() => assignWeeklyOffTemplate(employeeId, { templateId: id, effectiveFrom: from }), 'Weekly off assigned')}
              onRemove={(id) => run(() => removeAssignment(employeeId, 'weekly-off' as Kind, id), 'Assignment removed')}
            />
            <AssignmentCard
              title="Roster pattern"
              hint="The repeating cycle of shifts and weekly offs."
              rows={assignments.rosterPatterns}
              options={patterns.map((p) => ({ id: p.id, name: `${p.name} (${p.cycleDays} days)` }))}
              withAnchor
              onAssign={(id, from, anchor) => run(() => assignRosterPattern(employeeId, { patternId: id, effectiveFrom: from, anchorDate: anchor }), 'Roster pattern assigned')}
              onRemove={(id) => run(() => removeAssignment(employeeId, 'roster-pattern' as Kind, id), 'Assignment removed')}
            />
            <AssignmentCard
              title="Employee holiday calendar"
              hint="Only if this person needs a calendar of their own; otherwise the branch, country or company one applies."
              rows={assignments.holidayCalendars}
              options={calendars.map((c) => ({ id: c.id, name: c.name }))}
              onAssign={(id, from) => run(() => assignHolidayCalendar(employeeId, { calendarId: id, effectiveFrom: from }), 'Holiday calendar assigned')}
              onRemove={(id) => run(() => removeAssignment(employeeId, 'holiday-calendar' as Kind, id), 'Assignment removed')}
            />
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selectedName || 'Employee'}: {monthLabel}</h3>
                <p className="text-xs text-gray-500">Country of employment: {country || '—'}. Change a single day below; "Pattern" puts it back.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Previous month">←</button>
                <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="Next month">→</button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500"><tr><th className="py-2">Date</th><th className="py-2">Day</th><th className="py-2">Status</th><th className="py-2">Work schedule</th><th className="py-2">Change day</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((d) => {
                    const s = statusOf(d);
                    const dt = new Date(`${d.date}T00:00:00Z`);
                    return (
                      <tr key={d.date}>
                        <td className="py-1.5 font-mono text-[13px] text-gray-700">{d.date}</td>
                        <td className="py-1.5 text-gray-600">{dt.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}</td>
                        <td className="py-1.5">
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.text}</span>
                          {s.note && <span className="ml-2 text-xs text-gray-400">{s.note}</span>}
                        </td>
                        <td className="py-1.5 text-gray-600">{d.workSchedule?.name ?? '—'}</td>
                        <td className="py-1.5">
                          <Select aria-label={`Change ${d.date}`} value="" onChange={(e) => override(d.date, e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs">
                            <option value="">…</option>
                            {shifts.map((sh) => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                            <option value="OFF">Weekly off</option>
                            {d.roster.source === 'ENTRY' && <option value="PATTERN">Pattern or weekly off</option>}
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      </>
      )}
    </div>
  );
}
