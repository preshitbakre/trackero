import {
  Controller, Post, Get, Patch, Put, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import {
  CreateAcceptanceCriterionDto,
  UpdateAcceptanceCriterionDto,
  ReorderAcceptanceCriteriaDto,
} from './dto/acceptance-criterion.dto';

@Controller('projects/:projectId/items/:itemId/acceptance-criteria')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class AcceptanceCriteriaController {
  constructor(private readonly svc: WorkItemsService) {}

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('CRITERIA_LISTED')
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.svc.listAcceptanceCriteria(projectId, itemId);
  }

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('CRITERION_CREATED')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: CreateAcceptanceCriterionDto,
  ) {
    return this.svc.createAcceptanceCriterion(projectId, itemId, dto);
  }

  @Put('reorder')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CRITERIA_REORDERED')
  reorder(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: ReorderAcceptanceCriteriaDto,
  ) {
    return this.svc.reorderAcceptanceCriteria(projectId, itemId, dto.orderedIds);
  }

  @Patch(':criterionId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CRITERION_UPDATED')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('criterionId', ParseIntPipe) criterionId: number,
    @Body() dto: UpdateAcceptanceCriterionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateAcceptanceCriterion(projectId, itemId, criterionId, dto, user.userId);
  }

  @Delete(':criterionId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('CRITERION_DELETED')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('criterionId', ParseIntPipe) criterionId: number,
  ) {
    return this.svc.deleteAcceptanceCriterion(projectId, itemId, criterionId);
  }
}
