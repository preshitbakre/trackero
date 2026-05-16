import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe, Req,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

@Controller('projects/:projectId/tasks')
@UseGuards(JwtAuthGuard, RolesGuard, ProjectAccessGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('TASK_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.create(projectId, dto, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('TASKS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: number,
    @Query('sprintId') sprintId?: number,
    @Query('epicId') epicId?: number,
    @Query('type') type?: string,
  ) {
    return this.tasksService.listTasks(projectId, {
      page, limit, search, status, priority, assigneeId, sprintId, epicId, type,
    });
  }

  @Put('reorder')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASKS_REORDERED')
  async reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { reorders: { taskId: number; sortOrder: string }[] },
  ) {
    await this.tasksService.reorderTasks(projectId, body.reorders);
    return null;
  }

  @Get(':taskId')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('TASK_FETCHED')
  async findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.getTaskDetail(projectId, taskId);
  }

  @Put(':taskId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(projectId, taskId, dto);
  }

  @Delete(':taskId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: JwtPayload,
    @Req() req: any,
  ) {
    const projectRole = req.projectRole || user.role;
    return this.tasksService.remove(projectId, taskId, user.userId, projectRole);
  }

  @Put(':taskId/status')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_STATUS_CHANGED')
  async changeStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.tasksService.changeStatus(projectId, taskId, dto.statusId);
  }

  @Put(':taskId/assign')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_ASSIGNED')
  async assign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body: { assigneeId: number | null },
  ) {
    return this.tasksService.assign(projectId, taskId, body.assigneeId);
  }

  @Put(':taskId/move')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_MOVED')
  async moveTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() body: { sprintId?: number | null; epicId?: number | null },
  ) {
    return this.tasksService.moveTask(projectId, taskId, body.sprintId !== undefined ? body.sprintId : undefined, body.epicId !== undefined ? body.epicId : undefined);
  }

  // --- Subtasks ---

  @Post(':taskId/subtasks')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('SUBTASK_CREATED')
  async createSubtask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.createSubtask(projectId, taskId, dto, user.userId);
  }

  // --- Checklist ---

  @Post(':taskId/checklist')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('CHECKLIST_ITEM_CREATED')
  async createChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.tasksService.createChecklistItem(projectId, taskId, dto);
  }

  @Put(':taskId/checklist/:itemId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CHECKLIST_ITEM_UPDATED')
  async updateChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.tasksService.updateChecklistItem(projectId, taskId, itemId, dto);
  }

  @Delete(':taskId/checklist/:itemId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CHECKLIST_ITEM_DELETED')
  async deleteChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    await this.tasksService.deleteChecklistItem(projectId, taskId, itemId);
    return null;
  }

  // --- Dependencies ---

  @Post(':taskId/dependencies')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('DEPENDENCY_CREATED')
  async createDependency(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CreateDependencyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.createDependency(projectId, taskId, dto, user.userId);
  }

  @Delete(':taskId/dependencies/:depId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('DEPENDENCY_DELETED')
  async deleteDependency(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('depId', ParseIntPipe) depId: number,
  ) {
    await this.tasksService.deleteDependency(projectId, taskId, depId);
    return null;
  }
}
