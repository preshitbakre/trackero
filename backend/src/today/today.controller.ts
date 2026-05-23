import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { TodayService } from './today.service';

@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  @ResponseCode('TODAY_FETCHED')
  async getToday(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectIdRaw?: string,
    @Query('timezone') timezone?: string,
  ) {
    const projectId = projectIdRaw ? parseInt(projectIdRaw, 10) : undefined;
    return this.today.getToday(user.userId, {
      projectId: Number.isFinite(projectId) ? projectId : undefined,
      timezone,
    });
  }
}
