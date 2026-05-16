import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { StreamableFile } from '@nestjs/common';
import { RESPONSE_CODE_KEY } from '../decorators/response-code.decorator';
import { ResponseCodes, ResponseCodeKey } from '../constants/response-codes';
import { PaginatedResponse } from '../dto/paginated-response.dto';
import { PaginatedMutationResponse } from '../dto/paginated-mutation-response.dto';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const responseCodeKey = this.reflector.get<ResponseCodeKey>(
      RESPONSE_CODE_KEY,
      context.getHandler(),
    );

    if (!responseCodeKey) return next.handle();

    const codeDef = ResponseCodes[responseCodeKey];

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in data) return data;
        if (data instanceof StreamableFile) return data;

        if (data instanceof PaginatedResponse) {
          return {
            success: true,
            code: codeDef.code,
            data: data.toEnvelopeData(),
            message: codeDef.message,
            errors: null,
            validationErrors: null,
          };
        }

        if (data instanceof PaginatedMutationResponse) {
          return {
            success: true,
            code: codeDef.code,
            data: data.toEnvelopeData(),
            message: codeDef.message,
            errors: null,
            validationErrors: null,
          };
        }

        return {
          success: true,
          code: codeDef.code,
          data,
          message: codeDef.message,
          errors: null,
          validationErrors: null,
        };
      }),
    );
  }
}
