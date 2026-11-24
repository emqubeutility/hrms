import { Controller, Header, Ip, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmployeeBranchGuard } from '../common/guards/branch-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserType } from '../common/constants/user-types';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { EmployeeLoginService } from './employee-login.service';

/** Employee login from the System Access tab. HR Administrator and System Administrator only. */
@ApiTags('Employee login')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeeLoginController {
  constructor(private readonly service: EmployeeLoginService) {}

  @Post(':id/login')
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  @UseGuards(EmployeeBranchGuard)
  @Header('Cache-Control', 'no-store')
  async createLogin(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return { data: await this.service.createLogin(id, user, ip), message: { code: 'OK', text: 'Login checked' } };
  }

  @Post(':id/login/send')
  @Roles(UserType.SystemAdmin, UserType.HRAdmin)
  @UseGuards(EmployeeBranchGuard)
  @Header('Cache-Control', 'no-store')
  async sendLoginDetails(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return { data: await this.service.sendLoginDetails(id, user, ip), message: { code: 'OK', text: 'Login details sent' } };
  }
}
