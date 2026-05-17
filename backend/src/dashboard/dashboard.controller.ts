import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ResponseCode('DASHBOARD_FETCHED')
  async getDashboard(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getDashboard(user.userId, user.role);
  }
}
