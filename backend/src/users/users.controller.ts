import {
  Controller, Get, Put, Post, Param, Body, Query,
  UseGuards, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ChangeRoleDto } from './dto/change-role.dto';
import { SetUserPasswordDto } from './dto/set-user-password.dto';
import { SendInviteEmailDto } from './dto/send-invite-email.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ResponseCode('USERS_LISTED')
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('exclude_project', new ParseIntPipe({ optional: true })) excludeProject?: number,
    @Query('search') search?: string,
  ) {
    if (excludeProject) {
      return this.usersService.searchUsersExcludingProject(excludeProject, search, limit || 10);
    }
    return this.usersService.listUsers(page || 1, limit || 20);
  }

  @Put(':id/role')
  @Roles('admin')
  @ResponseCode('USER_ROLE_UPDATED')
  async changeRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.changeRole(id, dto.role, user.userId);
  }

  @Put(':id/deactivate')
  @Roles('admin')
  @ResponseCode('USER_DEACTIVATED')
  async deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.usersService.deactivate(id, user.userId);
  }

  @Put(':id/reactivate')
  @Roles('admin')
  @ResponseCode('USER_REACTIVATED')
  async reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.reactivate(id);
  }

  @Get('invitations')
  @Roles('admin')
  @ResponseCode('USERS_LISTED')
  async listInvitations() {
    return this.usersService.listInvitations();
  }

  @Post('invite')
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('INVITATION_CREATED')
  async invite(
    @Body() body: { email: string; role: string; projectId?: number; sendEmail?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.invite(
      body.email,
      body.role,
      user.userId,
      body.projectId,
      body.sendEmail,
    );
  }

  @Post('invitations/send-email')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('INVITATION_EMAIL_SENT')
  async sendInviteEmail(@Body() dto: SendInviteEmailDto) {
    return this.usersService.sendInviteEmail(dto.token);
  }

  @Post(':id/set-password')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('USER_PASSWORD_SET')
  async setUserPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserPasswordDto,
  ) {
    return this.usersService.setUserPassword(id, dto.newPassword);
  }

  // Phase 8 — bulk invite. Accepts a newline-separated string OR an array
  // of emails; hard cap of 50 per request so a paste of "all" doesn't
  // hammer the SMTP relay (or in dev: log spam). Per-email failures are
  // returned in the response so partial success is visible without
  // burning the entire batch.
  @Post('invite/bulk')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('INVITATION_SENT')
  async inviteBulk(
    @Body() body: { emails: string | string[]; role: string; projectId?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    const raw = Array.isArray(body.emails)
      ? body.emails
      : (body.emails ?? '').split(/[\s,;]+/);
    const emails = Array.from(
      new Set(raw.map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))),
    );
    if (emails.length === 0) {
      return { invited: [], failed: [] };
    }
    if (emails.length > 50) {
      return { invited: [], failed: emails.map((e) => ({ email: e, reason: 'batch-cap-exceeded' })) };
    }

    const invited: string[] = [];
    const failed: Array<{ email: string; reason: string }> = [];
    for (const email of emails) {
      try {
        await this.usersService.invite(email, body.role, user.userId, body.projectId);
        invited.push(email);
      } catch (err: any) {
        failed.push({ email, reason: err?.code ?? err?.message ?? 'unknown' });
      }
    }
    return { invited, failed };
  }
}
