import {
  Controller, Get, Put, Body, Param, Query,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { BoardService } from './board.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BoardMoveDto } from './dto/board-move.dto';

@Controller('projects/:projectId/board')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('BOARD_FETCHED')
  async getBoard(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('sprintId') sprintId?: number,
    @Query('assigneeId') assigneeId?: number,
    @Query('priority') priority?: string,
    @Query('epicId') epicId?: number,
  ) {
    return this.boardService.getBoard(projectId, { sprintId, assigneeId, priority, epicId });
  }

  @Put('move')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('BOARD_CARD_MOVED')
  async moveCard(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BoardMoveDto,
  ) {
    return this.boardService.moveCard(projectId, dto.taskId, dto.statusId, dto.sortOrder);
  }
}
