import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('PROJECT_CREATED')
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: JwtPayload) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('PROJECTS_LISTED')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.projectsService.listProjects(user.userId, user.role, page || 1, limit || 20, { status, search });
  }

  @Get(':projectId')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_FETCHED')
  async findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Put(':projectId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_UPDATED')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.update(projectId, dto, user.userId, user.role);
  }

  @Delete(':projectId')
  @Roles('admin')
  @ResponseCode('PROJECT_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.remove(projectId, user.userId, user.role);
  }

  @Post(':projectId/archive')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_ARCHIVED')
  async archive(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.archive(projectId, user.userId, user.role);
  }

  @Post(':projectId/unarchive')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_UPDATED')
  async unarchive(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.unarchive(projectId, user.userId, user.role);
  }

  // --- Members ---

  @Post(':projectId/members')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('PROJECT_MEMBER_ADDED')
  async addMember(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.projectsService.addMember(projectId, dto, user.userId);
  }

  @Get(':projectId/members')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_MEMBERS_LISTED')
  async listMembers(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.listMembers(projectId);
  }

  @Delete(':projectId/members/:userId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_MEMBER_REMOVED')
  async removeMember(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.projectsService.removeMember(projectId, userId);
  }

  @Put(':projectId/members/:userId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('PROJECT_MEMBER_UPDATED')
  async updateMemberRole(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AddMemberDto,
  ) {
    return this.projectsService.updateMemberRole(projectId, userId, dto.role);
  }

  // --- Statuses ---

  @Get(':projectId/statuses')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('STATUSES_LISTED')
  async listStatuses(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.listStatuses(projectId);
  }

  @Post(':projectId/statuses')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('STATUS_CREATED')
  async createStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateStatusDto,
  ) {
    return this.projectsService.createStatus(projectId, dto);
  }

  @Put(':projectId/statuses/reorder')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('STATUSES_REORDERED')
  async reorderStatuses(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { statusIds: number[] },
  ) {
    return this.projectsService.reorderStatuses(projectId, body.statusIds);
  }

  @Put(':projectId/statuses/:statusId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('STATUS_UPDATED')
  async updateStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('statusId', ParseIntPipe) statusId: number,
    @Body() dto: CreateStatusDto,
  ) {
    return this.projectsService.updateStatus(projectId, statusId, dto);
  }

  @Delete(':projectId/statuses/:statusId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('STATUS_DELETED')
  async deleteStatus(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('statusId', ParseIntPipe) statusId: number,
  ) {
    await this.projectsService.deleteStatus(projectId, statusId);
    return null;
  }

  // --- Labels ---

  @Get(':projectId/labels')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('LABELS_LISTED')
  async listLabels(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.listLabels(projectId);
  }

  @Post(':projectId/labels')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ResponseCode('LABEL_CREATED')
  async createLabel(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateLabelDto,
  ) {
    return this.projectsService.createLabel(projectId, dto);
  }

  @Put(':projectId/labels/:labelId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('LABEL_UPDATED')
  async updateLabel(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.projectsService.updateLabel(projectId, labelId, dto);
  }

  @Delete(':projectId/labels/:labelId')
  @Roles('admin', 'project_manager')
  @UseGuards(ProjectAccessGuard)
  @ResponseCode('LABEL_DELETED')
  async deleteLabel(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
  ) {
    await this.projectsService.deleteLabel(projectId, labelId);
    return null;
  }
}
