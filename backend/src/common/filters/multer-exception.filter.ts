import {
  Catch, ExceptionFilter, ArgumentsHost, HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import { ResponseCodes } from '../constants/response-codes';

/**
 * Maps Multer's upload-size rejection to the codebase's standard
 * FILE_TOO_LARGE envelope.
 *
 * The Multer `fileSize` limit (configured in AttachmentsModule) rejects an
 * oversized stream mid-upload — before the whole file is buffered into RAM.
 * When it fires, `@nestjs/platform-express`'s FileInterceptor catches the raw
 * `MulterError('LIMIT_FILE_SIZE')` and re-throws it as a NestJS
 * `PayloadTooLargeException` (HTTP 413). The global HttpExceptionFilter has no
 * mapping for 413, so it would otherwise fall through to the generic DB_ERROR
 * envelope. This filter catches that 413 and produces the SAME response shape
 * and code (`FILE_TOO_LARGE`) that AttachmentsService throws for an oversized
 * file — so clients get a consistent error regardless of which layer rejects.
 */
@Catch(PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const code = ResponseCodes.FILE_TOO_LARGE;
    return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      success: false,
      code: code.code,
      data: null,
      message: code.message,
      errors: [{ code: code.code, message: code.message }],
      validationErrors: null,
    });
  }
}
