import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { DirectoryService } from './directory.service';

@Controller()
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get('directory/projects')
  @ResponseCode('DIRECTORY_FETCHED')
  async listDirectory(
    @CurrentUser() user: JwtPayload,
    @Query('filter') filter?: string,
    @Query('search') search?: string,
    @Query('mineOnly') mineOnly?: string,
  ) {
    return this.directory.list(user.userId, user.role ?? 'member', {
      filter,
      search,
      mineOnly: mineOnly === 'true' || mineOnly === '1',
    });
  }

  @Get('me/pinned-projects')
  @ResponseCode('PINNED_LISTED')
  async listPinned(@CurrentUser() user: JwtPayload) {
    return { projectIds: await this.directory.listPinned(user.userId) };
  }

  @Post('me/pinned-projects')
  @HttpCode(200)
  @ResponseCode('PINNED_UPSERTED')
  async pin(
    @CurrentUser() user: JwtPayload,
    @Body() body: { projectId: number },
  ) {
    await this.directory.pin(user.userId, body.projectId);
    return { ok: true };
  }

  @Delete('me/pinned-projects/:projectId')
  @HttpCode(200)
  @ResponseCode('PINNED_REMOVED')
  async unpin(
    @CurrentUser() user: JwtPayload,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    await this.directory.unpin(user.userId, projectId);
    return { ok: true };
  }

  @Post('me/project-visits/:projectId')
  @HttpCode(200)
  @ResponseCode('VISIT_RECORDED')
  async recordVisit(
    @CurrentUser() user: JwtPayload,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    await this.directory.recordVisit(user.userId, projectId);
    return { ok: true };
  }

  @Get('me/projects/recent')
  @ResponseCode('RECENT_LISTED')
  async recent(@CurrentUser() user: JwtPayload) {
    return { projects: await this.directory.recentForSidebar(user.userId, 8) };
  }
}
