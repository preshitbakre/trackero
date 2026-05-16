import {
  Controller, Post, Get, Delete, Param, UseGuards,
  HttpCode, HttpStatus, ParseIntPipe, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('projects/:projectId/tasks/:taskId/attachments')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ResponseCode('ATTACHMENT_UPLOADED')
  async upload(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('taskId', ParseIntPipe) taskId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentsService.upload(projectId, taskId, file, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ATTACHMENTS_LISTED')
  async findAll(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.attachmentsService.listAttachments(taskId);
  }

  @Get(':attachmentId/url')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ATTACHMENT_URL')
  async getUrl(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.attachmentsService.getPresignedUrl(taskId, attachmentId);
  }

  @Delete(':attachmentId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ATTACHMENT_DELETED')
  async remove(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    await this.attachmentsService.remove(taskId, attachmentId);
    return null;
  }
}
