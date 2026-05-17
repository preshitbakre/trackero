import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

@Injectable()
export class FileStorageService {
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly presignExpiry: number;
  private readonly isTestMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isTestMode = this.configService.get<string>('NODE_ENV') === 'test';
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'trackero-files');
    this.presignExpiry = parseInt(String(this.configService.get('PRESIGNED_URL_EXPIRY', 1800)));

    if (!this.isTestMode) {
      const endpoint = this.configService.get<string>('MINIO_ENDPOINT');
      const port = this.configService.get<number>('MINIO_PORT', 443);
      const useSSL = this.configService.get<string>('MINIO_USE_SSL', 'true') === 'true';
      const protocol = useSSL ? 'https' : 'http';

      this.s3 = new S3Client({
        endpoint: `${protocol}://${endpoint}:${port}`,
        region: this.configService.get<string>('S3_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
          secretAccessKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
        },
        forcePathStyle: true,
        tls: useSSL,
      });
    } else {
      this.s3 = null;
    }
  }

  async upload(projectId: number, taskId: number, originalFilename: string, buffer: Buffer, mimeType: string): Promise<string> {
    const uuid = crypto.randomUUID();
    const key = `${projectId}/${taskId}/${uuid}-${originalFilename}`;

    if (this.s3) {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }));
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

  async getPresignedUrl(key: string): Promise<{ url: string; expiresIn: number }> {
    if (!this.s3) {
      return { url: `http://localhost:9000/${this.bucket}/${key}`, expiresIn: this.presignExpiry };
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: this.presignExpiry });
    return { url, expiresIn: this.presignExpiry };
  }
}
