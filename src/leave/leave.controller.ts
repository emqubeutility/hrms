import { Body, Controller, Delete, Get, Ip, Param, ParseIntPipe, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { UploadedFileLike } from '../common/services/file-storage.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserType } from '../common/constants/user-types';
import { LeaveService } from './leave.service';
import { LeaveConfigService } from './leave-config.service';
import { AccrualDto, AdjustBalanceDto, AdjustGroupDto, LeaveDecisionDto, LeaveRequestDto, LeaveSettingsDto, LeaveTypeDto } from './dto/leave.dto';

const ok = (data: unknown, text: string) => ({ data, message: { code: 'OK', text } });

/** Applying for leave and deciding it. Who may do what is decided in the service. */
@ApiTags('Leave')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leave')
export class LeaveController {
  constructor(
    private readonly service: LeaveService,
    private readonly config: LeaveConfigService,
  ) {}

  // scope=mine (Apply for leave): only types that apply to the caller's own country. Omitted (HR/System Admin
  // screens — Balances, Policies — managing any employee's leave): every active type, unfiltered.
  @Get('types')
  async types(@Query('scope') scope: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    const country = scope === 'mine' ? await this.service.myCountry(u) : undefined;
    const types = await this.config.types(true, country);
    if (scope !== 'mine') return ok(types, 'Leave types retrieved');
    const locked = await this.service.myLockedTypeIds(u);
    return ok(types.filter((t: { id: number }) => !locked.has(t.id)), 'Leave types retrieved');
  }

  @Get('balances')
  async balances(@CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.myBalances(u), 'Balances retrieved');
  }

  @Post('preview')
  async preview(@Body() dto: LeaveRequestDto, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.preview(u, dto), 'Preview calculated');
  }

  @Post('applications')
  async apply(@Body() dto: LeaveRequestDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.service.apply(u, dto, ip), 'Leave applied');
  }

  @Get('applications/me')
  async mine(
    @CurrentUser() u: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('leaveTypeId') leaveTypeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return ok(await this.service.mine(u, { status: status || undefined, leaveTypeId: leaveTypeId ? Number(leaveTypeId) || undefined : undefined, from: from || undefined, to: to || undefined }), 'Applications retrieved');
  }

  @Get('comp-off')
  async compOffList(@Query('scope') scope: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.compOffList(u, scope === 'team' ? 'team' : 'me'), 'Comp off retrieved');
  }

  @Get('applications/team')
  async team(@Query('status') status: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.team(u, status), 'Applications retrieved');
  }

  @Post('applications/:id/attachment')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async attach(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: UploadedFileLike | undefined, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.service.attach(u, id, file, ip), 'Document attached');
  }

  @Get('applications/:id/attachment')
  async attachment(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: CurrentUserPayload, @Res() res: Response) {
    const { stream, name, mimeType } = await this.service.attachment(u, id);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    stream.pipe(res);
  }

  @Put('applications/:id/decision')
  async decide(@Param('id', ParseIntPipe) id: number, @Body() dto: LeaveDecisionDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    await this.service.decide(u, id, dto.approve, dto.note, ip);
    return ok(null, dto.approve ? 'Leave approved' : 'Leave rejected');
  }

  @Put('applications/:id/cancel')
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    await this.service.cancel(u, id, ip);
    return ok(null, 'Leave cancelled');
  }

  @Get('calendar')
  async calendar(@Query('from') from: string, @Query('to') to: string, @Query('scope') scope: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.calendar(u, from, to, scope === 'team' ? 'team' : 'me'), 'Calendar retrieved');
  }

  @Get('ledger')
  async ledger(@Query('employeeId') employeeId: string | undefined, @Query('leaveTypeId') typeId: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.ledgerFor(u, employeeId ? Number(employeeId) : undefined, typeId ? Number(typeId) : undefined), 'Ledger retrieved');
  }

  @Get('balances/:employeeId')
  async balancesOf(@Param('employeeId', ParseIntPipe) employeeId: number, @CurrentUser() u: CurrentUserPayload) {
    await this.service.ledgerFor(u, employeeId); // same access check as the ledger
    return ok(await this.service.balances(employeeId), 'Balances retrieved');
  }

  @Get('adjust-group/count')
  async adjustGroupCount(@Query('scope') scope: string, @Query('branchId') branchId: string | undefined, @Query('countryCode') countryCode: string | undefined, @Query('siteId') siteId: string | undefined, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.groupCount(u, scope, branchId ? Number(branchId) || undefined : undefined, countryCode, siteId ? Number(siteId) || undefined : undefined), 'Counted');
  }

  @Post('adjust-group')
  async adjustGroup(@Body() dto: AdjustGroupDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.service.adjustGroup(u, dto, ip), 'Balances adjusted');
  }

  @Post('adjust')
  async adjust(@Body() dto: AdjustBalanceDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.service.adjust(u, dto, ip), 'Balance adjusted');
  }

  @Post('accrual')
  @UseGuards(RolesGuard)
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  async accrual(@Body() dto: AccrualDto, @CurrentUser() u: CurrentUserPayload) {
    return ok(await this.service.runAccrual(u, dto.asOf), 'Accrual run');
  }

  @Post('comp-off/sync')
  @UseGuards(RolesGuard)
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  async compOff() {
    return ok({ granted: await this.service.syncCompOff() }, 'Comp off checked');
  }
}

/** System Settings > Leave configuration. System Admin only. */
@ApiTags('Leave configuration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.SystemAdmin)
@Controller('leave-config')
export class LeaveConfigController {
  constructor(private readonly config: LeaveConfigService) {}

  @Get()
  async overview() {
    return ok({ types: await this.config.types(false), settings: await this.config.settings() }, 'Leave configuration retrieved');
  }
  @Post('types')
  async create(@Body() dto: LeaveTypeDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.config.create(dto, u, ip), 'Leave type created');
  }
  @Put('types/:id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: LeaveTypeDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.config.update(id, dto, u, ip), 'Leave type saved');
  }
  @Delete('types/:id')
  async removeType(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    await this.config.remove(id, u, ip);
    return ok(null, 'Leave type deleted');
  }
  @Put('settings')
  async settings(@Body() dto: LeaveSettingsDto, @CurrentUser() u: CurrentUserPayload, @Ip() ip: string) {
    return ok(await this.config.saveSettings(dto, u, ip), 'Leave settings saved');
  }
}
