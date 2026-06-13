import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { EpicsService } from './epics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UpdateEpicDto } from './dto/update-epic.dto';

/**
 * Epics surface under `projects/:projectId/epics`. Reads allow all roles;
 * writes require writer roles (admin / project_manager / member).
 */
@Controller('projects/:projectId/epics')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  // ---- Reads ----

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPICS_LISTED')
  async list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: string,
    @Query('state') state?: string,
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ) {
    return this.epicsService.listEpics(projectId, { page, limit, status, state, includeArchived });
  }

  @Get('summary')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPICS_SUMMARY')
  async summary(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.epicsService.getSummary(projectId);
  }

  @Get(':epicId/children')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPIC_CHILDREN')
  async children(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @Query('groupBy') groupBy?: string,
  ) {
    const mode = groupBy === 'sprint' ? 'sprint' : groupBy === 'none' ? 'none' : 'status';
    return this.epicsService.getEpicChildren(projectId, epicId, mode);
  }

  @Get(':epicId/recent')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ACTIVITY_LISTED')
  async recent(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.epicsService.getRecent(projectId, epicId, limit ?? 8);
  }

  @Get(':epicId')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPIC_DETAIL')
  async detail(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
  ) {
    return this.epicsService.getEpicDetail(projectId, epicId);
  }

  // ---- Writes ----

  @Patch(':epicId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @Body() dto: UpdateEpicDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.updateEpic(projectId, epicId, user.userId, dto);
  }

  @Post(':epicId/ship')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_SHIPPED')
  async ship(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.shipEpic(projectId, epicId, user.userId);
  }

  @Post(':epicId/reopen')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_REOPENED')
  async reopen(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.reopenEpic(projectId, epicId, user.userId);
  }

  @Post(':epicId/archive')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_ARCHIVED')
  async archive(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.archiveEpic(projectId, epicId, user.userId);
  }

  @Post(':epicId/unarchive')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_UNARCHIVED')
  async unarchive(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.unarchiveEpic(projectId, epicId, user.userId);
  }

  @Post(':epicId/detach-children')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_CHILDREN_DETACHED')
  async detachChildren(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.detachChildren(projectId, epicId, user.userId);
  }
}
