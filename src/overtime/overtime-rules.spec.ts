import { isFixedOvertime, overtimeProblems } from './overtime-rules';

describe('overtimeProblems', () => {
  it('accepts a fixed amount per day and a fixed monthly amount', () => {
    expect(overtimeProblems({ type: 'FIXED_PER_DAY', fixedAmount: 150 })).toEqual([]);
    expect(overtimeProblems({ type: 'FIXED_MONTHLY', fixedAmount: 500 })).toEqual([]);
  });

  it('needs a fixed amount above zero for fixed types', () => {
    expect(overtimeProblems({ type: 'FIXED_MONTHLY', fixedAmount: null })).toEqual(['Enter the fixed amount']);
    expect(overtimeProblems({ type: 'FIXED_PER_DAY', fixedAmount: 0 })).toEqual(['The fixed amount must be more than 0']);
  });

  it('refuses multipliers on a fixed configuration', () => {
    expect(overtimeProblems({ type: 'FIXED_PER_DAY', fixedAmount: 150, weekendMultiplier: 1.5 })).toEqual(['A fixed configuration has no multiplier']);
  });

  it('accepts hourly with a weekday multiplier, a weekend multiplier, or both', () => {
    expect(overtimeProblems({ type: 'HOURLY', weekdayMultiplier: 1.25, weekendMultiplier: 1.5 })).toEqual([]);
    expect(overtimeProblems({ type: 'HOURLY', weekdayMultiplier: 1.25 })).toEqual([]);
    expect(overtimeProblems({ type: 'HOURLY', weekendMultiplier: 1.5 })).toEqual([]);
  });

  it('needs at least one hourly multiplier and no fixed amount', () => {
    expect(overtimeProblems({ type: 'HOURLY' })).toEqual(['Enter a weekday multiplier, a weekend or holiday multiplier, or both']);
    expect(overtimeProblems({ type: 'HOURLY', fixedAmount: 100, weekdayMultiplier: 1.25 })).toEqual(['An hourly configuration has no fixed amount']);
  });

  it('rejects an unknown type and out-of-range multipliers', () => {
    expect(overtimeProblems({ type: 'FLAT' })).toHaveLength(1);
    expect(overtimeProblems({ type: 'HOURLY', weekdayMultiplier: 0 })[0]).toMatch(/weekday multiplier/);
    expect(overtimeProblems({ type: 'HOURLY', weekendMultiplier: 11 })[0]).toMatch(/weekend multiplier/);
  });

  it('knows which types are fixed', () => {
    expect(isFixedOvertime('FIXED_PER_DAY')).toBe(true);
    expect(isFixedOvertime('HOURLY')).toBe(false);
  });
});
