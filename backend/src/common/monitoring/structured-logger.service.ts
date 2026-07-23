// ============================================================================
// common/monitoring/structured-logger.service.ts
// Emits JSON log lines with request/user/company/workflow correlation fields.
// ============================================================================

import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContext } from '../context/request-context';

export type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose';

export interface StructuredLogFields {
  message: string;
  level: LogLevel;
  requestId?: string | null;
  userId?: string | null;
  companyId?: string | null;
  workflowId?: string | null;
  context?: string;
  [key: string]: unknown;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private emit(fields: StructuredLogFields): void {
    const store = RequestContext.current();
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: fields.requestId ?? store?.requestId ?? null,
      userId: fields.userId ?? store?.actor?.userId ?? null,
      companyId: fields.companyId ?? store?.actor?.companyId ?? null,
      workflowId: fields.workflowId ?? store?.workflowId ?? null,
      level: fields.level,
      context: fields.context ?? 'App',
      message: fields.message,
      ...this.extraFields(fields),
    });
    // eslint-disable-next-line no-console
    console.log(line);
  }

  private extraFields(fields: StructuredLogFields): Record<string, unknown> {
    const reserved = new Set([
      'message', 'level', 'requestId', 'userId', 'companyId', 'workflowId', 'context',
    ]);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!reserved.has(key)) out[key] = value;
    }
    return out;
  }

  log(message: string, context?: string): void {
    this.emit({ message, level: 'log', context });
  }

  warn(message: string, context?: string): void {
    this.emit({ message, level: 'warn', context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.emit({ message, level: 'error', context, trace });
  }

  debug(message: string, context?: string): void {
    this.emit({ message, level: 'debug', context });
  }

  verbose(message: string, context?: string): void {
    this.emit({ message, level: 'verbose', context });
  }

  write(fields: StructuredLogFields): void {
    this.emit(fields);
  }
}
