import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Attachment } from './entities/attachment.entity';
import { FileStorageService } from '../file-storage/file-storage.service';
import { AppLogicException } from '../common/exceptions/app-exceptions';
import { PaginatedResponse } from '../common/dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../common/dto/paginated-mutation-response.dto';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';

@Injectable()
export class AttachmentsService {
  private readonly maxSizeMb: number;
  private readonly logger = new Logger(AttachmentsService.name);

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

  // Phase 10 — exclude soft-deleted work items so a `GET attachments` on a
  // freshly-deleted item returns 404 (its parent is invisible from this point
  // forward, even though the row survives for the retention grace window).
  private async verifyItemInProject(projectId: number, workItemId: number): Promise<void> {
    const [item] = await this.dataSource.query(
      'SELECT id FROM work_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
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

    const VIDEO_MIMES = [
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska',
    ];
    const ALLOWED_MIMES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...VIDEO_MIMES,
    ];

    const isVideo = VIDEO_MIMES.includes(file.mimetype);
    const maxMb = isVideo ? 50 : this.maxSizeMb;
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new AppLogicException('FILE_TOO_LARGE', HttpStatus.BAD_REQUEST);
    }
    // MIME types whose containers `file-type` reports as `application/zip`.
    // (OOXML docx/xlsx genuinely ARE zip containers; file-type@16 normally
    // detects them precisely, but a generic-zip fallback is handled here too.)
    const ZIP_BASED_OOXML = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const detected = await fileTypeFromBuffer(file.buffer);

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

    // The object bytes are now in storage. If the DB save (or anything after
    // it) throws, that object would be orphaned with no row pointing at it —
    // so wrap the post-upload work and, on failure, compensate by deleting the
    // just-uploaded object before re-propagating the original error. The
    // compensation is best-effort: its own failure must not mask the cause.
    try {
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
    } catch (err) {
      try {
        await this.fileStorage.delete(storageKey);
      } catch (cleanupErr) {
        this.logger.error(
          `Failed to compensate orphaned object ${storageKey} after upload failure: ${cleanupErr}`,
          (cleanupErr as Error)?.stack,
        );
      }
      throw err;
    }
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
    return this.fileStorage.getPresignedUrl(attachment.storageKey, attachment.mimeType);
  }

  async remove(projectId: number, workItemId: number, attachmentId: number) {
    await this.verifyItemInProject(projectId, workItemId);
    const attachment = await this.attachmentRepo.findOne({ where: { id: attachmentId, workItemId } });
    if (!attachment) {
      throw new AppLogicException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.attachmentRepo.remove(attachment);
    // FileStorageService.delete swallows storage errors internally (logged via
    // console.error). A failed object delete here leaves an orphan but must not
    // fail the request — the DB row is already gone.
    await this.fileStorage.delete(attachment.storageKey);
  }

  /**
   * When a work item is deleted, the DB cascade-deletes its `attachments`
   * rows — but the storage objects those rows pointed at remain. By the time
   * this listener runs the rows are already gone, so they cannot be queried;
   * instead we delete every object under the work item's key prefix
   * `${projectId}/${itemId}/`.
   *
   * Fire-and-forget / failure-isolated (Task 3.8): the body is fully wrapped in
   * try/catch + Logger so a cleanup failure can never destabilise the process.
   */
  @OnEvent('work_item.deleted')
  async onWorkItemDeleted(payload: {
    itemId: number;
    itemType: string;
    userId: number;
    projectId: number;
  }) {
    try {
      await this.fileStorage.deleteByPrefix(`${payload.projectId}/${payload.itemId}/`);
    } catch (err) {
      this.logger.error(
        `onWorkItemDeleted storage cleanup failed for item ${payload.itemId}: ${err}`,
        (err as Error)?.stack,
      );
    }
  }

  /**
   * When a project is hard-deleted, its work items and attachment rows all
   * cascade away — orphaning every storage object under the project. Delete
   * every object under the project's key prefix `${projectId}/`.
   *
   * Fire-and-forget / failure-isolated (Task 3.8).
   */
  @OnEvent('project.deleted')
  async onProjectDeleted(payload: { projectId: number }) {
    try {
      await this.fileStorage.deleteByPrefix(`${payload.projectId}/`);
    } catch (err) {
      this.logger.error(
        `onProjectDeleted storage cleanup failed for project ${payload.projectId}: ${err}`,
        (err as Error)?.stack,
      );
    }
  }
}
