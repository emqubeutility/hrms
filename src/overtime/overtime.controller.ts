import { Body, Controller, Get, Ip, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserType } from '../common/constants/user-types';
import { OvertimeService } from './overtime.service';
import { CreateOvertimeConfigurationDto, UpdateOvertimeConfigurationDto } from './dto/overtime.dto';

/** Attendance setup > Overtime. HR Admin and System Admin only. */
@ApiTags('Overtime configurations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('overtime-configurations')
export class OvertimeController {
  constructor(private readonly service: OvertimeService) {}

  private ok(data: unknown, text: string) {
    return { data, message: { code: 'OK', text } };
  }

  @Get()
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  async list() {
    return this.ok(await this.service.list(), 'Overtime configurations retrieved');
  }

  @Post()
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  async create(@Body() dto: CreateOvertimeConfigurationDto, @CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.ok(await this.service.create(dto, user, ip), 'Overtime configuration created');
  }

  @Patch(':id')
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOvertimeConfigurationDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.ok(await this.service.update(id, dto, user, ip), 'Overtime configuration updated');
  }
}
