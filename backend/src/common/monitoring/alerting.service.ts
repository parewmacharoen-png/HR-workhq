// ============================================================================
// common/monitoring/alerting.service.ts
// Operational alerts emitted as structured logs + Sentry when configured.
// ============================================================================

import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { StructuredLoggerService } from './structured-logger.service';

const PAYROLL_ENTITY_TYPES = new Set(['bonus']);

@Injectable()
export class AlertingService {
  constructor(private readonly log: StructuredLoggerService) {}

  workflowFailure(details: {
    workflowId?: string | null;
    entityType?: string;
    entityId?: string;
    eventType?: string;
    error: unknown;
  }): void {
    const message = details.error instanceof Error
      ? details.error.message
      : String(details.error);
    this.log.write({
      context: 'Alert',
      level: 'error',
      message: 'workflow_failure',
      alert: 'workflow_failure',
      workflowId: details.workflowId ?? null,
      entityType: details.entityType,
      entityId: details.entityId,
      eventType: details.eventType,
      error: message,
    });
    Sentry.captureException(details.error, {
      tags: { alert: 'workflow_failure', entityType: details.entityType },
      extra: {
        workflowId: details.workflowId,
        entityId: details.entityId,
        eventType: details.eventType,
      },
    });
  }

  payrollFailure(details: {
    workflowId?: string | null;
    entityType?: string;
    entityId?: string;
    eventType?: string;
    error: unknown;
  }): void {
    const message = details.error instanceof Error
      ? details.error.message
      : String(details.error);
    this.log.write({
      context: 'Alert',
      level: 'error',
      message: 'payroll_failure',
      alert: 'payroll_failure',
      workflowId: details.workflowId ?? null,
      entityType: details.entityType,
      entityId: details.entityId,
      eventType: details.eventType,
      error: message,
    });
    Sentry.captureException(details.error, {
      tags: { alert: 'payroll_failure', entityType: details.entityType },
      extra: {
        workflowId: details.workflowId,
        entityId: details.entityId,
        eventType: details.eventType,
      },
    });
  }

  outboxRetryStorm(details: {
    pendingBacklog: number;
    highAttemptCount: number;
    threshold: number;
  }): void {
    this.log.write({
      context: 'Alert',
      level: 'error',
      message: 'outbox_retry_storm',
      alert: 'outbox_retry_storm',
      pendingBacklog: details.pendingBacklog,
      highAttemptCount: details.highAttemptCount,
      threshold: details.threshold,
    });
    Sentry.captureMessage('Outbox retry storm detected', {
      level: 'error',
      tags: { alert: 'outbox_retry_storm' },
      extra: details,
    });
  }

  telegramProcessingFailure(details: { updateId?: number; error: unknown }): void {
    const message = details.error instanceof Error
      ? details.error.message
      : String(details.error);
    this.log.write({
      context: 'Alert',
      level: 'error',
      message: 'telegram_processing_failure',
      alert: 'telegram_processing_failure',
      updateId: details.updateId,
      error: message,
    });
    Sentry.captureException(details.error, {
      tags: { alert: 'telegram_processing_failure' },
      extra: { updateId: details.updateId },
    });
  }

  isPayrollEntity(entityType?: string): boolean {
    return !!entityType && PAYROLL_ENTITY_TYPES.has(entityType);
  }

  isWorkflowEvent(eventType: string): boolean {
    return eventType.startsWith('workflow.');
  }
}
