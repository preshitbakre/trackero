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

  // NB: `GET projects/:projectId/epics` moved to EpicsController (Epics rebuild
  // 2026-05-28) — it now returns the enriched epic shape. Removed here to avoid
  // a duplicate route registration.

  @Get('stories/stats')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('STORY_STATS')
  async storyStats(
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.workItemsService.getStoryStats(projectId);
  }

  @Get('stories')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('STORIES_LISTED')
  async listStories(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('epicId', new ParseIntPipe({ optional: true })) epicId?: number,
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
