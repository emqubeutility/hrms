import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { SessionService } from '../auth/session.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserType } from '../common/constants/user-types';
import { generateTemporaryPassword } from '../common/utils/crypto.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

export interface PaginatedUsers {
  items: any[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

const userSelect = {
  id: true,
  username: true,
  userTypeId: true,
  devQuickLogin: true,
  profileId: true,
  isActive: true,
  mustChangePassword: true,
  allBranches: true,
  branches: { select: { branchId: true } },
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      id: true,
      name: true,
      middleName: true,
      lastName: true,
      email: true,
      contactNo: true,
      isSiteAccess: true,
    },
  },
  userType: { select: { id: true, name: true } },
  activity: {
    select: {
      isLocked: true,
      lockedUntil: true,
      failedLoginAttempts: true,
      lastLoginAt: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {
    this.bcryptRounds = this.config.get<number>('app.security.bcryptRounds', 12);
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsers> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = [25, 50, 100].includes(query.pageSize ?? 25) ? query.pageSize ?? 25 : 25;
    const skip = (page - 1) * pageSize;

    const allowedSortFields = ['username', 'createdAt', 'userTypeId', 'isActive'];
    const sortBy =
      query.sortBy && allowedSortFields.includes(query.sortBy) ? query.sortBy : 'username';
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: Prisma.UserWhereInput = {};
    if (query.userTypeId !== undefined) where.userTypeId = query.userTypeId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { username: { contains: term, mode: 'insensitive' } },
        {
          profile: {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { middleName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [totalItems, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        select: userSelect,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        totalItems,
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Employees who are allowed to sign in (System Access tab: Login enabled = Yes) but have no account yet.
   * HR limited to some branches only sees employees of those branches.
   */
  async loginCandidates(actor: CurrentUserPayload) {
    const rows = await this.prisma.employeeProfileSection.findMany({
      where: {
        sectionKey: 'access',
        data: { path: ['loginEnabled'], equals: 'Yes' },
        employee: {
          isActive: true,
          profile: { user: null },
          ...(actor.branchAccess ? { branchId: { in: actor.branchAccess } } : {}),
        },
      },
      select: {
        data: true,
        employee: { select: { id: true, employeeCode: true, designation: true, profileId: true, branch: { select: { name: true } }, profile: { select: { name: true, lastName: true } } } },
      },
      orderBy: { employee: { employeeCode: 'asc' } },
      take: 500,
    });
    return rows.map((r) => {
      const d = (r.data ?? {}) as { username?: unknown; accessRole?: unknown };
      return {
        profileId: r.employee.profileId,
        employeeId: r.employee.id,
        code: r.employee.employeeCode,
        name: [r.employee.profile.name, r.employee.profile.lastName].filter(Boolean).join(' '),
        branchName: r.employee.branch?.name ?? null,
        designation: r.employee.designation,
        // what the System Access tab already says, to pre-fill the new account
        username: typeof d.username === 'string' && d.username.trim() ? d.username.trim().toLowerCase() : r.employee.employeeCode.toLowerCase(),
        accessRole: typeof d.accessRole === 'string' ? d.accessRole : null,
      };
    });
  }

  async create(dto: CreateUserDto, actor: CurrentUserPayload, ip?: string) {
    this.assertMayAssignType(actor, dto.userTypeId);
    await this.assertUserTypeExists(dto.userTypeId);

    const username = dto.username.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw new ConflictException('Username already exists');
    }

    let profileId = dto.profileId;
    if (profileId) {
      const profile = await this.prisma.profile.findUnique({ where: { id: profileId } });
      if (!profile) throw new NotFoundException('Profile not found');
      if (await this.prisma.user.findUnique({ where: { profileId } })) {
        throw new ConflictException('A user already exists for this profile');
      }
    } else {
      const profile = await this.prisma.profile.create({
        data: { name: username, isSiteAccess: true, email: dto.email?.trim().toLowerCase() || null },
      });
      profileId = profile.id;
    }

    const branchChange = await this.checkBranchAccess(dto, actor, true, dto.userTypeId);
    // No password given: generate a temporary one. It is returned once and never stored in readable form.
    const generated = !dto.password;
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username,
          passwordHash,
          userTypeId: dto.userTypeId,
          profileId,
          // An admin-set password is temporary: the user must choose their own at first sign-in.
          mustChangePassword: true,
          isActive: true,
          ...(branchChange && {
            allBranches: branchChange.allBranches,
            branches: { create: branchChange.branchIds.map((branchId) => ({ branchId })) },
          }),
        },
        select: userSelect,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Username or profile already in use');
      }
      throw error;
    }

    // An account for an existing person needs site access switched on, or sign-in is refused.
    if (dto.profileId) {
      const email = dto.email?.trim().toLowerCase();
      await this.prisma.profile.update({ where: { id: dto.profileId }, data: { isSiteAccess: true, ...(email ? { email } : {}) } });
    }

    await this.audit.log({
      actorProfileId: actor.profileId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: String(user.id),
      ipAddress: ip,
      metadata: { userTypeId: dto.userTypeId, profileId, passwordGenerated: generated },
    });

    // The generated password is shown once to the person who created the account.
    return generated ? { ...user, temporaryPassword: password } : user;
  }

  async update(id: number, dto: UpdateUserDto, actor: CurrentUserPayload, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const isSelf = target.id === actor.userId;
    const changesType = dto.userTypeId !== undefined && dto.userTypeId !== target.userTypeId;
    const deactivates = dto.isActive === false && target.isActive;

    if (changesType) {
      await this.assertUserTypeExists(dto.userTypeId!);
      this.assertMayAssignType(actor, dto.userTypeId!);
      if (target.userTypeId === UserType.SystemAdmin) this.assertMayTouchAdmin(actor);
    }
    if (deactivates && target.userTypeId === UserType.SystemAdmin) {
      this.assertMayTouchAdmin(actor);
    }
    if (isSelf && (deactivates || changesType)) {
      throw new ForbiddenException('You cannot deactivate or change the role of your own account');
    }

    const losesAdminRole =
      target.userTypeId === UserType.SystemAdmin &&
      target.isActive &&
      ((changesType && dto.userTypeId !== UserType.SystemAdmin) || deactivates);
    if (losesAdminRole) {
      await this.assertAnotherActiveAdminExists(target.id);
    }

    const branchChange = await this.checkBranchAccess(dto, actor, target.allBranches, dto.userTypeId ?? target.userTypeId, changesType);
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (branchChange) data.allBranches = branchChange.allBranches;
    if (changesType) data.userTypeId = dto.userTypeId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.devQuickLogin !== undefined) data.devQuickLogin = dto.devQuickLogin;

    // Branch access is only touched when it was part of the request.
    const branchOps = branchChange
      ? [
          this.prisma.userBranch.deleteMany({ where: { userId: id } }),
          this.prisma.userBranch.createMany({ data: branchChange.branchIds.map((branchId) => ({ userId: id, branchId })) }),
        ]
      : [];
    const emailOps = dto.email !== undefined ? [this.prisma.profile.update({ where: { id: target.profileId }, data: { email: dto.email.trim().toLowerCase() || null } })] : [];
    const results = await this.prisma.$transaction([
      ...branchOps,
      ...emailOps,
      this.prisma.user.update({ where: { id }, data, select: userSelect }),
      ...(deactivates
        ? [
            this.prisma.session.updateMany({
              where: { userId: id, revokedAt: null },
              data: { revokedAt: new Date(), revokedReason: 'user_deactivated' },
            }),
          ]
        : []),
    ]);
    const updated = results[branchOps.length + emailOps.length] as Prisma.UserGetPayload<{ select: typeof userSelect }>;

    await this.audit.log({
      actorProfileId: actor.profileId,
      action: deactivates ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      entityType: 'User',
      entityId: String(id),
      ipAddress: ip,
      metadata: {
        ...(changesType ? { userTypeId: { from: target.userTypeId, to: dto.userTypeId } } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(branchChange ? { allBranches: branchChange.allBranches, branchIds: branchChange.branchIds } : {}),
      },
    });

    return updated;
  }

  async remove(id: number, actor: CurrentUserPayload, ip?: string) {
    return this.update(id, { isActive: false }, actor, ip);
  }

  /**
   * Admin sets a temporary password. The user must change it at next sign-in,
   * and every existing session is signed out.
   */
  async resetPassword(id: number, newPassword: string | undefined, actor: CurrentUserPayload, ip?: string): Promise<{ temporaryPassword?: string }> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === actor.userId) {
      throw new ForbiddenException('Use change-password to change your own password');
    }
    if (target.userTypeId === UserType.SystemAdmin) this.assertMayTouchAdmin(actor);

    const generated = !newPassword;
    const password = newPassword ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      }),
      this.prisma.userActivity.upsert({
        where: { userId: id },
        create: { userId: id, passwordChangedAt: now, isPasswordReset: true },
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
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'admin_password_reset' },
      }),
    ]);

    await this.audit.log({
      actorProfileId: actor.profileId,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'User',
      entityId: String(id),
      ipAddress: ip,
      metadata: { passwordGenerated: generated },
    });
    return generated ? { temporaryPassword: password } : {};
  }

  /** Clears a lock (legacy had no unlock path; auto-unlock also applies after lockedUntil). */
  async unlock(id: number, actor: CurrentUserPayload, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.userActivity.upsert({
      where: { userId: id },
      create: { userId: id, isLocked: false, failedLoginAttempts: 0 },
      update: { isLocked: false, lockedUntil: null, failedLoginAttempts: 0, failedLoginAttemptAt: null },
    });

    await this.audit.log({
      actorProfileId: actor.profileId,
      action: 'USER_UNLOCKED',
      entityType: 'User',
      entityId: String(id),
      ipAddress: ip,
    });
  }

  async revokeSessions(id: number, actor: CurrentUserPayload, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const count = await this.sessions.revokeAll(id, 'admin_revoked');

    await this.audit.log({
      actorProfileId: actor.profileId,
      action: 'USER_SESSIONS_REVOKED',
      entityType: 'User',
      entityId: String(id),
      ipAddress: ip,
      metadata: { revoked: count },
    });
    return { revoked: count };
  }

  // ---------------------------------------------------------------------------

  /** Only a System Administrator may create or grant the System Administrator role. */
  private assertMayAssignType(actor: CurrentUserPayload, userTypeId: number) {
    if (userTypeId === UserType.SystemAdmin) this.assertMayTouchAdmin(actor);
  }

  private assertMayTouchAdmin(actor: CurrentUserPayload) {
    if (actor.userTypeId !== UserType.SystemAdmin) {
      throw new ForbiddenException('Only a System Administrator can manage System Administrator accounts');
    }
  }

  /** Validates a branch-access change; only System Admins may grant branch access. */
  /** Only these user types can be limited to some branches; everyone else works in every branch. */
  private canBeBranchLimited(userTypeId: number) {
    return userTypeId === UserType.Manager || userTypeId === UserType.HRAdmin;
  }

  private async checkBranchAccess(
    dto: { allBranches?: boolean; branchIds?: number[] },
    actor: CurrentUserPayload,
    currentAll: boolean,
    finalUserTypeId: number,
    clearLimits = false,
  ): Promise<{ allBranches: boolean; branchIds: number[] } | null> {
    // An Executive (or System Admin) is never limited by branch, so any limit sent or left over is dropped.
    if (!this.canBeBranchLimited(finalUserTypeId)) {
      return clearLimits || dto.allBranches !== undefined || dto.branchIds !== undefined ? { allBranches: true, branchIds: [] } : null;
    }
    if (dto.allBranches === undefined && dto.branchIds === undefined) return null;
    if (actor.userTypeId !== UserType.SystemAdmin) {
      throw new ForbiddenException('Only a System Admin can change branch access');
    }
    const allBranches = dto.allBranches ?? currentAll;
    const branchIds = allBranches ? [] : dto.branchIds ?? [];
    if (!allBranches) {
      if (branchIds.length === 0) throw new BadRequestException('Choose at least one branch, or allow all branches');
      const found = await this.prisma.branch.count({ where: { id: { in: branchIds }, isActive: true } });
      if (found !== branchIds.length) throw new BadRequestException('One or more branches do not exist or are inactive');
    }
    return { allBranches, branchIds };
  }

  private async assertUserTypeExists(userTypeId: number) {
    const exists = await this.prisma.userType.findUnique({ where: { id: userTypeId } });
    if (!exists) throw new BadRequestException('Unknown user type');
  }

  private async assertAnotherActiveAdminExists(excludeUserId: number) {
    const others = await this.prisma.user.count({
      where: {
        id: { not: excludeUserId },
        userTypeId: UserType.SystemAdmin,
        isActive: true,
      },
    });
    if (others === 0) {
      throw new ConflictException('At least one active System Administrator is required');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }
}
