import { HttpException, HttpStatus } from '@nestjs/common';
import { ResponseCodes, ResponseCodeKey } from '../constants/response-codes';

interface ErrorDetail {
  code: string;
  message: string;
}

interface ValidationErrorItem {
  error: string;
  message: string;
}

abstract class AppException extends HttpException {
  readonly appCode: string;
  readonly appMessage: string;
  readonly appErrors: ErrorDetail[];
  readonly appValidationErrors: ValidationErrorItem[] | null;

  constructor(
    appCode: string,
    appMessage: string,
    status: HttpStatus,
    appErrors: ErrorDetail[],
    appValidationErrors: ValidationErrorItem[] | null = null,
  ) {
    super({ appCode, appMessage, appErrors, appValidationErrors }, status);
    this.appCode = appCode;
    this.appMessage = appMessage;
    this.appErrors = appErrors;
    this.appValidationErrors = appValidationErrors;
  }
}

export class AppValidationException extends AppException {
  constructor(validationErrors: ValidationErrorItem[], message?: string) {
    const code = ResponseCodes.VALIDATION_FAILED;
    super(
      code.code,
      message || code.message,
      HttpStatus.BAD_REQUEST,
      [],
      validationErrors,
    );
  }
}

export class AppLogicException extends AppException {
  constructor(key: ResponseCodeKey, status: HttpStatus, overrideMessage?: string) {
    const code = ResponseCodes[key];
    const message = overrideMessage || code.message;
    super(code.code, message, status, [{ code: code.code, message }]);
  }
}

export class AppDatabaseException extends AppException {
  constructor(overrideMessage?: string) {
    const code = ResponseCodes.DB_ERROR;
    const message = overrideMessage || code.message;
    super(code.code, message, HttpStatus.INTERNAL_SERVER_ERROR, [
      { code: code.code, message },
    ]);
  }
}
