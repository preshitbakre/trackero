import { Controller, Get, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('projects/:projectId')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Get('velocity')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('VELOCITY_FETCHED')
  async velocity(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.chartsService.getVelocity(projectId);
  }

  @Get('cumulative-flow')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('CUMULATIVE_FLOW')
  async cumulativeFlow(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.chartsService.getCumulativeFlow(projectId);
  }

  @Get('throughput')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('THROUGHPUT_FETCHED')
  async throughput(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.chartsService.getThroughput(projectId);
  }
}
