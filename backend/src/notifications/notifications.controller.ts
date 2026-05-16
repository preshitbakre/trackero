import { Controller, Get, Put, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ResponseCode('NOTIFICATIONS_LISTED')
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('isRead') isRead?: string,
  ) {
    const isReadBool = isRead === 'true' ? true : isRead === 'false' ? false : undefined;
    return this.notificationsService.list(user.userId, page || 1, limit || 20, isReadBool);
  }

  @Get('unread-count')
  @ResponseCode('NOTIFICATION_COUNT')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUnreadCount(user.userId);
  }

  @Put('read-all')
  @ResponseCode('NOTIFICATIONS_ALL_READ')
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.notificationsService.markAllRead(user.userId);
    return null;
  }

  @Put(':id/read')
  @ResponseCode('NOTIFICATION_READ')
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.notificationsService.markRead(user.userId, id);
    return null;
  }
}
