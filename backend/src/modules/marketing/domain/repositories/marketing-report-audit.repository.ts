// ============================================================================
// modules/marketing/domain/repositories/marketing-report-audit.repository.ts
// ============================================================================

import { MarketingReportAuditAction } from '@prisma/client';

export const MARKETING_REPORT_AUDIT_REPOSITORY = Symbol('MARKETING_REPORT_AUDIT_REPOSITORY');

export interface MarketingReportAuditEntry {
  id: string;
  companyId: string;
  reportId: string;
  actorId: string;
  action: MarketingReportAuditAction;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface AppendMarketingReportAuditInput {
  companyId: string;
  reportId: string;
  actorId: string;
  action: MarketingReportAuditAction;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
}

export interface MarketingReportAuditSearchFilters {
  companyId: string;
  reportId?: string;
  employeeId?: string;
  actorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export interface MarketingReportAuditRepository {
  appendMany(entries: AppendMarketingReportAuditInput[]): Promise<void>;
  listByReportId(reportId: string): Promise<MarketingReportAuditEntry[]>;
  search(filters: MarketingReportAuditSearchFilters): Promise<MarketingReportAuditEntry[]>;
}
