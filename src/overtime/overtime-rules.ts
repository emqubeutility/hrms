/**
 * Overtime configuration rules (Attendance setup > Overtime). Pure functions, no I/O.
 *
 * - FIXED_PER_DAY: a fixed amount for each weekend or holiday day worked (one fixed option per employee).
 * - FIXED_MONTHLY: a fixed amount once a month, whatever the hours.
 * - HOURLY: OT hours x hourly rate x multiplier. A weekday multiplier and/or a weekend/holiday multiplier.
 *
 * The hourly rate comes from salary and is applied when payroll is built; it is not stored here.
 */

export const OVERTIME_TYPES = ['FIXED_PER_DAY', 'FIXED_MONTHLY', 'HOURLY'] as const;
export type OvertimeType = (typeof OVERTIME_TYPES)[number];

export const isFixedOvertime = (type: string): boolean => type === 'FIXED_PER_DAY' || type === 'FIXED_MONTHLY';

export interface OvertimeInput {
  type: string;
  fixedAmount?: number | null;
  weekdayMultiplier?: number | null;
  weekendMultiplier?: number | null;
}

/**
 * Starter rules, taken from the legacy system's OT configuration table (OTConfigId 1, 2, 4, 5).
 * Legacy type 118 = fixed amount, 119 = hourly multiplier. Each hourly rule carries one multiplier.
 * Seeded by name; existing rules are never changed.
 */
export const STARTER_OVERTIME_CONFIGURATIONS: { name: string; type: string; fixedAmount?: number; weekdayMultiplier?: number; weekendMultiplier?: number }[] = [
  { name: 'Fixed OT on weekend and Holiday', type: 'FIXED_PER_DAY', fixedAmount: 150 },
  { name: 'Weekday OT', type: 'HOURLY', weekdayMultiplier: 1.25 },
  { name: 'Weekend Hourly', type: 'HOURLY', weekendMultiplier: 1.5 },
  { name: 'Fixed Monthly OT', type: 'FIXED_MONTHLY', fixedAmount: 500 },
];

const MAX_MULTIPLIER = 10;

/** Returns the problems with a configuration; an empty list means it is valid. */
export function overtimeProblems(input: OvertimeInput): string[] {
  const errors: string[] = [];
  const { type, fixedAmount, weekdayMultiplier, weekendMultiplier } = input;
  if (!(OVERTIME_TYPES as readonly string[]).includes(type)) return ['Choose a type: fixed per day, fixed monthly or hourly'];

  if (isFixedOvertime(type)) {
    if (fixedAmount === null || fixedAmount === undefined) errors.push('Enter the fixed amount');
    else if (!(fixedAmount > 0)) errors.push('The fixed amount must be more than 0');
    if (weekdayMultiplier !== null && weekdayMultiplier !== undefined) errors.push('A fixed configuration has no multiplier');
    if (weekendMultiplier !== null && weekendMultiplier !== undefined) errors.push('A fixed configuration has no multiplier');
    return errors;
  }

  // HOURLY
  if (fixedAmount !== null && fixedAmount !== undefined) errors.push('An hourly configuration has no fixed amount');
  const hasWeekday = weekdayMultiplier !== null && weekdayMultiplier !== undefined;
  const hasWeekend = weekendMultiplier !== null && weekendMultiplier !== undefined;
  if (!hasWeekday && !hasWeekend) errors.push('Enter a weekday multiplier, a weekend or holiday multiplier, or both');
  if (hasWeekday && !(weekdayMultiplier! > 0 && weekdayMultiplier! <= MAX_MULTIPLIER)) errors.push(`The weekday multiplier must be more than 0 and at most ${MAX_MULTIPLIER}`);
  if (hasWeekend && !(weekendMultiplier! > 0 && weekendMultiplier! <= MAX_MULTIPLIER)) errors.push(`The weekend multiplier must be more than 0 and at most ${MAX_MULTIPLIER}`);
  return errors;
}
