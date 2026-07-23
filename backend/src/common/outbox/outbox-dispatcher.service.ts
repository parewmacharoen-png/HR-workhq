// ============================================================================
// common/outbox/outbox-dispatcher.service.ts
// Polls system.outbox_events for unprocessed rows and dispatches each event to
// the registered handler. Uses FOR UPDATE SKIP LOCKED so multiple API replicas
// never process the same row concurrently.
// ============================================================================

import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AlertingService } from '../monitoring/alerting.service';

export interface OutboxEventHandler {
  handles: string[];   // list of event_type values this handler processes
  handle(eventType: string, payload: unknown): Promise<void>;
}

interface ClaimedOutboxRow {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

interface WorkflowResolvedPayload {
  instanceId?: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  companyId?: string | null;
}

@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly handlers: OutboxEventHandler[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRetryStormAlertAt = 0;
  private readonly POLL_INTERVAL_MS = 5_000;
  private readonly MAX_ATTEMPTS = 5;
  private readonly BATCH_SIZE = 50;
  private readonly RETRY_STORM_THRESHOLD = 10;
  private readonly RETRY_STORM_COOLDOWN_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerting: AlertingService,
  ) {}

  registerHandler(handler: OutboxEventHandler): void {
    this.handlers.push(handler);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < this.BATCH_SIZE; i++) {
        const handled = await this.claimAndDispatchOne();
        if (!handled) break;
      }
      await this.checkRetryStorm();
    } catch (err) {
      this.logger.error('Outbox poll error', err);
    } finally {
      this.running = false;
    }
  }

  /** Exposed for reliability integration tests — processes at most one event. */
  async processOneEventForTest(): Promise<boolean> {
    return this.claimAndDispatchOne();
  }

  private async claimAndDispatchOne(): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<ClaimedOutboxRow[]>(
          `SELECT id, event_type, payload, attempts
           FROM system.outbox_events
           WHERE processed_at IS NULL AND attempts < $1
           ORDER BY occurred_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          this.MAX_ATTEMPTS,
        );
        if (!rows.length) return false;

        const event = {
          id: rows[0].id,
          eventType: rows[0].event_type,
          payload: rows[0].payload,
          attempts: rows[0].attempts,
        };

        const handler = this.handlers.find((h) => h.handles.includes(event.eventType));
        try {
          if (handler) {
            await handler.handle(event.eventType, event.payload);
          } else {
            this.logger.warn(`No handler for event type: ${event.eventType}`);
          }
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date(), attempts: event.attempts + 1 },
          });
        } catch (err) {
          this.logger.error(`Failed to dispatch event ${event.id} (${event.eventType})`, err);
          this.reportDispatchFailure(event.eventType, event.payload, err);
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: event.attempts + 1 },
          });
        }
        return true;
      }, { timeout: 120_000 });
    } catch (err) {
      this.logger.error('Outbox claim/dispatch transaction error', err);
      return false;
    }
  }

  private reportDispatchFailure(eventType: string, payload: unknown, error: unknown): void {
    if (!this.alerting.isWorkflowEvent(eventType)) return;
    const p = payload as WorkflowResolvedPayload;
    this.alerting.workflowFailure({
      workflowId: p.instanceId,
      entityType: p.entityType,
      entityId: p.entityId,
      eventType,
      error,
    });
    if (this.alerting.isPayrollEntity(p.entityType)) {
      this.alerting.payrollFailure({
        workflowId: p.instanceId,
        entityType: p.entityType,
        entityId: p.entityId,
        eventType,
        error,
      });
    }
  }

  private async checkRetryStorm(): Promise<void> {
    const [pendingBacklog, highAttemptCount] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { processedAt: null } }),
      this.prisma.outboxEvent.count({
        where: { processedAt: null, attempts: { gte: 3 } },
      }),
    ]);

    if (highAttemptCount < this.RETRY_STORM_THRESHOLD) return;

    const now = Date.now();
    if (now - this.lastRetryStormAlertAt < this.RETRY_STORM_COOLDOWN_MS) return;

    this.lastRetryStormAlertAt = now;
    this.alerting.outboxRetryStorm({
      pendingBacklog,
      highAttemptCount,
      threshold: this.RETRY_STORM_THRESHOLD,
    });
  }
}
