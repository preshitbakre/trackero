import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('projects/:projectId/integrations')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @Roles('admin', 'project_manager')
  @ResponseCode('INTEGRATIONS_LISTED')
  async list(@Param('projectId', ParseIntPipe) projectId: number) {
    return { integrations: await this.integrations.list(projectId) };
  }

  @Post()
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('INTEGRATION_CREATED')
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { type: string; config: any; enabled?: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.integrations.create(projectId, body, user.userId);
  }

  @Put(':id')
  @Roles('admin', 'project_manager')
  @ResponseCode('INTEGRATION_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { config?: any; enabled?: boolean },
  ) {
    return this.integrations.update(projectId, id, body);
  }

  @Delete(':id')
  @Roles('admin', 'project_manager')
  @ResponseCode('INTEGRATION_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.integrations.remove(projectId, id);
    return null;
  }

  @Get(':id/deliveries')
  @Roles('admin', 'project_manager')
  @ResponseCode('INTEGRATION_DELIVERIES_LISTED')
  async deliveries(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return { deliveries: await this.integrations.deliveries(projectId, id, limit ?? 20) };
  }

  @Post(':id/deliveries/:deliveryId/retry')
  @Roles('admin', 'project_manager')
  @HttpCode(HttpStatus.OK)
  @ResponseCode('INTEGRATION_DELIVERY_RETRIED')
  async retry(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
  ) {
    await this.integrations.retry(projectId, id, deliveryId);
    return { queued: true };
  }
}
