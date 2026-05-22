import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectRole } from '../common/decorators/project-role.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller('projects/:projectId/items/:itemId/comments')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('COMMENT_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.commentsService.create(projectId, itemId, dto.body, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('COMMENTS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.commentsService.listComments(projectId, itemId, page || 1, limit || 20);
  }

  @Put(':commentId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('COMMENT_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.commentsService.update(projectId, itemId, commentId, dto.body, user.userId);
  }

  @Delete(':commentId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('COMMENT_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: JwtPayload,
    @ProjectRole() projectRole: string | undefined,
  ) {
    // Authorize by PROJECT role, not the global role. Global admins bypass the
    // project-membership lookup so `projectRole` is unset for them — treat them
    // as 'admin'. Everyone else is authorized by their project_members role.
    const effectiveRole = user.role === 'admin' ? 'admin' : projectRole;
    await this.commentsService.remove(projectId, itemId, commentId, user.userId, effectiveRole);
    return null;
  }
}
