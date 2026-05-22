import {
  Controller, Get, Param, Query,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class HierarchyViewsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Get('epics')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('STORIES_LISTED')
  async listEpics(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.workItemsService.listEpics(projectId, { page, limit, status });
  }

  @Get('stories')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('STORIES_LISTED')
  async listStories(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('epicId') epicId?: number,
  ) {
    return this.workItemsService.listStories(projectId, { page, limit, epicId });
  }

  @Get('backlog')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('BACKLOG_FETCHED')
  async getBacklog(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.workItemsService.getBacklog(projectId);
  }
}
