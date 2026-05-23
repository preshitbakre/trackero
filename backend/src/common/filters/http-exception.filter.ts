import { Catch, ExceptionFilter, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AppValidationException, AppLogicException, AppDatabaseException } from '../exceptions/app-exceptions';
import { ResponseCodes } from '../constants/response-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (
      exception instanceof AppValidationException ||
      exception instanceof AppLogicException ||
      exception instanceof AppDatabaseException
    ) {
      const status = exception.getStatus();
      return response.status(status).json({
        success: false,
        code: exception.appCode,
        data: null,
        message: exception.appMessage,
        errors: exception.appErrors,
        validationErrors: exception.appValidationErrors,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const codeMap: Record<number, { code: string; message: string }> = {
        [HttpStatus.UNAUTHORIZED]: ResponseCodes.UNAUTHORIZED,
        [HttpStatus.FORBIDDEN]: ResponseCodes.FORBIDDEN,
        [HttpStatus.NOT_FOUND]: ResponseCodes.NOT_FOUND,
        [HttpStatus.CONFLICT]: ResponseCodes.DUPLICATE_ENTRY,
        [HttpStatus.TOO_MANY_REQUESTS]: { code: 'F-L-0099', message: 'Too many requests. Please try again later.' },
      };
      const mapped = codeMap[status] || ResponseCodes.DB_ERROR;
      return response.status(status).json({
        success: false,
        code: mapped.code,
        data: null,
        message: mapped.message,
        errors: [{ code: mapped.code, message: mapped.message }],
        validationErrors: null,
      });
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    const fallback = ResponseCodes.DB_ERROR;
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      code: fallback.code,
      data: null,
      message: fallback.message,
      errors: [{ code: fallback.code, message: fallback.message }],
      validationErrors: null,
    });
  }
}
