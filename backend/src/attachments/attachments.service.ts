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

  private async verifyItemInProject(projectId: number, workItemId: number): Promise<void> {
    const [item] = await this.dataSource.query(
      'SELECT id FROM work_items WHERE id = $1 AND project_id = $2',
      [workItemId, projectId],
    );
    if (!item) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
  }

  async upload(projectId: number, workItemId: number, file: Express.Multer.File, userId: number) {
    await this.verifyItemInProject(projectId, workItemId);
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
    // MIME types whose containers `file-type` reports as `application/zip`.
    // (OOXML docx/xlsx genuinely ARE zip containers; file-type@16 normally
    // detects them precisely, but a generic-zip fallback is handled here too.)
    const ZIP_BASED_OOXML = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileType = require('file-type');
    const detected = await fileType.fromBuffer(file.buffer);

    let effectiveMime: string;
    if (detected) {
      // file-type detected a concrete signature.
      if (detected.mime === 'application/zip' && ZIP_BASED_OOXML.includes(file.mimetype)) {
        // OOXML files are zip containers. If the detector falls back to the
        // generic zip type, trust the claimed OOXML type (still allow-listed).
        effectiveMime = file.mimetype;
      } else {
        effectiveMime = detected.mime;
      }
    } else {
      // No magic-byte signature. Only text/plain and text/csv legitimately
      // have no signature — anything else with undetectable bytes is spoofed
      // or corrupt and must be rejected.
      if (file.mimetype !== 'text/plain' && file.mimetype !== 'text/csv') {
        throw new AppLogicException('FILE_TYPE_NOT_ALLOWED', HttpStatus.BAD_REQUEST);
      }
      effectiveMime = file.mimetype;
    }

    if (!ALLOWED_MIMES.includes(effectiveMime)) {
      throw new AppLogicException('FILE_TYPE_NOT_ALLOWED', HttpStatus.BAD_REQUEST);
    }

    const storageKey = await this.fileStorage.upload(
      projectId, workItemId, file.originalname, file.buffer, effectiveMime,
    );

    const attachment = this.attachmentRepo.create({
      workItemId,
      uploadedBy: userId,
      originalFilename: file.originalname,
      storageKey,
      mimeType: effectiveMime,
      sizeBytes: file.size,
    });
    const saved = await this.attachmentRepo.save(attachment);

    this.eventEmitter.emit('attachment.added', { workItemId, projectId, actorId: userId, attachmentId: saved.id });

    const list = await this.listAttachments(projectId, workItemId);
    return PaginatedMutationResponse.forPaginated(saved, list);
  }

  async listAttachments(projectId: number, workItemId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    const attachments = await this.attachmentRepo.find({
      where: { workItemId },
      order: { createdAt: 'ASC' },
    });
    return new PaginatedResponse(attachments, attachments.length, 1, attachments.length || 1);
  }

  async getPresignedUrl(projectId: number, workItemId: number, attachmentId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, workItemId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.getPresignedUrl(attachment.storageKey);
  }

  async remove(projectId: number, workItemId: number, attachmentId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, workItemId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.attachmentRepo.remove(attachment);
    await this.fileStorage.delete(attachment.storageKey);
  }
}
