import { Injectable, HttpStatus, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
  CreateBucketCommand, HeadBucketCommand,
  ListObjectsV2Command, DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import { AppLogicException } from '../common/exceptions/app-exceptions';

@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly s3: S3Client | null;
  private readonly s3Public: S3Client | null;
  private readonly bucket: string;
  private readonly presignExpiry: number;
  private readonly isTestMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isTestMode = this.configService.get<string>('NODE_ENV') === 'test';
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'trackero-files');
    const PRESIGN_MIN = 60;
    const PRESIGN_MAX = 7 * 24 * 60 * 60;
    const PRESIGN_DEFAULT = 1800;
    const rawPresign = parseInt(String(this.configService.get('PRESIGNED_URL_EXPIRY', PRESIGN_DEFAULT)), 10);
    const presign = Number.isFinite(rawPresign) && rawPresign > 0 ? rawPresign : PRESIGN_DEFAULT;
    this.presignExpiry = Math.min(PRESIGN_MAX, Math.max(PRESIGN_MIN, presign));

    if (!this.isTestMode) {
      const endpoint = this.configService.get<string>('MINIO_ENDPOINT');
      const port = this.configService.get<number>('MINIO_PORT', 443);
      const useSSL = this.configService.get<string>('MINIO_USE_SSL', 'true') === 'true';
      const protocol = useSSL ? 'https' : 'http';
      const internalOrigin = `${protocol}://${endpoint}:${port}`;
      const publicOrigin = this.configService.get<string>('MINIO_PUBLIC_URL', '') || null;

      const region = this.configService.get<string>('S3_REGION', 'us-east-1');
      const credentials = {
        accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
        secretAccessKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
      };

      this.s3 = new S3Client({
        endpoint: internalOrigin,
        region,
        credentials,
        forcePathStyle: true,
        tls: useSSL,
      });

      // Separate client for presigned URLs so signatures match the public hostname.
      this.s3Public = publicOrigin
        ? new S3Client({ endpoint: publicOrigin, region, credentials, forcePathStyle: true, tls: publicOrigin.startsWith('https') })
        : this.s3;
    } else {
      this.s3 = null;
      this.s3Public = null;
    }
  }

  async onModuleInit() {
    if (!this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        console.log(`[FileStorage] Created bucket: ${this.bucket}`);
      } catch (err) {
        console.error(`[FileStorage] Could not create bucket ${this.bucket}:`, err);
      }
    }
  }

  /**
   * Decides how an object of the given MIME type should be served (§4.3).
   *
   * Non-image types are forced to download (`Content-Disposition: attachment`)
   * with a non-renderable `application/octet-stream` content type so a browser
   * never renders an uploaded file inline (which would enable stored XSS for
   * HTML/SVG-like payloads). Genuine raster images may be shown inline.
   */
  private resolveDisposition(mimeType: string): {
    contentDisposition?: string;
    contentType?: string;
  } {
    const INLINE_IMAGE_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    ];
    if (INLINE_IMAGE_TYPES.includes(mimeType)) {
      return {};
    }
    return {
      contentDisposition: 'attachment',
      contentType: 'application/octet-stream',
    };
  }

  async upload(projectId: number, taskId: number, originalFilename: string, buffer: Buffer, mimeType: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
    const key = `${projectId}/${taskId}/${uuid}-${safeName}`;

    if (this.s3) {
      try {
        // Always store objects with attachment disposition so the object
        // metadata itself never invites inline rendering (§4.3). A safe
        // filename is included for a sensible default download name.
        await this.s3.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ContentDisposition: `attachment; filename="${safeName}"`,
        }));
      } catch (err: any) {
        console.error(`[FileStorage] Upload failed for ${key}:`, err?.message || err);
        throw new AppLogicException('FORBIDDEN', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }

    return key;
  }

  async delete(key: string): Promise<void> {
    if (!this.s3) return;
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
    } catch (err) {
      console.error(`[FileStorage] Failed to delete ${key}:`, err);
    }
  }

  /**
   * Best-effort deletion of every object whose key starts with `prefix`.
   *
   * Used to reclaim storage when the DB rows that pointed at those objects
   * have been cascade-deleted (work-item or project deletion) and can no
   * longer be enumerated. Storage keys are `${projectId}/${taskId}/${uuid}-...`,
   * so a work item's objects live under `${projectId}/${itemId}/` and a
   * project's objects under `${projectId}/`.
   *
   * This is a cleanup path: it NEVER throws. A failure here must not crash
   * the deletion that triggered it — failures are logged and swallowed.
   * In test mode (`this.s3` is null) it is a no-op, consistent with the
   * other methods.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    if (!this.s3) return;
    try {
      let continuationToken: string | undefined;
      do {
        const listed = await this.s3.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));

        const keys = (listed.Contents ?? [])
          .map((obj) => obj.Key)
          .filter((k): k is string => !!k);

        // DeleteObjects accepts up to 1000 keys per request.
        for (let i = 0; i < keys.length; i += 1000) {
          const batch = keys.slice(i, i + 1000);
          await this.s3.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }));
        }

        continuationToken = listed.IsTruncated
          ? listed.NextContinuationToken
          : undefined;
      } while (continuationToken);
    } catch (err) {
      console.error(`[FileStorage] Failed to delete objects under prefix ${prefix}:`, err);
    }
  }

  async getPresignedUrl(
    key: string,
    mimeType?: string,
  ): Promise<{ url: string; expiresIn: number }> {
    if (!this.s3Public) {
      return { url: `http://localhost:9000/${this.bucket}/${key}`, expiresIn: this.presignExpiry };
    }
    const { contentDisposition, contentType } = this.resolveDisposition(mimeType ?? '');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {}),
      ...(contentType ? { ResponseContentType: contentType } : {}),
    });
    const url = await getSignedUrl(this.s3Public, command, { expiresIn: this.presignExpiry });
    return { url, expiresIn: this.presignExpiry };
  }
}
