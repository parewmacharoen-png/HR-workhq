// ============================================================================
// common/monitoring/metrics.service.ts
// Prometheus metrics refreshed on each scrape.
// ============================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Gauge, Registry, collectDefaultMetrics } from 'prom-client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  private readonly activeUsers = new Gauge({
    name: 'workhq_active_users',
    help: 'Count of active human users',
    registers: [this.registry],
  });
  private readonly pendingWorkflows = new Gauge({
    name: 'workhq_pending_workflows',
    help: 'Count of pending workflow instances',
    registers: [this.registry],
  });
  private readonly payrollCyclesOpen = new Gauge({
    name: 'workhq_payroll_cycles_open',
    help: 'Count of open payroll cycles',
    registers: [this.registry],
  });
  private readonly payrollCyclesTotal = new Gauge({
    name: 'workhq_payroll_cycles_total',
    help: 'Total payroll cycles',
    registers: [this.registry],
  });
  private readonly outboxPending = new Gauge({
    name: 'workhq_outbox_events_pending',
    help: 'Unprocessed outbox events',
    registers: [this.registry],
  });
  private readonly outboxHighAttempts = new Gauge({
    name: 'workhq_outbox_events_high_attempts',
    help: 'Pending outbox events with 3+ attempts',
    registers: [this.registry],
  });
  private readonly telegramMessages = new Gauge({
    name: 'workhq_telegram_messages_processed_total',
    help: 'Total telegram messages logged',
    registers: [this.registry],
  });

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.registry.setDefaultLabels({ service: 'workhq-api' });
    collectDefaultMetrics({ register: this.registry, prefix: 'workhq_' });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    const [
      activeUsers,
      pendingWorkflows,
      payrollCyclesOpen,
      payrollCyclesTotal,
      outboxPending,
      outboxHighAttempts,
      telegramMessages,
    ] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.workflowInstance.count({ where: { status: 'pending' } }),
      this.prisma.payrollCycle.count({ where: { status: 'open', deletedAt: null } }),
      this.prisma.payrollCycle.count({ where: { deletedAt: null } }),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }),
      this.prisma.outboxEvent.count({
        where: { processedAt: null, attempts: { gte: 3 } },
      }),
      this.prisma.telegramMessageLog.count(),
    ]);

    this.activeUsers.set(activeUsers);
    this.pendingWorkflows.set(pendingWorkflows);
    this.payrollCyclesOpen.set(payrollCyclesOpen);
    this.payrollCyclesTotal.set(payrollCyclesTotal);
    this.outboxPending.set(outboxPending);
    this.outboxHighAttempts.set(outboxHighAttempts);
    this.telegramMessages.set(telegramMessages);

    return this.registry.metrics();
  }
}
