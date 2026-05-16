import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit mutations (POST, PUT, DELETE)
    if (method === 'GET') return next.handle();

    const userId = request.user?.userId;
    const path = request.url;

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget audit logging
        // Will be connected to ActivityLog entity in Phase 7
        if (process.env.NODE_ENV === 'development') {
          console.log(`[AUDIT] ${method} ${path} by user ${userId}`);
        }
      }),
    );
  }
}
