// ============================================================================
// modules/reporting/infrastructure/persistence/snapshot.prisma.repository.ts
// SnapshotRepository: correct compound-key upsert (fixes BriefService bug).
// KpiRepository: upsert on unique(company_id, fact_date, metric_key).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  SnapshotRepository, KpiRepository,
  SnapshotRow, SnapshotType, KpiFactInput,
} from '../../domain/repositories/reporting.repository';

// Zero-UUID used as the NULL substitute in the COALESCE unique index
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class PrismaSnapshotRepository implements SnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert by the compound business key:
   *   (COALESCE(company_id, NULL_UUID), snapshot_type, snapshot_date).
   * The DB has a unique index on this combination. We implement upsert via
   * a raw query so we never generate a mismatched UUID as the where clause
   * (the bug that existed in BriefService.saveSnapshot).
   */
  async upsert(input: {
    companyId: string | null;
    snapshotType: SnapshotType;
    snapshotDate: Date;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    payload: Record<string, unknown>;
    actorUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    const result = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO reporting.report_snapshots
         (id, company_id, snapshot_type, snapshot_date, period_start, period_end,
          payload, generated_at, created_at, updated_at, created_by, updated_by)
       VALUES ($1::uuid,$2::uuid,$3::reporting.snapshot_type,$4,$5,$6,$7::jsonb,now(),now(),now(),$8::uuid,$8::uuid)
       ON CONFLICT (COALESCE(company_id,'${NULL_UUID}'::uuid), snapshot_type, snapshot_date)
       DO UPDATE SET
         payload      = EXCLUDED.payload,
         period_start = EXCLUDED.period_start,
         period_end   = EXCLUDED.period_end,
         generated_at = now(),
         updated_at   = now(),
         updated_by   = EXCLUDED.updated_by
       RETURNING id`,
      id,
      input.companyId ?? null,
      input.snapshotType,
      input.snapshotDate,
      input.periodStart ?? null,
      input.periodEnd   ?? null,
      JSON.stringify(input.payload),
      input.actorUserId,
    );
    return result[0]?.id ?? id;
  }

  async findLatest(companyId: string | null, type: SnapshotType): Promise<SnapshotRow | null> {
    const row = await this.prisma.reportSnapshot.findFirst({
      where: {
        companyId: companyId ?? null,
        snapshotType: type,
      },
      orderBy: { snapshotDate: 'desc' },
    });
    return row ? this.toRow(row) : null;
  }

  async findForDate(companyId: string | null, type: SnapshotType, date: Date): Promise<SnapshotRow | null> {
    const row = await this.prisma.reportSnapshot.findFirst({
      where: { companyId: companyId ?? null, snapshotType: type, snapshotDate: date },
    });
    return row ? this.toRow(row) : null;
  }

  async listHistory(companyId: string | null, type: SnapshotType, limit: number): Promise<SnapshotRow[]> {
    const rows = await this.prisma.reportSnapshot.findMany({
      where: { companyId: companyId ?? null, snapshotType: type },
      orderBy: { snapshotDate: 'desc' },
      take: Math.min(limit, 90),
    });
    return rows.map(r => this.toRow(r));
  }

  private toRow(r: any): SnapshotRow {
    return {
      id: r.id,
      companyId: r.companyId,
      snapshotType: r.snapshotType as SnapshotType,
      snapshotDate: r.snapshotDate,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      payload: r.payload as Record<string, unknown>,
      generatedAt: r.generatedAt,
    };
  }
}

@Injectable()
export class PrismaKpiRepository implements KpiRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: KpiFactInput): Promise<void> {
    await this.prisma.kpiDailyFact.upsert({
      where: {
        companyId_factDate_metricKey: {
          companyId: input.companyId,
          factDate: input.factDate,
          metricKey: input.metricKey,
        },
      },
      create: {
        id: randomUUID(),
        companyId: input.companyId,
        factDate: input.factDate,
        metricKey: input.metricKey,
        metricValue: new Prisma.Decimal(input.metricValue),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      update: {
        metricValue: new Prisma.Decimal(input.metricValue),
        updatedBy: input.actorUserId,
      },
    });
  }

  async upsertMany(facts: KpiFactInput[]): Promise<void> {
    // Sequential to avoid unique-constraint races on the same fact_date
    for (const f of facts) await this.upsert(f);
  }

  async get(companyId: string, metricKey: string, date: Date): Promise<number | null> {
    const row = await this.prisma.kpiDailyFact.findUnique({
      where: { companyId_factDate_metricKey: { companyId, factDate: date, metricKey } },
    });
    return row ? Number(row.metricValue) : null;
  }

  async getMany(companyId: string, keys: string[], date: Date): Promise<Record<string, number>> {
    const rows = await this.prisma.kpiDailyFact.findMany({
      where: { companyId, factDate: date, metricKey: { in: keys } },
    });
    const result: Record<string, number> = {};
    for (const r of rows) result[r.metricKey] = Number(r.metricValue);
    return result;
  }

  async trend(companyId: string, metricKey: string, from: Date, to: Date): Promise<Array<{ date: string; value: number }>> {
    const rows = await this.prisma.kpiDailyFact.findMany({
      where: { companyId, metricKey, factDate: { gte: from, lte: to } },
      orderBy: { factDate: 'asc' },
    });
    return rows.map(r => ({
      date: (r.factDate as Date).toISOString().slice(0, 10),
      value: Number(r.metricValue),
    }));
  }
}
