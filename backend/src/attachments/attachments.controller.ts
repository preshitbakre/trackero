import {
  Controller, Post, Get, Delete, Param, UseGuards, UseFilters,
  HttpCode, HttpStatus, ParseIntPipe, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { MulterExceptionFilter } from '../common/filters/multer-exception.filter';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseCode } from '../common/decorators/response-code.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

@Controller('projects/:projectId/items/:itemId/attachments')
@UseGuards(JwtAuthGuard, ProjectAccessGuard, RolesGuard)
@UseFilters(MulterExceptionFilter)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @Roles('admin', 'project_manager', 'member')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ResponseCode('ATTACHMENT_UPLOADED')
  async upload(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attachmentsService.upload(projectId, itemId, file, user.userId);
  }

  @Get()
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ATTACHMENTS_LISTED')
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.attachmentsService.listAttachments(projectId, itemId);
  }

  @Get(':attachmentId/url')
  @Roles('admin', 'project_manager', 'member', 'viewer')
  @ResponseCode('ATTACHMENT_URL')
  async getUrl(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.attachmentsService.getPresignedUrl(projectId, itemId, attachmentId);
  }

  @Delete(':attachmentId')
  @Roles('admin', 'project_manager', 'member')
  @ResponseCode('ATTACHMENT_DELETED')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    await this.attachmentsService.remove(projectId, itemId, attachmentId);
    return null;
  }
}
