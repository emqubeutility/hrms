import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OvertimeConfiguration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { UserType } from '../common/constants/user-types';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { overtimeProblems } from './overtime-rules';
import { CreateOvertimeConfigurationDto, UpdateOvertimeConfigurationDto } from './dto/overtime.dto';

const MANAGE_ROLES = [UserType.SystemAdmin, UserType.HRAdmin];

export interface OvertimeView {
  id: number;
  name: string;
  type: string;
  fixedAmount: number | null;
  weekdayMultiplier: number | null;
  weekendMultiplier: number | null;
  isActive: boolean;
}

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

function view(row: OvertimeConfiguration): OvertimeView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    fixedAmount: num(row.fixedAmount),
    weekdayMultiplier: num(row.weekdayMultiplier),
    weekendMultiplier: num(row.weekendMultiplier),
    isActive: row.isActive,
  };
}

@Injectable()
export class OvertimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertCanManage(user: CurrentUserPayload) {
    if (!MANAGE_ROLES.includes(user.userTypeId)) throw new ForbiddenException('Only HR or System Admin can manage overtime configurations');
  }

  async list(): Promise<OvertimeView[]> {
    const rows = await this.prisma.overtimeConfiguration.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map(view);
  }

  async create(dto: CreateOvertimeConfigurationDto, user: CurrentUserPayload, ip: string): Promise<OvertimeView> {
    this.assertCanManage(user);
    const name = dto.name.trim();
    const problems = overtimeProblems({
      type: dto.type,
      fixedAmount: dto.fixedAmount ?? null,
      weekdayMultiplier: dto.weekdayMultiplier ?? null,
      weekendMultiplier: dto.weekendMultiplier ?? null,
    });
    if (problems.length) throw new BadRequestException({ message: 'Validation failed', errors: problems });
    if (await this.prisma.overtimeConfiguration.findUnique({ where: { name } })) throw new ConflictException(`An overtime configuration named "${name}" already exists`);

    const created = await this.prisma.overtimeConfiguration.create({
      data: {
        name,
        type: dto.type,
        fixedAmount: dto.fixedAmount ?? null,
        weekdayMultiplier: dto.weekdayMultiplier ?? null,
        weekendMultiplier: dto.weekendMultiplier ?? null,
        createdByProfileId: user.profileId,
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'overtime_configuration.created', entityType: 'overtime_configuration', entityId: String(created.id), ipAddress: ip, metadata: { name, type: dto.type } });
    return view(created);
  }

  async update(id: number, dto: UpdateOvertimeConfigurationDto, user: CurrentUserPayload, ip: string): Promise<OvertimeView> {
    this.assertCanManage(user);
    const existing = await this.prisma.overtimeConfiguration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Overtime configuration not found');

    // Validate the whole rule as it will be after the change (the type may change, which clears the wrong fields).
    const merged = {
      type: dto.type ?? existing.type,
      fixedAmount: dto.fixedAmount !== undefined ? dto.fixedAmount : num(existing.fixedAmount),
      weekdayMultiplier: dto.weekdayMultiplier !== undefined ? dto.weekdayMultiplier : num(existing.weekdayMultiplier),
      weekendMultiplier: dto.weekendMultiplier !== undefined ? dto.weekendMultiplier : num(existing.weekendMultiplier),
    };
    const problems = overtimeProblems(merged);
    if (problems.length) throw new BadRequestException({ message: 'Validation failed', errors: problems });

    const name = dto.name?.trim();
    if (name && name !== existing.name && (await this.prisma.overtimeConfiguration.findUnique({ where: { name } }))) {
      throw new ConflictException(`An overtime configuration named "${name}" already exists`);
    }

    const updated = await this.prisma.overtimeConfiguration.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        type: merged.type,
        fixedAmount: merged.fixedAmount,
        weekdayMultiplier: merged.weekdayMultiplier,
        weekendMultiplier: merged.weekendMultiplier,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorProfileId: user.profileId, action: 'overtime_configuration.updated', entityType: 'overtime_configuration', entityId: String(id), ipAddress: ip, metadata: { changed: Object.keys(dto) } });
    return view(updated);
  }
}
