import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { EmailService } from '../common/services/email.service';
import { SecurityConfigService } from '../common/services/security-config.service';
import { generateSecureToken, sha256 } from '../common/utils/crypto.util';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

/**
 * Legacy message (system.Message id 2, InvalidLogin). Every login refusal uses
 * this text, including locked and inactive accounts, so the response does not
 * reveal whether a username exists or is in a particular state (BR-UM-01..03).
 */
export const INVALID_LOGIN_MESSAGE =
  'Incorrect username and/or password. Please try again or click on Forgot Password to create a new password';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Window in which a just-rotated refresh token may be retried by a parallel request. */
const ROTATION_GRACE_MS = 30 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
  user: {
    id: number;
    username: string;
    userTypeId: number;
    profileId: number;
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly sessions: SessionService,
    private readonly securityConfig: SecurityConfigService,
  ) {
    this.bcryptRounds = this.config.get<number>('app.security.bcryptRounds', 12);
  }

  // ---------------------------------------------------------------------------
  // Login / logout / refresh
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<LoginResult> {
    const username = dto.username.trim().toLowerCase();
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { profile: { select: { isSiteAccess: true } }, activity: true },
    });

    if (!user) {
      // Spend the same bcrypt time as a real check so response timing does not reveal the username.
      await this.dummyVerify(dto.password);
      await this.auditLoginFailed(undefined, undefined, ip, { reason: 'unknown_user', username });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    const passwordValid = await this.verifyPassword(dto.password, user.passwordHash);

    const refusal = this.loginRefusal(user, now);
    if (refusal) {
      await this.auditLoginFailed(user.id, user.profileId, ip, { reason: refusal });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    if (!passwordValid) {
      await this.recordFailedLogin(user.id, now, ip);
      await this.auditLoginFailed(user.id, user.profileId, ip, { reason: 'invalid_password' });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    return this.completeLogin(user, now, ip, userAgent);
  }

  /** Opens the session once the person's identity is known (a checked password, or the development quick login). */
  private async completeLogin(
    user: { id: number; username: string; userTypeId: number; profileId: number; mustChangePassword: boolean },
    now: Date,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const mustChangePassword = user.mustChangePassword;
    await this.prisma.$transaction([
      this.prisma.userActivity.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastLoginAt: now, lastIpUsed: ip ?? null },
        update: {
          lastLoginAt: now,
          lastIpUsed: ip ?? null,
          failedLoginAttempts: 0,
          failedLoginAttemptAt: null,
          isLocked: false,
          lockedUntil: null,
        },
      }),
    ]);

    const session = await this.sessions.issue({
      userId: user.id,
      profileId: user.profileId,
      userTypeId: user.userTypeId,
      ip,
      userAgent,
    });

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: String(user.id),
      ipAddress: ip,
      metadata: { sessionId: session.sessionId.toString(), mustChangePassword },
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        userTypeId: user.userTypeId,
        profileId: user.profileId,
      },
    };
  }

  /** Development only: the users marked "Dev login". 404 unless the server allows it (never in production). */
  async devLogins() {
    if (!this.config.get<boolean>('app.devQuickLogin', false)) throw new NotFoundException();
    const rows = await this.prisma.user.findMany({
      where: { devQuickLogin: true, isActive: true },
      orderBy: [{ userTypeId: 'asc' }, { username: 'asc' }],
      select: { username: true, userType: { select: { name: true } }, profile: { select: { name: true, lastName: true } } },
    });
    return rows.map((r) => ({
      username: r.username,
      role: r.userType.name,
      name: [r.profile.name, r.profile.lastName].filter(Boolean).join(' '),
    }));
  }

  /** Development only: signs in as a "Dev login" user without a password. Same checks as a normal sign-in. */
  async devLogin(username: string, ip?: string, userAgent?: string): Promise<LoginResult> {
    if (!this.config.get<boolean>('app.devQuickLogin', false)) throw new NotFoundException();
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { profile: { select: { isSiteAccess: true } }, activity: true },
    });
    if (!user || !user.devQuickLogin || this.loginRefusal(user, now)) {
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }
    await this.audit.log({ actorProfileId: user.profileId, action: 'DEV_QUICK_LOGIN', entityType: 'User', entityId: String(user.id), ipAddress: ip });
    return this.completeLogin(user, now, ip, userAgent);
  }

  async logout(refreshToken: string | undefined, ip?: string): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: { select: { profileId: true } } },
    });
    if (!session || session.revokedAt) return;

    await this.sessions.revokeOne(session.userId, session.id, 'logout');
    await this.audit.log({
      actorProfileId: session.user.profileId,
      action: 'LOGOUT',
      entityType: 'Session',
      entityId: session.id.toString(),
      ipAddress: ip,
    });
  }

  /**
   * Rotates a refresh token. The new session joins the same family, and the
   * family's absolute lifetime is not extended. Reuse of an already-rotated
   * token (outside the grace window) revokes the whole family.
   */
  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const invalid = () => new UnauthorizedException('Invalid or expired refresh token');
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    const now = new Date();

    if (!session || session.revokedAt) throw invalid();

    if (session.rotatedAt) {
      const sinceRotation = now.getTime() - session.rotatedAt.getTime();
      if (sinceRotation <= ROTATION_GRACE_MS) {
        // Parallel request (e.g. two browser tabs) that lost the race: refuse, keep the family.
        throw invalid();
      }
      await this.sessions.revokeFamily(session.familyId, 'rotated_token_reuse');
      await this.audit.log({
        action: 'SESSION_FAMILY_REVOKED',
        entityType: 'Session',
        entityId: session.id.toString(),
        ipAddress: ip,
        metadata: { reason: 'rotated_token_reuse', userId: session.userId },
      });
      throw new UnauthorizedException('Token reused. All sessions for this login were revoked.');
    }

    if (session.expiresAt <= now) throw invalid();

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { profile: { select: { isSiteAccess: true } }, activity: true },
    });
    if (!user || this.loginRefusal(user, now)) {
      await this.sessions.revokeOne(session.userId, session.id, 'account_unavailable');
      throw invalid();
    }

    // Claim the token atomically: only one request can rotate it.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now, lastUsedAt: now },
    });
    if (claimed.count === 0) {
      throw invalid();
    }

    const next = await this.sessions.issue({
      userId: user.id,
      profileId: user.profileId,
      userTypeId: user.userTypeId,
      ip,
      userAgent,
      familyId: session.familyId,
      familyStartedAt: session.familyStartedAt,
    });

    await this.audit.log({
      action: 'TOKEN_REFRESHED',
      entityType: 'Session',
      entityId: next.sessionId.toString(),
      ipAddress: ip,
      metadata: { previousSessionId: session.id.toString() },
    });

    return {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresIn: next.expiresIn,
    };
  }

  // ---------------------------------------------------------------------------
  // Forgot / reset / change password (D-013)
  // ---------------------------------------------------------------------------

  /**
   * The account whose person has this email anywhere on record: the account's own email, the employee's
   * work email, or the personal / official email on the employee profile. Only active accounts with site access.
   */
  private async findUserByEmail(email: string) {
    const include = { profile: true } as const;
    const base = { isActive: true, profile: { isSiteAccess: true } };
    const direct = await this.prisma.user.findFirst({
      where: { ...base, OR: [{ profile: { email: { equals: email, mode: 'insensitive' as const }, isSiteAccess: true } }, { profile: { isSiteAccess: true, employee: { workEmail: { equals: email, mode: 'insensitive' as const } } } }] },
      include,
    });
    if (direct) return direct;
    const rows = await this.prisma.$queryRaw<{ employeeId: number }[]>`
      SELECT "employeeId" FROM employee_profile_sections
      WHERE lower(data->>'personalEmail') = ${email} OR lower(data->>'officialEmail') = ${email}`;
    if (!rows.length) return null;
    return this.prisma.user.findFirst({ where: { ...base, profile: { isSiteAccess: true, employee: { id: { in: rows.map((r) => r.employeeId) } } } }, include });
  }

  async forgotPassword(email: string, ip?: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.findUserByEmail(normalizedEmail);

    // Same response whether or not the address matches an account.
    if (!user) {
      this.logger.warn(`Password reset asked for ${normalizedEmail.replace(/^(.).*(@.*)$/, '$1***$2')}: no active account with site access has this email`);
      return;
    }

    const now = new Date();
    const rawToken = generateSecureToken(48);

    // Only the newest reset link is valid.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        requestedIp: ip ?? null,
      },
    });

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: String(user.id),
      ipAddress: ip,
    });

    const frontendBaseUrl = this.config.get<string>('app.frontendBaseUrl', 'http://localhost:3001');
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const name = user.profile.name || '';

    await this.email.send({
      to: normalizedEmail,
      subject: 'Reset your HRMS password',
      text: `Hi ${name},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
      html: `<p>Hi ${escapeHtml(name)},</p>
<p>You requested a password reset. Click the link below to set a new password:</p>
<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
<p>This link expires in 1 hour. If you did not request this, please ignore this email.</p>`,
    });
  }

  async resetPassword(token: string, newPassword: string, ip?: string): Promise<void> {
    const invalid = () => new UnauthorizedException('Invalid or expired token');
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= now) throw invalid();

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      include: { profile: { select: { isSiteAccess: true } }, activity: true },
    });
    if (!user || this.loginRefusal(user, now)) throw invalid();

    const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now, usedIp: ip ?? null },
      }),
      this.prisma.userActivity.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordChangedAt: now, isPasswordReset: true },
        update: {
          passwordChangedAt: now,
          isPasswordReset: true,
          failedLoginAttempts: 0,
          failedLoginAttemptAt: null,
          isLocked: false,
          lockedUntil: null,
        },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'password_reset' },
      }),
    ]);

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: String(user.id),
      ipAddress: ip,
      metadata: { sessionsRevoked: true },
    });
  }

  /**
   * Self-service change (D-013). The caller's current session stays signed in;
   * every other session of the user is revoked.
   */
  async changePassword(
    userId: number,
    currentSessionId: bigint,
    currentPassword: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const currentValid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!currentValid) {
      await this.audit.log({
        actorProfileId: user.profileId,
        action: 'CHANGE_PASSWORD_FAILED',
        entityType: 'User',
        entityId: String(user.id),
        ipAddress: ip,
        metadata: { reason: 'invalid_current_password' },
      });
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('New password must be different from the current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.userActivity.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordChangedAt: now, isPasswordReset: false },
        update: { passwordChangedAt: now, isPasswordReset: false },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: currentSessionId } },
        data: { revokedAt: now, revokedReason: 'password_changed' },
      }),
    ]);

    await this.audit.log({
      actorProfileId: user.profileId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: String(user.id),
      ipAddress: ip,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Why a user may not sign in right now, or null if they may. */
  private loginRefusal(
    user: {
      isActive: boolean;
      profile: { isSiteAccess: boolean };
      activity: { isLocked: boolean; lockedUntil: Date | null } | null;
    },
    now: Date,
  ): string | null {
    if (!user.isActive) return 'inactive_user';
    if (!user.profile.isSiteAccess) return 'no_site_access';
    if (this.isLocked(user.activity, now)) return 'locked';
    return null;
  }

  /** Locked means flagged and not yet past lockedUntil. A null lockedUntil is a permanent lock (legacy). */
  private isLocked(
    activity: { isLocked: boolean; lockedUntil: Date | null } | null,
    now: Date,
  ): boolean {
    if (!activity || !activity.isLocked) return false;
    return activity.lockedUntil === null || activity.lockedUntil > now;
  }

  private async verifyPassword(plain: string, passwordHash: string | null): Promise<boolean> {
    return passwordHash ? bcrypt.compare(plain, passwordHash) : false;
  }

  private dummyVerify(plain: string): Promise<boolean> {
    if (!this.dummyHash) {
      this.dummyHash = bcrypt.hash(generateSecureToken(24), this.bcryptRounds);
    }
    return this.dummyHash.then((hash) => bcrypt.compare(plain, hash));
  }

  private async recordFailedLogin(userId: number, now: Date, ip?: string): Promise<void> {
    const [existing, maxLoginAttempts, lockoutMinutes] = await Promise.all([
      this.prisma.userActivity.findUnique({ where: { userId } }),
      this.securityConfig.getMaxLoginAttempts(),
      this.securityConfig.getLockoutMinutes(),
    ]);

    // A lock that has expired starts a fresh count, so one more typo does not re-lock at once.
    const lockExpired = !!existing?.lockedUntil && existing.lockedUntil <= now;
    const previous = lockExpired ? 0 : existing?.failedLoginAttempts ?? 0;
    const attempts = previous + 1;
    const shouldLock = attempts >= maxLoginAttempts;
    const lockedUntil = shouldLock
      ? new Date(now.getTime() + lockoutMinutes * 60 * 1000)
      : lockExpired
        ? null
        : existing?.lockedUntil ?? null;

    await this.prisma.userActivity.upsert({
      where: { userId },
      create: {
        userId,
        failedLoginAttempts: attempts,
        isLocked: shouldLock,
        failedLoginAttemptAt: now,
        lockedUntil,
        lastIpUsed: ip ?? null,
      },
      update: {
        failedLoginAttempts: attempts,
        isLocked: shouldLock,
        failedLoginAttemptAt: now,
        lockedUntil,
        lastIpUsed: ip ?? null,
      },
    });

    if (shouldLock) {
      await this.audit.log({
        action: 'ACCOUNT_LOCKED',
        entityType: 'User',
        entityId: String(userId),
        ipAddress: ip,
        metadata: { failedAttempts: attempts, lockoutMinutes },
      });
    }
  }

  private auditLoginFailed(
    userId: number | undefined,
    profileId: number | undefined,
    ip: string | undefined,
    metadata: Prisma.JsonObject,
  ) {
    return this.audit.log({
      actorProfileId: profileId,
      action: 'LOGIN_FAILED',
      entityType: userId !== undefined ? 'User' : undefined,
      entityId: userId !== undefined ? String(userId) : undefined,
      ipAddress: ip,
      metadata,
    });
  }
}
