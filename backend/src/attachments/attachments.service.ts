import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Attachment } from './entities/attachment.entity';
import { FileStorageService } from '../file-storage/file-storage.service';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';

@Injectable()
export class AttachmentsService {
  private readonly maxSizeMb: number;

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    private readonly fileStorage: FileStorageService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {
    this.maxSizeMb = this.configService.get<number>('MAX_UPLOAD_SIZE_MB', 10);
  }

  private async verifyTaskInProject(projectId: number, taskId: number): Promise<void> {
    const [task] = await this.dataSource.query(
      'SELECT id FROM tasks WHERE id = $1 AND project_id = $2',
      [taskId, projectId],
    );
    if (!task) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async upload(projectId: number, taskId: number, file: Express.Multer.File, userId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    if (!file) {
      throw new AppLogicException('FILE_REQUIRED', HttpStatus.BAD_REQUEST);
    }

    const maxBytes = this.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppLogicException('FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }

    // Validate MIME type by magic bytes
    const ALLOWED_MIMES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileType = require('file-type');
    const detected = await fileType.fromBuffer(file.buffer);
    const effectiveMime = detected?.mime || file.mimetype;
    if (!ALLOWED_MIMES.includes(effectiveMime)) {
      throw new AppLogicException('FILE_TYPE_NOT_ALLOWED', HttpStatus.BAD_REQUEST);
    }

    const storageKey = await this.fileStorage.upload(
      projectId, taskId, file.originalname, file.buffer, file.mimetype,
    );

    const attachment = this.attachmentRepo.create({
      taskId,
      uploadedBy: userId,
      originalFilename: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
    const saved = await this.attachmentRepo.save(attachment);

    this.eventEmitter.emit('attachment.added', { taskId, projectId, actorId: userId, attachmentId: saved.id });

    const list = await this.listAttachments(projectId, taskId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listAttachments(projectId: number, taskId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    const attachments = await this.attachmentRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });
    return new PaginatedResponse(attachments, attachments.length, 1, attachments.length || 1);
  }

  async getPresignedUrl(projectId: number, taskId: number, attachmentId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, taskId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.getPresignedUrl(attachment.storageKey);
  }

  async remove(projectId: number, taskId: number, attachmentId: number) {
    await this.verifyTaskInProject(projectId, taskId);
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, taskId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.attachmentRepo.remove(attachment);
    await this.fileStorage.delete(attachment.storageKey);
  }
}
