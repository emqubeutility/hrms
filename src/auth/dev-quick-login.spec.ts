import { devQuickLoginAllowed } from './dev-quick-login';

describe('devQuickLoginAllowed', () => {
  it('is on only outside production with the flag set to true', () => {
    expect(devQuickLoginAllowed('development', 'true')).toBe(true);
    expect(devQuickLoginAllowed('test', 'TRUE')).toBe(true);
  });

  it('is off in production, even with the flag set', () => {
    expect(devQuickLoginAllowed('production', 'true')).toBe(false);
    expect(devQuickLoginAllowed('PRODUCTION', 'true')).toBe(false);
  });

  it('is off unless the flag is exactly true', () => {
    expect(devQuickLoginAllowed('development', undefined)).toBe(false);
    expect(devQuickLoginAllowed('development', 'false')).toBe(false);
    expect(devQuickLoginAllowed('development', '1')).toBe(false);
  });
});
