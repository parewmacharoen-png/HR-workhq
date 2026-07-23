// ============================================================================
// common/filters/all-exceptions.filter.ts
// Single place that turns any thrown error into a consistent JSON envelope.
// Reports 5xx errors to Sentry and emits structured logs.
// ============================================================================

import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../shared/kernel/domain-error';
import { RequestContext } from '../context/request-context';
import { StructuredLoggerService } from '../monitoring/structured-logger.service';

interface ResLike {
  status(code: number): ResLike;
  json(body: unknown): void;
}


/** Type guard for Prisma known request errors — works without prisma generate. */
function isPrismaKnownError(e: unknown): e is { code: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'message' in e &&
    typeof (e as Record<string, unknown>)['code'] === 'string' &&
    String((e as Record<string, unknown>)['code']).startsWith('P')
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly log: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ResLike>();
    const store = RequestContext.current();
    const requestId = store?.requestId ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
      if ('details' in exception && (exception as { details?: unknown }).details !== undefined) {
        details = (exception as { details?: unknown }).details;
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = HttpStatus[status] ?? 'HTTP_ERROR';
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: unknown };
        message = Array.isArray(b.message)
          ? 'Validation failed'
          : String(b.message ?? exception.message);
        details = Array.isArray(b.message) ? b.message : undefined;
      }
    } else if (isPrismaKnownError(exception)) {
      ({ status, code, message } = this.mapPrisma(exception));
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.log.write({
        context: 'Exception',
        level: 'error',
        message: `${code}: ${message}`,
        statusCode: status,
        code,
        requestId,
        userId: store?.actor?.userId,
        companyId: store?.actor?.companyId,
        workflowId: store?.workflowId,
        trace: exception instanceof Error ? exception.stack : undefined,
      });
      Sentry.captureException(exception);
    } else {
      this.log.write({
        context: 'Exception',
        level: 'warn',
        message: `${status} ${code}: ${message}`,
        statusCode: status,
        code,
        requestId,
        userId: store?.actor?.userId,
        companyId: store?.actor?.companyId,
        workflowId: store?.workflowId,
      });
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      details,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private mapPrisma(e: { code: string }): {
    status: number; code: string; message: string;
  } {
    switch (e.code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, code: 'UNIQUE_VIOLATION', message: 'Resource already exists' };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Resource not found' };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, code: 'FK_VIOLATION', message: 'Related resource missing' };
      default:
        return { status: HttpStatus.BAD_REQUEST, code: `DB_${e.code}`, message: 'Database error' };
    }
  }
}
