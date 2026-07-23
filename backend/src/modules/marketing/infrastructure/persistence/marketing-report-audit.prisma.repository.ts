// ============================================================================
// modules/marketing/infrastructure/persistence/marketing-report-audit.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  AppendMarketingReportAuditInput,
  MarketingReportAuditEntry,
  MarketingReportAuditRepository,
  MarketingReportAuditSearchFilters,
} from '../../domain/repositories/marketing-report-audit.repository';

@Injectable()
export class PrismaMarketingReportAuditRepository implements MarketingReportAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async appendMany(entries: AppendMarketingReportAuditInput[]): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.marketingReportAuditLog.createMany({
      data: entries.map((entry) => ({
        id: randomUUID(),
        companyId: entry.companyId,
        reportId: entry.reportId,
        actorId: entry.actorId,
        action: entry.action,
        fieldName: entry.fieldName ?? null,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
        reason: entry.reason ?? null,
      })),
    });
  }

  async listByReportId(reportId: string): Promise<MarketingReportAuditEntry[]> {
    const rows = await this.prisma.marketingReportAuditLog.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.map(row));
  }

  async search(filters: MarketingReportAuditSearchFilters): Promise<MarketingReportAuditEntry[]> {
    const where: {
      companyId: string;
      reportId?: string;
      actorId?: string;
      createdAt?: { gte?: Date; lte?: Date };
      report?: { employeeId?: string };
    } = { companyId: filters.companyId };

    if (filters.reportId) where.reportId = filters.reportId;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.employeeId) {
      where.report = { employeeId: filters.employeeId };
    }

    const rows = await this.prisma.marketingReportAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 200,
    });
    return rows.map((row) => this.map(row));
  }

  private map(row: {
    id: string;
    companyId: string;
    reportId: string;
    actorId: string;
    action: MarketingReportAuditEntry['action'];
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: Date;
  }): MarketingReportAuditEntry {
    return {
      id: row.id,
      companyId: row.companyId,
      reportId: row.reportId,
      actorId: row.actorId,
      action: row.action,
      fieldName: row.fieldName,
      oldValue: row.oldValue,
      newValue: row.newValue,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }
}
