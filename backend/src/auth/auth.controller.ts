import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AllowPasswordChangePending } from '../common/decorators/allow-password-change-pending.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetNewPasswordDto } from './dto/set-new-password.dto';
import { SetupDto } from './dto/setup.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup-status')
  @Public()
  @ResponseCode('HEALTH_OK')
  async setupStatus() {
    return this.authService.getSetupStatus();
  }

  @Get('preflight')
  @Public()
  @ResponseCode('PREFLIGHT_OK')
  async preflight() {
    return this.authService.getPreflight();
  }

  @Get('invite-info')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @ResponseCode('HEALTH_OK')
  async inviteInfo(@Query('token') token: string) {
    return this.authService.getInviteInfo(token);
  }

  @Post('setup')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('AUTH_SETUP_COMPLETE')
  async setup(@Body() dto: SetupDto) {
    return this.authService.setup(dto);
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('AUTH_REGISTER')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_LOGIN')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_REFRESH')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_LOGOUT')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return null;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  @ResponseCode('AUTH_PROFILE_FETCHED')
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.userId);
  }

  @Post('set-new-password')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_NEW_PASSWORD_SET')
  async setNewPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetNewPasswordDto,
  ) {
    return this.authService.setNewPassword(user.userId, dto.newPassword);
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ResponseCode('AUTH_PROFILE_UPDATED')
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @Put('me/password')
  @UseGuards(JwtAuthGuard)
  @ResponseCode('AUTH_PASSWORD_CHANGED')
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.userId, dto);
    return null;
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_PASSWORD_RESET_SENT')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return null;
  }

  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '5', 10), ttl: parseInt(process.env.AUTH_THROTTLE_TTL || '60000', 10) } })
  @HttpCode(HttpStatus.OK)
  @ResponseCode('AUTH_PASSWORD_RESET')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return null;
  }
}
