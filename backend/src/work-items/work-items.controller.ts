import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import { BulkStatusDto, BulkAssignDto, BulkSprintDto, BulkDeleteDto } from './dto/bulk-operations.dto';

@Controller('projects/:projectId/items')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class WorkItemsController {
  constructor(
    private readonly workItemsService: WorkItemsService,
    private readonly dataSource: DataSource,
  ) {}

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

  @Put('bulk-status')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_UPDATED')
  async bulkStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BulkStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.bulkUpdateStatus(projectId, dto.itemIds, dto.statusId, user.userId);
  }

  @Put('bulk-assign')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_UPDATED')
  async bulkAssign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BulkAssignDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.bulkAssign(projectId, dto.itemIds, dto.assigneeId ?? null, user.userId);
  }

  @Put('bulk-sprint')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_UPDATED')
  async bulkSprint(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BulkSprintDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.bulkAssignSprint(projectId, dto.itemIds, dto.sprintId ?? null, user.userId);
  }

  @Post('bulk-delete')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ITEM_DELETED')
  async bulkDelete(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BulkDeleteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const hard = dto.hard === true && user.role === 'admin';
    return this.workItemsService.bulkDelete(projectId, dto.itemIds, user.userId, hard);
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
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
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
    @Query('hard') hard?: string,
  ) {
    // Phase 10 — soft delete by default; `?hard=true` (admin-only)
    // bypasses the grace window for the rare case where an item must
    // disappear immediately (PII, accidental sensitive content, etc.).
    const wantsHard = hard === 'true' || hard === '1';
    if (wantsHard && user.role !== 'admin') {
      // Silently downgrade to soft for non-admins so the API stays
      // forgiving — they get a soft delete + a 200, and audit logs
      // record the request as soft.
    }
    return this.workItemsService.remove(projectId, id, user.userId, wantsHard && user.role === 'admin');
  }

  @Post(':id/restore')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('ITEM_RESTORED')
  async restore(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workItemsService.restore(projectId, id, user.userId);
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

  // Phase 7 — watchers. Lightweight raw-SQL because the table is a pure
  // join with no business rules beyond visibility (already enforced by
  // ProjectAccessGuard on the controller).
  @Post(':id/watchers/me')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('WATCHER_ADDED')
  async watch(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.dataSource.query(
      `INSERT INTO work_item_watchers (work_item_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, user.userId],
    );
    const [count] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM work_item_watchers WHERE work_item_id = $1`,
      [id],
    );
    return { watching: true, watcherCount: count.count };
  }

  @Delete(':id/watchers/me')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('WATCHER_REMOVED')
  async unwatch(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.dataSource.query(
      `DELETE FROM work_item_watchers WHERE work_item_id = $1 AND user_id = $2`,
      [id, user.userId],
    );
    const [count] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM work_item_watchers WHERE work_item_id = $1`,
      [id],
    );
    return { watching: false, watcherCount: count.count };
  }

  @Get(':id/watchers')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('WATCHERS_LISTED')
  async listWatchers(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const rows = await this.dataSource.query(
      `SELECT u.id, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
              split_part(u.email, '@', 1) AS "handle"
       FROM work_item_watchers w
       JOIN users u ON u.id = w.user_id
       WHERE w.work_item_id = $1
       ORDER BY w.created_at DESC
       LIMIT 50`,
      [id],
    );
    const [count] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM work_item_watchers WHERE work_item_id = $1`,
      [id],
    );
    const byMe = rows.some((r: any) => r.id === user.userId);
    return { watchers: rows, watcherCount: count.count, byMe };
  }
}
