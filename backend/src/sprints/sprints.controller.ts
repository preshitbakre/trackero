import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { SprintsService } from './sprints.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';

@Controller('projects/:projectId/sprints')
@UseGuards(JwtAuthGuard, RolesGuard, ProjectAccessGuard)
export class SprintsController {
  constructor(private readonly sprintsService: SprintsService) {}

  @Post()
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('SPRINT_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sprintsService.create(projectId, dto, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('SPRINTS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.sprintsService.listSprints(projectId, page || 1, limit || 20);
  }

  @Get(':sprintId')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('SPRINT_FETCHED')
  async findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.findOne(projectId, sprintId);
  }

  @Put(':sprintId')
  @Roles('admin', 'project_manager')
  @ResponseCode('SPRINT_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @Body() dto: UpdateSprintDto,
  ) {
    return this.sprintsService.update(projectId, sprintId, dto);
  }

  @Delete(':sprintId')
  @Roles('admin', 'project_manager')
  @ResponseCode('SPRINT_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.remove(projectId, sprintId);
  }

  @Post(':sprintId/start')
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('SPRINT_STARTED')
  async start(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.start(projectId, sprintId);
  }

  @Post(':sprintId/complete')
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('SPRINT_COMPLETED')
  async complete(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.complete(projectId, sprintId);
  }

  @Post(':sprintId/cancel')
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('SPRINT_CANCELLED')
  async cancel(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.cancel(projectId, sprintId);
  }

  @Get(':sprintId/burndown')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('SPRINT_BURNDOWN')
  async burndown(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.sprintsService.getBurndown(projectId, sprintId);
  }
}
