import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { TaskTypesService } from './task-types.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTaskTypeDto } from './dto/create-task-type.dto';
import { UpdateTaskTypeDto } from './dto/update-task-type.dto';

@Controller('projects/:projectId/task-types')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class TaskTypesController {
  constructor(private readonly taskTypesService: TaskTypesService) {}

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('TASK_TYPES_LISTED')
  async list(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.taskTypesService.list(projectId);
  }

  @Post()
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('TASK_TYPE_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTaskTypeDto,
  ) {
    return this.taskTypesService.create(projectId, dto);
  }

  @Put(':typeId')
  @Roles('admin', 'project_manager')
  @ResponseCode('TASK_TYPE_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.taskTypesService.update(projectId, typeId, dto);
  }

  @Delete(':typeId')
  @Roles('admin', 'project_manager')
  @ResponseCode('TASK_TYPE_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('typeId', ParseIntPipe) typeId: number,
  ) {
    return this.taskTypesService.remove(projectId, typeId);
  }
}
