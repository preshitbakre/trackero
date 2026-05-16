import {
  Controller, Post, Get, Put, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { RetrospectivesService } from './retrospectives.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class RetrospectivesController {
  constructor(private readonly retroService: RetrospectivesService) {}

  @Post('sprints/:sprintId/retro')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('RETRO_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retroService.create(projectId, sprintId, user.userId);
  }

  @Get('sprints/:sprintId/retro')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('RETRO_FETCHED')
  async findBySprintId(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('sprintId', ParseIntPipe) sprintId: number,
  ) {
    return this.retroService.findBySprintId(projectId, sprintId);
  }

  @Post('retro/:retroId/cards')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('RETRO_CARD_CREATED')
  async addCard(
    @Param('retroId', ParseIntPipe) retroId: number,
    @Body() body: { column: string; content: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retroService.addCard(retroId, body.column, body.content, user.userId);
  }

  @Put('retro/:retroId/cards/:cardId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('RETRO_CARD_UPDATED')
  async updateCard(
    @Param('retroId', ParseIntPipe) retroId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() body: { content: string },
  ) {
    return this.retroService.updateCard(retroId, cardId, body.content);
  }

  @Delete('retro/:retroId/cards/:cardId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('RETRO_CARD_DELETED')
  async deleteCard(
    @Param('retroId', ParseIntPipe) retroId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    await this.retroService.deleteCard(retroId, cardId);
    return null;
  }

  @Post('retro/:retroId/cards/:cardId/vote')
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('RETRO_CARD_VOTED')
  async vote(
    @Param('retroId', ParseIntPipe) retroId: number,
    @Param('cardId', ParseIntPipe) cardId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.retroService.toggleVote(retroId, cardId, user.userId);
  }
}
