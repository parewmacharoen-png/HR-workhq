// ============================================================================
// MarketingReportAuditService — field-level marketing report audit trail
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { MarketingReportAuditAction } from '@prisma/client';
import {
  AppendMarketingReportAuditInput,
  MARKETING_REPORT_AUDIT_REPOSITORY,
  MarketingReportAuditEntry,
  MarketingReportAuditRepository,
  MarketingReportAuditSearchFilters,
} from '../domain/repositories/marketing-report-audit.repository';
import { MarketingDailyReportRow } from '../domain/repositories/marketing-daily-report.repository';

const TRACKED_FIELDS = [
  'contactedCount',
  'newMemberCount',
  'depositAmount',
  'startedWorkCount',
  'note',
  'status',
] as const;

type TrackedField = typeof TRACKED_FIELDS[number];

@Injectable()
export class MarketingReportAuditService {
  constructor(
    @Inject(MARKETING_REPORT_AUDIT_REPOSITORY)
    private readonly audit: MarketingReportAuditRepository,
  ) {}

  async logAction(input: AppendMarketingReportAuditInput): Promise<void> {
    await this.audit.appendMany([input]);
  }

  async logFieldChanges(input: {
    companyId: string;
    reportId: string;
    actorId: string;
    action: MarketingReportAuditAction;
    reason?: string | null;
    before: MarketingDailyReportRow;
    after: MarketingDailyReportRow;
  }): Promise<void> {
    const entries: AppendMarketingReportAuditInput[] = [];

    for (const field of TRACKED_FIELDS) {
      const oldValue = serializeField(field, input.before);
      const newValue = serializeField(field, input.after);
      if (oldValue === newValue) continue;
      entries.push({
        companyId: input.companyId,
        reportId: input.reportId,
        actorId: input.actorId,
        action: input.action,
        fieldName: field,
        oldValue,
        newValue,
        reason: input.reason ?? null,
      });
    }

    await this.audit.appendMany(entries);
  }

  listByReportId(reportId: string): Promise<MarketingReportAuditEntry[]> {
    return this.audit.listByReportId(reportId);
  }

  search(filters: MarketingReportAuditSearchFilters): Promise<MarketingReportAuditEntry[]> {
    return this.audit.search(filters);
  }
}

function serializeField(field: TrackedField, row: MarketingDailyReportRow): string {
  const value = row[field];
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value);
}
