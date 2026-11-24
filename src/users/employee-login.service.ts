import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { EmailService } from '../common/services/email.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserType } from '../common/constants/user-types';
import { UsersService } from './users.service';

/** System Access "Role" values (Access Role parameter) to user types. */
const ACCESS_ROLE_TYPE: Record<string, number> = {
  Executive: UserType.Executive,
  Manager: UserType.Manager,
  SystemAdmin: UserType.SystemAdmin,
  HRAdmin: UserType.HRAdmin,
};

/** "a***@example.com" — enough to recognise the address, not to copy it. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
}

/**
 * Login for an employee, from the System Access tab: create the account with a temporary password,
 * and email the login details. The temporary password must be changed at first sign-in.
 */
@Injectable()
export class EmployeeLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private async employeeWithLogin(employeeId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { profile: { include: { user: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  /** The employee's email: personal email, then official email (Personal details > Contact), then the profile email. */
  private async contactEmail(employeeId: number, profileEmail: string | null): Promise<string | undefined> {
    const row = await this.prisma.employeeProfileSection.findUnique({
      where: { employeeId_sectionKey: { employeeId, sectionKey: 'personal' } },
    });
    const data = (row?.data ?? {}) as Record<string, unknown>;
    const candidates = [data.personalEmail, data.officialEmail, profileEmail];
    const found = candidates.find((v): v is string => typeof v === 'string' && v.trim() !== '');
    return found?.trim().toLowerCase();
  }

  /** Creates the login from System Access (username, role). Returns the temporary password once. */
  async createLogin(employeeId: number, actor: CurrentUserPayload, ip?: string) {
    const employee = await this.employeeWithLogin(employeeId);
    if (employee.profile.user) {
      return { created: false, username: employee.profile.user.username };
    }

    const access = await this.prisma.employeeProfileSection.findUnique({
      where: { employeeId_sectionKey: { employeeId, sectionKey: 'access' } },
    });
    const data = (access?.data ?? {}) as Record<string, unknown>;
    if (data.loginEnabled !== 'Yes') throw new ConflictException('Turn on Login enabled in System Access first');
    const userTypeId = typeof data.accessRole === 'string' ? ACCESS_ROLE_TYPE[data.accessRole] : undefined;
    if (!userTypeId) throw new BadRequestException('Choose the Role in System Access first');

    const username = typeof data.username === 'string' && data.username.trim() ? data.username.trim().toLowerCase() : employee.employeeCode.toLowerCase();
    const email = await this.contactEmail(employeeId, employee.profile.email);
    const created = (await this.users.create({ username, userTypeId, profileId: employee.profileId, email }, actor, ip)) as { temporaryPassword?: string };
    return { created: true, username, userTypeId, temporaryPassword: created.temporaryPassword ?? null };
  }

  /** Sets a new temporary password and emails the login details to the employee's email address. */
  async sendLoginDetails(employeeId: number, actor: CurrentUserPayload, ip?: string) {
    if (!this.email.status().configured) {
      throw new BadRequestException('Email is not set up on the server (SMTP settings). Ask the system administrator to add them, then try again.');
    }
    const employee = await this.employeeWithLogin(employeeId);
    const user = employee.profile.user;
    if (!user) throw new NotFoundException('This employee has no login yet. Create the login first.');
    const address = await this.contactEmail(employeeId, employee.profile.email);
    if (!address) throw new BadRequestException("Add the employee's email in Personal details > Contact first.");

    const { temporaryPassword } = await this.users.resetPassword(user.id, undefined, actor, ip);
    const loginUrl = `${this.config.get<string>('app.frontendBaseUrl', 'http://localhost:3001')}/login`;
    const name = employee.profile.name || '';
    await this.email.send({
      to: address,
      subject: 'Your HRMS login details',
      text: `Hi ${name},\n\nYour HRMS login is ready.\n\nUsername: ${user.username}\nTemporary password: ${temporaryPassword}\nSign in: ${loginUrl}\n\nYou will be asked to choose a new password when you sign in. Please keep these details private.`,
      html: `<p>Hi ${name},</p><p>Your HRMS login is ready.</p><p>Username: <b>${user.username}</b><br/>Temporary password: <b>${temporaryPassword}</b></p><p>Sign in: <a href="${loginUrl}">${loginUrl}</a></p><p>You will be asked to choose a new password when you sign in. Please keep these details private.</p>`,
    });
    await this.audit.log({ actorProfileId: actor.profileId, action: 'LOGIN_DETAILS_SENT', entityType: 'User', entityId: String(user.id), ipAddress: ip });
    return { sentTo: maskEmail(address) };
  }
}
