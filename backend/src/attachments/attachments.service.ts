import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {
    this.maxSizeMb = this.configService.get<number>('MAX_UPLOAD_SIZE_MB', 10);
  }

  async upload(projectId: number, taskId: number, file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new AppLogicException('FILE_REQUIRED', HttpStatus.BAD_REQUEST);
    }

    const maxBytes = this.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppLogicException('FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
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

    const list = await this.listAttachments(taskId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listAttachments(taskId: number) {
    const attachments = await this.attachmentRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });
    return new PaginatedResponse(attachments, attachments.length, 1, attachments.length || 1);
  }

  async getPresignedUrl(taskId: number, attachmentId: number) {
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, taskId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.getPresignedUrl(attachment.storageKey);
  }

  async remove(taskId: number, attachmentId: number) {
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, taskId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.attachmentRepo.remove(attachment);
    await this.fileStorage.delete(attachment.storageKey);
  }
}
