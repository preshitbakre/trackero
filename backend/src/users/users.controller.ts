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

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin')
  @ResponseCode('USERS_LISTED')
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
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
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivate(id);
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
  @ResponseCode('INVITATION_SENT')
  async invite(
    @Body() body: { email: string; role: string; projectId?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.invite(body.email, body.role, user.userId, body.projectId);
  }
}
