import { registerAs } from '@nestjs/config';
import { devQuickLoginAllowed } from '../auth/dev-quick-login';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appTimezone: process.env.APP_TIMEZONE ?? 'Asia/Dubai',
  // Development only: passwordless sign-in for users marked "Dev login" (never in production).
  devQuickLogin: devQuickLoginAllowed(process.env.NODE_ENV, process.env.DEV_QUICK_LOGIN),
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlDays: parseInt(process.env.REFRESH_TTL_DAYS ?? '14', 10),
    // D-007: idle timeout for a login session (legacy client-side limit was 180 min).
    sessionIdleMinutes: parseInt(process.env.SESSION_IDLE_MINUTES ?? '180', 10),
  },
  storage: {
    documentsPath: process.env.DOCUMENT_STORAGE_PATH ?? './private-storage/documents',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10),
    lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES ?? '30', 10),
  },
  email: {
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? 'no-reply@example.com',
    // Outside production, all email goes to this one mailbox (see email-routing.ts).
    devRedirectTo: process.env.DEV_MAIL_REDIRECT_TO ?? '',
  },
  frontendBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:3001',
}));
