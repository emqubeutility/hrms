/**
 * Leave rules as pure functions: which days count, the sandwich rule, taking days from the
 * earliest-expiring balance first, accrual and the leave year.
 */

export type DayKind = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY';

export interface TimelineDay {
  date: string;
  kind: DayKind;
}

export interface SandwichConfig {
  enabled: boolean;
  /** The leave type must also be marked eligible. */
  typeEligible: boolean;
  weeklyOffs: boolean;
  holidays: boolean;
  /** true: leave must be on both sides of the off days; false: either side is enough. */
  requireBothSides: boolean;
}

export type CalcReason = 'LEAVE' | 'HALF_DAY' | 'OFF_NOT_COUNTED' | 'SANDWICH_WEEKLY_OFF' | 'SANDWICH_HOLIDAY';

export interface CalcDay {
  date: string;
  kind: DayKind;
  days: number;
  reason: CalcReason;
}

/** Whether weekly offs / holidays inside the request are left out of the days counted (the default) or count like working days. */
export interface DayExclusions {
  weeklyOffs: boolean;
  holidays: boolean;
}
const EXCLUDE_BOTH: DayExclusions = { weeklyOffs: true, holidays: true };

export interface CalcResult {
  requestedDays: number;
  sandwichDays: number;
  totalDays: number;
  days: CalcDay[];
}

const isoAdd = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Counts the days an application takes from the balance.
 *
 * `timeline` must cover the range plus a margin on both sides (a week is enough), so the off days
 * next to the range can be seen. `existingLeave` is the employee's other approved or pending leave
 * (working days only) of types that take part in sandwich leave.
 *
 * Working days in the range count one each (a single half day counts 0.5). Off days are not
 * counted, unless the sandwich rule applies: the off days between two working days of leave, or
 * right next to this leave (leave on either side, or on both sides when the setting requires it).
 * A half day does not trigger the rule.
 */
export function countLeaveDays(
  timeline: TimelineDay[],
  from: string,
  to: string,
  halfDay: boolean,
  sandwich: SandwichConfig,
  existingLeave: Set<string> = new Set(),
  exclude: DayExclusions = EXCLUDE_BOTH,
): CalcResult {
  const byDate = new Map(timeline.map((d) => [d.date, d.kind]));
  const range: TimelineDay[] = [];
  for (let d = from; d <= to; d = isoAdd(d, 1)) range.push({ date: d, kind: byDate.get(d) ?? 'WORKING' });

  const days: CalcDay[] = [];
  const mine = new Set<string>();
  for (const d of range) {
    // A weekly off or holiday is left out unless this leave type counts it.
    const counted = d.kind === 'WORKING' || (d.kind === 'WEEKLY_OFF' && !exclude.weeklyOffs) || (d.kind === 'HOLIDAY' && !exclude.holidays);
    if (counted) {
      const half = halfDay && from === to;
      days.push({ date: d.date, kind: d.kind, days: half ? 0.5 : 1, reason: half ? 'HALF_DAY' : 'LEAVE' });
      mine.add(d.date);
    } else {
      days.push({ date: d.date, kind: d.kind, days: 0, reason: 'OFF_NOT_COUNTED' });
    }
  }

  const applies = sandwich.enabled && sandwich.typeEligible && !(halfDay && from === to);
  if (applies) {
    const leaveWorking = new Set<string>([...mine, ...existingLeave]);
    const dates = timeline.map((d) => d.date).sort();
    const isOff = (date: string) => (byDate.get(date) ?? 'WORKING') !== 'WORKING';
    // Walk the timeline and look at each run of consecutive off days.
    let i = 0;
    while (i < dates.length) {
      if (!isOff(dates[i])) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < dates.length && isOff(dates[j + 1]) && isoAdd(dates[j], 1) === dates[j + 1]) j++;
      const before = i > 0 && isoAdd(dates[i - 1], 1) === dates[i] ? dates[i - 1] : null;
      const after = j + 1 < dates.length && isoAdd(dates[j], 1) === dates[j + 1] ? dates[j + 1] : null;
      const beforeLeave = !!before && leaveWorking.has(before);
      const afterLeave = !!after && leaveWorking.has(after);
      const adjacentToThis = (!!before && mine.has(before)) || (!!after && mine.has(after));
      const triggered = sandwich.requireBothSides ? beforeLeave && afterLeave : beforeLeave || afterLeave;
      if (adjacentToThis && triggered) {
        for (let k = i; k <= j; k++) {
          const kind = byDate.get(dates[k])!;
          const counts = (kind === 'WEEKLY_OFF' && sandwich.weeklyOffs) || (kind === 'HOLIDAY' && sandwich.holidays);
          if (!counts) continue;
          const existing = days.find((x) => x.date === dates[k]);
          // Already counted as a leave day (this leave type does not leave it out): the sandwich rule adds nothing.
          if (existing && existing.days > 0) continue;
          const entry: CalcDay = { date: dates[k], kind, days: 1, reason: kind === 'WEEKLY_OFF' ? 'SANDWICH_WEEKLY_OFF' : 'SANDWICH_HOLIDAY' };
          if (existing) Object.assign(existing, entry);
          else days.push(entry);
        }
      }
      i = j + 1;
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const requestedDays = r2(days.filter((d) => d.reason === 'LEAVE' || d.reason === 'HALF_DAY').reduce((s, d) => s + d.days, 0));
  const sandwichDays = r2(days.filter((d) => d.reason.startsWith('SANDWICH')).reduce((s, d) => s + d.days, 0));
  return { requestedDays, sandwichDays, totalDays: r2(requestedDays + sandwichDays), days };
}

/* ------------------------------------------------------------------ balances */

export interface Bucket {
  id: number;
  remaining: number;
  expiresOn: string | null;
}

/** Takes days from the buckets that expire first (buckets that never expire last). */
export function allocateFefo(buckets: Bucket[], days: number): { allocations: { creditId: number; days: number }[]; shortfall: number } {
  const sorted = [...buckets].filter((b) => b.remaining > 0).sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return a.id - b.id;
    if (a.expiresOn === null) return 1;
    if (b.expiresOn === null) return -1;
    return a.expiresOn < b.expiresOn ? -1 : 1;
  });
  let need = Math.round(days * 100) / 100;
  const allocations: { creditId: number; days: number }[] = [];
  for (const b of sorted) {
    if (need <= 0) break;
    const take = Math.min(b.remaining, need);
    allocations.push({ creditId: b.id, days: take });
    need = Math.round((need - take) * 100) / 100;
  }
  return { allocations, shortfall: Math.max(0, need) };
}

/* ------------------------------------------------------------------ accrual and the leave year */

/** The leave year containing a date: starts on the first of `startMonth`, ends the day before the next one. */
export function leaveYear(date: string, startMonth: number): { start: string; end: string; label: string } {
  const [y, m] = date.split('-').map(Number);
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endYear = startMonth === 1 ? startYear : startYear + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const end = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
  return { start, end, label: startMonth === 1 ? String(startYear) : `${startYear}-${String(startYear + 1).slice(2)}` };
}

export const monthlyCredit = (annualDays: number): number => Math.round((annualDays / 12) * 100) / 100;

/** Comp off credits can expire a number of days after they are earned. */
export const compOffExpiry = (creditedOn: string, expiryDays: number | null): string | null => (expiryDays ? isoAdd(creditedOn, expiryDays) : null);

export { isoAdd };
