import {
  DayKind,
  LeaveTypeRules,
  TimelineDay,
  allocateFefo,
  countLeaveDays,
  daysProblem,
  eventDateProblem,
  genderProblem,
  timesInServiceProblem,
  variantProblem,
} from './leave-rules';
import { addMonthsIso } from './entitlement-rules';

/**
 * Every kind of leave type the system supports, described by the fields the rules read.
 * The real types are rows in the database; these profiles cover each rule the application can switch on,
 * so each combination is tested once here.
 */
interface TypeProfile extends LeaveTypeRules {
  code: string;
  isSandwichEligible: boolean;
  excludeWeeklyOffs: boolean;
  excludeHolidays: boolean;
  balanceTracking: boolean;
  requiresApproval: boolean;
  requiresDocument: boolean;
  documentAfterDays: number;
  allowHalfDay: boolean;
}

const BASE: TypeProfile = {
  code: 'BASE',
  name: 'Base leave',
  variants: [],
  variantLabel: null,
  maxDaysPerRequest: null,
  genderRestriction: null,
  maxTimesInService: null,
  eventWindowMonths: null,
  eventLabel: null,
  isSandwichEligible: false,
  excludeWeeklyOffs: true,
  excludeHolidays: true,
  balanceTracking: true,
  requiresApproval: true,
  requiresDocument: false,
  documentAfterDays: 0,
  allowHalfDay: true,
};

const TYPES: Record<string, TypeProfile> = {
  annual: { ...BASE, code: 'ANNUAL', name: 'Annual leave', isSandwichEligible: true },
  sick: { ...BASE, code: 'SICK', name: 'Sick leave', requiresDocument: true, documentAfterDays: 2, allowHalfDay: false },
  unpaid: { ...BASE, code: 'UNPAID', name: 'Unpaid leave', balanceTracking: false },
  maternity: { ...BASE, code: 'MATERNITY', name: 'Maternity leave', genderRestriction: 'Female', maxDaysPerRequest: 90, allowHalfDay: false },
  paternity: { ...BASE, code: 'PATERNITY', name: 'Paternity leave', genderRestriction: 'Male', maxDaysPerRequest: 5, allowHalfDay: false },
  hajj: { ...BASE, code: 'HAJJ', name: 'Hajj leave', maxTimesInService: 1, allowHalfDay: false },
  bereavement: {
    ...BASE,
    code: 'BEREAVEMENT',
    name: 'Bereavement leave',
    variants: [
      { label: 'Spouse', maxDays: 5 },
      { label: 'Parent', maxDays: 3 },
    ],
    variantLabel: 'Relationship',
    allowHalfDay: false,
  },
  childEvent: { ...BASE, code: 'CHILD_EVENT', name: 'Child birth leave', eventWindowMonths: 6, eventLabel: 'Date of birth' },
  compOff: { ...BASE, code: 'COMP_OFF', name: 'Comp off', requiresApproval: false, excludeWeeklyOffs: false, excludeHolidays: false },
};

// 2026-12-04 is a Friday; Saturday and Sunday are weekly offs.
const timeline = (extra: Record<string, DayKind> = {}): TimelineDay[] => {
  const out: TimelineDay[] = [];
  for (let d = Date.parse('2026-11-23T00:00:00Z'); d <= Date.parse('2027-01-10T00:00:00Z'); d += 86_400_000) {
    const date = new Date(d).toISOString().slice(0, 10);
    const dow = new Date(d).getUTCDay();
    out.push({ date, kind: extra[date] ?? (dow === 0 || dow === 6 ? 'WEEKLY_OFF' : 'WORKING') });
  }
  return out;
};
const NO_SANDWICH = { enabled: false, typeEligible: false, weeklyOffs: false, holidays: false, requireBothSides: false };

/** Days counted for a request, applying the type's own weekly-off and holiday rules (no sandwich rule). */
const daysFor = (t: TypeProfile, from: string, to: string, extra: Record<string, DayKind> = {}) =>
  countLeaveDays(timeline(extra), from, to, false, NO_SANDWICH, new Set(), { weeklyOffs: t.excludeWeeklyOffs, holidays: t.excludeHolidays }).totalDays;

describe.each(Object.entries(TYPES))('%s: counting days', (_key, t) => {
  it(`Friday to Monday counts ${t.excludeWeeklyOffs ? '2 days (weekend off)' : '4 days (weekend counted)'}`, () => {
    expect(daysFor(t, '2026-12-04', '2026-12-07')).toBe(t.excludeWeeklyOffs ? 2 : 4);
  });

  it(`a holiday on Monday ${t.excludeHolidays ? 'takes no leave day' : 'is still counted'}`, () => {
    const weekendDays = t.excludeWeeklyOffs ? 2 : 4; // Friday and Monday, plus Saturday and Sunday when counted
    expect(daysFor(t, '2026-12-04', '2026-12-07', { '2026-12-07': 'HOLIDAY' })).toBe(weekendDays - (t.excludeHolidays ? 1 : 0));
  });

  it('a single working day counts as one day', () => {
    expect(daysFor(t, '2026-12-08', '2026-12-08')).toBe(1);
  });
});

describe('gender restriction', () => {
  it('maternity is for female employees only, whatever the case of the text', () => {
    expect(genderProblem(TYPES.maternity, 'Female')).toBeNull();
    expect(genderProblem(TYPES.maternity, 'female ')).toBeNull();
    expect(genderProblem(TYPES.maternity, 'Male')).toBe('Maternity leave is only for female employees');
  });

  it('paternity is for male employees only, and a missing gender is refused', () => {
    expect(genderProblem(TYPES.paternity, 'Male')).toBeNull();
    expect(genderProblem(TYPES.paternity, 'Female')).toBe('Paternity leave is only for male employees');
    expect(genderProblem(TYPES.paternity, undefined)).toBe('Paternity leave is only for male employees');
  });

  it('a type without a restriction accepts anyone, including no gender on file', () => {
    expect(genderProblem(TYPES.annual, undefined)).toBeNull();
    expect(genderProblem(TYPES.annual, 'Female')).toBeNull();
  });
});

describe('longest leave per request', () => {
  it('maternity allows up to 90 days, not 91', () => {
    expect(daysProblem(TYPES.maternity, null, 90)).toBeNull();
    expect(daysProblem(TYPES.maternity, null, 91)).toBe('Maternity leave can be at most 90 days at a time');
  });

  it('paternity allows up to 5 days', () => {
    expect(daysProblem(TYPES.paternity, null, 5)).toBeNull();
    expect(daysProblem(TYPES.paternity, null, 6)).toBe('Paternity leave can be at most 5 days at a time');
  });

  it('a type without a limit allows any length', () => {
    expect(daysProblem(TYPES.annual, null, 300)).toBeNull();
  });
});

describe('limit over the whole employment', () => {
  it('hajj can be taken once', () => {
    expect(timesInServiceProblem(TYPES.hajj, 0)).toBeNull();
    expect(timesInServiceProblem(TYPES.hajj, 1)).toBe('Hajj leave can be taken only once during employment, and you have already used it');
  });

  it('a type without a limit is never refused for count', () => {
    expect(timesInServiceProblem(TYPES.annual, 50)).toBeNull();
  });
});

describe('variants (for example the relationship)', () => {
  it('bereavement needs a relationship chosen', () => {
    expect(variantProblem(TYPES.bereavement, undefined)).toBe('Choose the relationship for Bereavement leave');
    expect(variantProblem(TYPES.bereavement, 'Cousin')).toBe('Choose the relationship for Bereavement leave');
    expect(variantProblem(TYPES.bereavement, 'Spouse')).toBeNull();
  });

  it('each relationship has its own longest leave', () => {
    expect(daysProblem(TYPES.bereavement, 'Spouse', 5)).toBeNull();
    expect(daysProblem(TYPES.bereavement, 'Spouse', 6)).toBe('Bereavement leave (Spouse) can be at most 5 days');
    expect(daysProblem(TYPES.bereavement, 'Parent', 3)).toBeNull();
    expect(daysProblem(TYPES.bereavement, 'Parent', 4)).toBe('Bereavement leave (Parent) can be at most 3 days');
  });

  it('a type without variants needs none', () => {
    expect(variantProblem(TYPES.annual, undefined)).toBeNull();
  });
});

describe('event date window (child birth leave)', () => {
  const addMonths = addMonthsIso;
  const eventDate = '2026-12-01';
  const lastDay = addMonthsIso(eventDate, 6); // 2027-06-01

  it('needs the event date', () => {
    expect(eventDateProblem(TYPES.childEvent, '2026-12-02', '2026-12-02', null, addMonths)).toBe('Give the date of birth for Child birth leave');
  });

  it('cannot start before the event', () => {
    expect(eventDateProblem(TYPES.childEvent, '2026-11-30', '2026-12-01', eventDate, addMonths)).toBe('Child birth leave cannot start before the date of birth');
  });

  it('must end within the window, and the last day is allowed', () => {
    expect(eventDateProblem(TYPES.childEvent, '2026-12-02', lastDay, eventDate, addMonths)).toBeNull();
    const after = addMonthsIso(lastDay, 1);
    expect(eventDateProblem(TYPES.childEvent, '2026-12-02', after, eventDate, addMonths)).toBe(
      `Child birth leave must be taken within 6 month(s) of the date of birth (by ${lastDay})`,
    );
  });

  it('a type without an event window needs no date', () => {
    expect(eventDateProblem(TYPES.annual, '2026-12-02', '2026-12-02', null, addMonths)).toBeNull();
  });
});

describe('balance: which days are taken first', () => {
  it('takes from the credit that expires first, then the rest', () => {
    const { allocations, shortfall } = allocateFefo(
      [
        { id: 1, remaining: 10, expiresOn: '2027-12-31' },
        { id: 2, remaining: 4, expiresOn: '2027-03-31' },
        { id: 3, remaining: 6, expiresOn: null },
      ],
      8,
    );
    expect(allocations).toEqual([
      { creditId: 2, days: 4 },
      { creditId: 1, days: 4 },
    ]);
    expect(shortfall).toBe(0);
  });

  it('reports what cannot be covered', () => {
    const { shortfall } = allocateFefo([{ id: 1, remaining: 3, expiresOn: null }], 5);
    expect(shortfall).toBe(2);
  });

  it('an unpaid leave type keeps no balance, so there is nothing to take from', () => {
    expect(TYPES.unpaid.balanceTracking).toBe(false);
    expect(allocateFefo([], 3)).toEqual({ allocations: [], shortfall: 3 });
  });
});

describe('approval and documents', () => {
  it('compensatory leave is approved as soon as it is sent', () => {
    expect(TYPES.compOff.requiresApproval).toBe(false);
  });

  it('sick leave needs a document only beyond its limit', () => {
    const over = (days: number) => TYPES.sick.requiresDocument && days > TYPES.sick.documentAfterDays;
    expect(over(2)).toBe(false);
    expect(over(3)).toBe(true);
  });
});
