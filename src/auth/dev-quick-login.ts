/**
 * Development quick login: a passwordless sign-in for users marked "Dev login" on the Users page.
 * It is only ever on when the server is not running in production AND DEV_QUICK_LOGIN=true.
 * In production the endpoints answer 404, whatever is stored in the database.
 */
export function devQuickLoginAllowed(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return (nodeEnv ?? '').toLowerCase() !== 'production' && (flag ?? '').trim().toLowerCase() === 'true';
}
