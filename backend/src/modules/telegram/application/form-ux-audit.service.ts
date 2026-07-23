// ============================================================================
// UX-001 — Form UX audit & QA metrics
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

export type FormUxEvent =
  | 'form_option_selected'
  | 'manual_input_used'
  | 'validation_failed'
  | 'form_summary_confirmed'
  | 'form_submitted'
  | 'form_cancelled';

@Injectable()
export class FormUxAuditService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async log(
    actor: ActorContext,
    event: FormUxEvent,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.record(actor, {
      entityType: 'FormUxEvent',
      entityId: String(meta.requestId ?? meta.formKey ?? 'telegram'),
      action: event,
      after: meta,
    });
  }

  async getEmployeeFormErrorRate(companyId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        entityType: 'FormUxEvent',
        occurredAt: { gte: since },
      },
      select: { action: true },
    });

    const counts = {
      validationFailed: 0,
      manualInputUsed: 0,
      cancelled: 0,
      submitted: 0,
      optionSelected: 0,
    };

    for (const r of rows) {
      if (r.action === 'validation_failed') counts.validationFailed += 1;
      else if (r.action === 'manual_input_used') counts.manualInputUsed += 1;
      else if (r.action === 'form_cancelled') counts.cancelled += 1;
      else if (r.action === 'form_submitted') counts.submitted += 1;
      else if (r.action === 'form_option_selected') counts.optionSelected += 1;
    }

    const attempts = counts.submitted + counts.cancelled + counts.validationFailed;
    const errorRate = attempts > 0
      ? Math.round((counts.validationFailed / attempts) * 100)
      : 0;

    return {
      companyId,
      periodDays: days,
      validationFailed: counts.validationFailed,
      manualInputUsage: counts.manualInputUsed,
      cancelledForms: counts.cancelled,
      submittedForms: counts.submitted,
      employeeFormErrorRate: errorRate,
    };
  }
}
