import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { PresenceService } from './presence.service';

@Controller('projects/:projectId/presence')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('PRESENCE_FETCHED')
  list(@Param('projectId', ParseIntPipe) projectId: number) {
    return { users: this.presence.getProjectPresence(projectId) };
  }
}
