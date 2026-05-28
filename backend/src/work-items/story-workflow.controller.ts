import {
  Controller, Post, Get, Put, Body, Param,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UpsertReleaseNoteDto } from './dto/release-note.dto';

@Controller('projects/:projectId/items/:itemId')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class StoryWorkflowController {
  constructor(private readonly svc: WorkItemsService) {}

  @Post('approve')
  @Roles('admin', 'project_manager')
  @ResponseCode('STORY_APPROVED')
  approve(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.approveStory(projectId, itemId, user.userId);
  }

  @Post('reopen')
  @Roles('admin', 'project_manager')
  @ResponseCode('STORY_REOPENED')
  reopen(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.reopenStory(projectId, itemId, user.userId);
  }

  @Get('release-notes')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('RELEASE_NOTE_FETCHED')
  getReleaseNote(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.svc.getReleaseNote(projectId, itemId);
  }

  @Put('release-notes')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('RELEASE_NOTE_SAVED')
  upsertReleaseNote(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpsertReleaseNoteDto,
  ) {
    return this.svc.upsertReleaseNote(projectId, itemId, dto);
  }
}
