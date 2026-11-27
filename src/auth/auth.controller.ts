import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AllowPasswordChangeRequired } from '../common/decorators/allow-password-change-required.decorator';
import { LoginDto } from './dto/login.dto';
import { DevLoginDto } from './dto/dev-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const result = await this.authService.login(dto, ip, userAgent);
    return { data: result, message: { code: 'OK', text: 'Login successful' } };
  }

  /** Development only: the users offered on the login page. 404 in production. */
  @Get('dev-logins')
  async devLogins() {
    return { data: await this.authService.devLogins(), message: { code: 'OK', text: 'Development logins' } };
  }

  /** Development only: sign in as a "Dev login" user without a password. 404 in production. */
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  async devLogin(@Body() dto: DevLoginDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const result = await this.authService.devLogin(dto.username, ip, userAgent);
    return { data: result, message: { code: 'OK', text: 'Login successful' } };
  }

  /** Refresh token is sent in the X-Refresh-Token header (matches the frontend client). */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('x-refresh-token') refreshToken: string, @Ip() ip: string) {
    await this.authService.logout(refreshToken, ip);
    return { data: null, message: { code: 'OK', text: 'Logged out successfully' } };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Headers('user-agent') userAgent: string) {
    const tokens = await this.authService.refresh(dto.refreshToken, ip, userAgent);
    return { data: tokens, message: { code: 'OK', text: 'Token refreshed' } };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    await this.authService.forgotPassword(dto.email, ip);
    return {
      data: null,
      message: { code: 'OK', text: 'If the email exists, a reset link was sent' },
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    await this.authService.resetPassword(dto.token, dto.newPassword, ip);
    return { data: null, message: { code: 'OK', text: 'Password reset successfully' } };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
  ) {
    await this.authService.changePassword(
      user.userId,
      BigInt(user.sessionId),
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
    return { data: null, message: { code: 'OK', text: 'Password changed successfully' } };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  async me(@CurrentUser() user: CurrentUserPayload) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        username: true,
        userTypeId: true,
        profileId: true,
        mustChangePassword: true,
        userType: { select: { name: true } },
        profile: { select: { name: true, lastName: true, email: true, employee: { select: { id: true } } } },
      },
    });
    return { data: account, message: { code: 'OK', text: 'Current user retrieved' } };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  async listSessions(@CurrentUser() user: CurrentUserPayload) {
    const items = await this.sessions.listActive(user.userId, BigInt(user.sessionId));
    return { data: items, message: { code: 'OK', text: 'Sessions retrieved' } };
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  async revokeOtherSessions(@CurrentUser() user: CurrentUserPayload) {
    const count = await this.sessions.revokeAll(user.userId, 'user_revoked_others', BigInt(user.sessionId));
    return { data: { revoked: count }, message: { code: 'OK', text: 'Other sessions signed out' } };
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeRequired()
  async revokeSession(@Param('sessionId') sessionId: string, @CurrentUser() user: CurrentUserPayload) {
    if (!/^\d+$/.test(sessionId)) {
      throw new BadRequestException('Invalid session id');
    }
    const revoked = await this.sessions.revokeOne(user.userId, BigInt(sessionId), 'user_revoked');
    if (!revoked) {
      throw new NotFoundException('Session not found');
    }
    return { data: { revoked: true }, message: { code: 'OK', text: 'Session signed out' } };
  }
}
