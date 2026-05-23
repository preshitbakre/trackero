import {
  Controller, Get, Put, Body, Param, Query,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { BoardService } from './board.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
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
    @Query('sprintId', new ParseIntPipe({ optional: true })) sprintId?: number,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
    @Query('epicId', new ParseIntPipe({ optional: true })) epicId?: number,
  ) {
    const assigneeIds = assigneeId
      ? assigneeId.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined;
    return this.boardService.getBoard(projectId, { sprintId, assigneeIds, priority, epicId });
  }

  @Put('move')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('BOARD_CARD_MOVED')
  async moveCard(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: BoardMoveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.boardService.moveCard(projectId, dto.itemId, dto.statusId, dto.sortOrder, user.userId);
  }
}
