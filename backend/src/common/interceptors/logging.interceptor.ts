// ============================================================================
// common/interceptors/logging.interceptor.ts
// Emits one structured JSON log line per completed HTTP request.
// ============================================================================

import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RequestContext } from '../context/request-context';
import { StructuredLoggerService } from '../monitoring/structured-logger.service';

interface ReqLike { method: string; originalUrl?: string; url?: string; }

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly log: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<ReqLike>();
    const res = http.getResponse<{ statusCode: number }>();
    const started = Date.now();
    const store = RequestContext.current();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - started;
          this.log.write({
            context: 'HTTP',
            level: 'log',
            message: 'request_completed',
            method: req.method,
            path: req.originalUrl ?? req.url,
            statusCode: res.statusCode,
            durationMs: ms,
            requestId: store?.requestId,
            userId: store?.actor?.userId,
            companyId: store?.actor?.companyId,
            workflowId: store?.workflowId,
          });
        },
        error: (err: { message?: string; status?: number }) => {
          const ms = Date.now() - started;
          this.log.write({
            context: 'HTTP',
            level: 'warn',
            message: 'request_failed',
            method: req.method,
            path: req.originalUrl ?? req.url,
            statusCode: err?.status ?? 500,
            durationMs: ms,
            error: err?.message,
            requestId: store?.requestId,
            userId: store?.actor?.userId,
            companyId: store?.actor?.companyId,
            workflowId: store?.workflowId,
          });
        },
      }),
    );
  }
}
