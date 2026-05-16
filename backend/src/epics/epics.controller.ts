import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { EpicsService } from './epics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';

@Controller('projects/:projectId/epics')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class EpicsController {
  constructor(private readonly epicsService: EpicsService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('EPIC_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateEpicDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.epicsService.create(projectId, dto, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPICS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.epicsService.listEpics(projectId, page || 1, limit || 20);
  }

  @Put('reorder')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPICS_REORDERED')
  async reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { reorders: { epicId: number; sortOrder: string }[] },
  ) {
    await this.epicsService.reorderEpics(projectId, body.reorders);
    return null;
  }

  @Get(':epicId')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('EPIC_FETCHED')
  async findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
  ) {
    return this.epicsService.findOne(projectId, epicId);
  }

  @Put(':epicId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('EPIC_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
    @Body() dto: UpdateEpicDto,
  ) {
    return this.epicsService.update(projectId, epicId, dto);
  }

  @Delete(':epicId')
  @Roles('admin', 'project_manager')
  @ResponseCode('EPIC_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('epicId', ParseIntPipe) epicId: number,
  ) {
    return this.epicsService.remove(projectId, epicId);
  }
}
