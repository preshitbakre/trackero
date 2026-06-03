import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './entities/attachment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment]),
    // Memory storage stays the default. Enforce the upload size limit at the
    // Multer layer so an oversized stream is rejected mid-upload — before the
    // entire file is buffered into RAM (memory-exhaustion DoS prevention).
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: 50 * 1024 * 1024,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
