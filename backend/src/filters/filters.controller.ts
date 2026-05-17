import { Controller, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { FiltersService } from './filters.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';

@Controller('projects/:projectId/filters')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class FiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @Get(':type')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('HEALTH_OK')
  async getFilterOptions(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('type') type: string,
  ) {
    return this.filtersService.getFilterOptions(projectId, type);
  }
}
