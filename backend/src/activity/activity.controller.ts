import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('activity')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ACTIVITY_LISTED')
  async projectActivity(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.activityService.listProjectActivity(projectId, page || 1, limit || 20);
  }

  @Get('items/:itemId/activity')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ACTIVITY_LISTED')
  async taskActivity(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.activityService.listTaskActivity(projectId, itemId, page || 1, limit || 20);
  }
}
