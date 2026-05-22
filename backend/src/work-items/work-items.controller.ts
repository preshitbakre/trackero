import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { MoveWorkItemDto } from './dto/move-work-item.dto';
import { QueryWorkItemsDto } from './dto/query-work-items.dto';
import { AssignSprintDto } from './dto/assign-sprint.dto';
import { AssignWorkItemDto } from './dto/assign-work-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';

@Controller('projects/:projectId/items')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('ITEM_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateWorkItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.create(projectId, dto, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ITEMS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query() query: QueryWorkItemsDto,
  ) {
    return this.workItemsService.findAll(projectId, query);
  }

  @Put('reorder')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEMS_LISTED')
  async reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: ReorderItemsDto,
  ) {
    await this.workItemsService.reorderItems(projectId, dto.reorders);
    return null;
  }

  @Get(':id')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ITEM_FETCHED')
  async findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workItemsService.findOne(projectId, id);
  }

  @Get(':id/children')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ITEMS_LISTED')
  async findChildren(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.workItemsService.findChildren(projectId, id, page, limit);
  }

  @Put(':id')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.update(projectId, id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.remove(projectId, id, user.userId);
  }

  @Put(':id/move')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_MOVED')
  async move(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveWorkItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.move(projectId, id, dto, user.userId);
  }

  @Put(':id/sprint')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_SPRINT_ASSIGNED')
  async assignSprint(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.assignSprint(projectId, id, dto, user.userId);
  }

  @Put(':id/assign')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('TASK_ASSIGNED')
  async assign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignWorkItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.assign(projectId, id, dto, user.userId);
  }

  // --- Checklist ---

  @Post(':id/checklist')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('CHECKLIST_ITEM_CREATED')
  async createChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title: string },
  ) {
    return this.workItemsService.createChecklistItem(projectId, id, body.title);
  }

  @Put(':id/checklist/:itemId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CHECKLIST_ITEM_UPDATED')
  async updateChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: { title?: string; isCompleted?: boolean },
  ) {
    return this.workItemsService.updateChecklistItem(projectId, id, itemId, body);
  }

  @Delete(':id/checklist/:itemId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CHECKLIST_ITEM_DELETED')
  async deleteChecklistItem(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    await this.workItemsService.deleteChecklistItem(projectId, id, itemId);
    return null;
  }

  // --- Associations ---

  @Post(':id/associations')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('ASSOCIATION_CREATED')
  async createAssociation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { linkedItemId: number; linkType: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.createAssociation(projectId, id, body.linkedItemId, body.linkType, user.userId);
  }

  @Delete(':id/associations/:assocId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ASSOCIATION_DELETED')
  async deleteAssociation(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('assocId', ParseIntPipe) assocId: number,
  ) {
    await this.workItemsService.deleteAssociation(projectId, id, assocId);
    return null;
  }

  @Get(':id/associations')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ASSOCIATIONS_LISTED')
  async listAssociations(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workItemsService.listAssociations(projectId, id);
  }
}
