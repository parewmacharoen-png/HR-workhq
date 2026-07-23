// ============================================================================
// modules/reporting/application/reporting.service.ts
//
// Design:
//   * generate*()  – live query → builder → snapshot upsert → return payload
//   * get*()       – return latest snapshot (fast, read-only, audit-safe)
//   * Each dashboard is both "real-time" (generate) and "historical" (get).
//   * Multi-company aggregation: owner and executive dashboards iterate all
//     active companies, fetch their metrics, and aggregate server-side.
//   * KPI facts are written alongside every snapshot for trend queries.
//   * BriefService in the Telegram module calls generateMorningBrief /
//     generateEveningBrief here and broadcasts the result.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  SNAPSHOT_REPOSITORY, KPI_REPOSITORY, METRIC_QUERY_REPOSITORY,
  SnapshotRepository, KpiRepository, MetricQueryRepository,
  SnapshotType,
  AttendanceMetrics, WorkflowMetrics, PayrollMetrics,
  FinanceMetrics, HeadcountMetrics, CommissionMetrics,
} from '../domain/repositories/reporting.repository';
import { DashboardBuilderService } from '../domain/services/dashboard-builder.service';
import { KpiKey } from '../domain/entities/metric-keys';
import {
  InvalidDateRangeError, SnapshotNotFoundError,
} from '../domain/errors/reporting.errors';
import { GetTrendQuery } from './dto/reporting.dto';
import { PendingApprovalPayload } from '../domain/entities/dashboard-payloads';
import { CommissionExecutiveDashboardService } from './commission-executive-dashboard.service';

@Injectable()
export class ReportingService {
  private readonly builder = new DashboardBuilderService();
  private readonly SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

  constructor(
    @Inject(SNAPSHOT_REPOSITORY)      private readonly snapshots: SnapshotRepository,
    @Inject(KPI_REPOSITORY)           private readonly kpis: KpiRepository,
    @Inject(METRIC_QUERY_REPOSITORY)  private readonly metrics: MetricQueryRepository,
    private readonly commissionDashboard: CommissionExecutiveDashboardService,
  ) {}

  // ── Morning Brief ─────────────────────────────────────────────────────────

  async generateMorningBrief(companyId: string, date = new Date()): Promise<Record<string, unknown>> {
    const company = await this.requireCompany(companyId);
    const att = await this.metrics.attendance(companyId, date);
    const payload = this.builder.morningBrief(date, company, att) as unknown as Record<string, unknown>;

    await this.saveSnapshotAndKpis(companyId, 'morning_brief', date, payload, [
      { key: KpiKey.ATTENDANCE_TOTAL_EXPECTED, value: att.totalExpected },
      { key: KpiKey.ATTENDANCE_CHECKED_IN,     value: att.checkedIn },
      { key: KpiKey.ATTENDANCE_ABSENT,          value: att.absent },
      { key: KpiKey.ATTENDANCE_LATE,            value: att.lateCount },
      { key: KpiKey.ATTENDANCE_CHECK_IN_RATE,   value: att.checkInRate },
    ]);
    return payload;
  }

  async getMorningBrief(companyId: string): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(companyId, 'morning_brief');
    if (!s) throw new SnapshotNotFoundError('morning_brief', 'latest');
    return s.payload;
  }

  // ── Evening Brief ─────────────────────────────────────────────────────────

  async generateEveningBrief(companyId: string, date = new Date()): Promise<Record<string, unknown>> {
    const company = await this.requireCompany(companyId);
    const [att, wf] = await Promise.all([
      this.metrics.attendance(companyId, date),
      this.metrics.workflows(companyId),
    ]);
    const payload = this.builder.eveningBrief(date, company, att, wf) as unknown as Record<string, unknown>;

    await this.saveSnapshotAndKpis(companyId, 'evening_brief', date, payload, [
      { key: KpiKey.ATTENDANCE_MISSING_CHECKOUT, value: att.missingCheckout },
      { key: KpiKey.OT_PENDING_COUNT,            value: wf.byType['overtime'] ?? 0 },
      { key: KpiKey.ATTENDANCE_ABSENT,            value: att.absent },
      { key: KpiKey.WORKFLOW_PENDING_TOTAL,       value: wf.pendingTotal },
      { key: KpiKey.LEAVE_PENDING_COUNT,          value: wf.byType['leave'] ?? 0 },
    ]);
    return payload;
  }

  async getEveningBrief(companyId: string): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(companyId, 'evening_brief');
    if (!s) throw new SnapshotNotFoundError('evening_brief', 'latest');
    return s.payload;
  }

  // ── Company Dashboard ─────────────────────────────────────────────────────

  async generateCompanyDashboard(companyId: string, date = new Date()): Promise<Record<string, unknown>> {
    const company = await this.requireCompany(companyId);
    const period = this.currentPeriod(date);

    const [att, wf, pay, fin, hc, com] = await Promise.all([
      this.metrics.attendance(companyId, date),
      this.metrics.workflows(companyId),
      this.metrics.payroll(companyId),
      this.metrics.finance(companyId, period.start, period.end),
      this.metrics.headcount(companyId, date),
      this.metrics.commission(companyId),
    ]);

    const payload = this.builder.companyDashboard(date, company, att, wf, pay, fin, hc, com, period) as unknown as Record<string, unknown>;

    await this.saveSnapshotAndKpis(companyId, 'company', date, payload, [
      { key: KpiKey.HEADCOUNT_ACTIVE,         value: hc.active },
      { key: KpiKey.ATTENDANCE_CHECK_IN_RATE, value: att.checkInRate },
      { key: KpiKey.WORKFLOW_PENDING_TOTAL,   value: wf.pendingTotal },
      { key: KpiKey.PAYROLL_TOTAL_GROSS,      value: pay.totalGross },
      { key: KpiKey.FINANCE_REVENUE_POSTED,   value: fin.revenuePosted },
      { key: KpiKey.FINANCE_EXPENSE_POSTED,   value: fin.expensePosted },
      { key: KpiKey.FINANCE_NET,              value: fin.net },
      { key: KpiKey.COMMISSION_ON_HOLD,       value: com.onHoldCount },
    ]);
    return payload;
  }

  async getCompanyDashboard(companyId: string): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(companyId, 'company');
    if (!s) return this.generateCompanyDashboard(companyId);
    return s.payload;
  }

  // ── Owner Dashboard (cross-company) ──────────────────────────────────────

  async generateOwnerDashboard(date = new Date()): Promise<Record<string, unknown>> {
    const companies = await this.metrics.listActiveCompanies();
    const period = this.currentPeriod(date);
    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const perCompany = await Promise.all(
      companies.map(async (company) => ({
        company,
        att: await this.metrics.attendance(company.id, date),
        wf:  await this.metrics.workflows(company.id),
        fin: await this.metrics.finance(company.id, period.start, period.end),
        hc:  await this.metrics.headcount(company.id, date),
      })),
    );

    const leaveReschedule = await this.metrics.leaveReschedules(null, monthStart, monthEnd);
    const commissionDashboard = await this.commissionDashboard.getOwnerDashboardBlock(date);
    const payload = this.builder.ownerDashboard(date, perCompany, leaveReschedule, commissionDashboard) as unknown as Record<string, unknown>;
    // null companyId = cross-company snapshot
    await this.snapshots.upsert({
      companyId: null,
      snapshotType: 'owner',
      snapshotDate: date,
      payload,
      actorUserId: this.SYSTEM_ACTOR,
    });
    return payload;
  }

  async getOwnerDashboard(): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(null, 'owner');
    if (!s) return this.generateOwnerDashboard();
    return s.payload;
  }

  // ── Executive Dashboard ───────────────────────────────────────────────────

  async generateExecutiveDashboard(date = new Date()): Promise<Record<string, unknown>> {
    const companies = await this.metrics.listActiveCompanies();
    const period = this.currentPeriod(date);

    // Sum all-company metrics
    const allMetrics = await Promise.all(companies.map(async (c) => ({
      att: await this.metrics.attendance(c.id, date),
      pay: await this.metrics.payroll(c.id),
      fin: await this.metrics.finance(c.id, period.start, period.end),
      hc:  await this.metrics.headcount(c.id, date),
      com: await this.metrics.commission(c.id),
    })));

    const wf = await this.metrics.workflows(null);

    const att = this.sumAttendance(allMetrics.map(m => m.att));
    const pay = this.sumPayroll(allMetrics.map(m => m.pay));
    const fin = this.sumFinance(allMetrics.map(m => m.fin));
    const hc  = this.sumHeadcount(allMetrics.map(m => m.hc));
    const com = this.sumCommission(allMetrics.map(m => m.com));

    const payload = this.builder.executiveDashboard(date, period, att, pay, fin, hc, com, wf) as unknown as Record<string, unknown>;

    await this.saveSnapshotAndKpis(null, 'executive', date, payload, [
      { key: KpiKey.HEADCOUNT_ACTIVE,         value: hc.active },
      { key: KpiKey.ATTENDANCE_CHECK_IN_RATE, value: att.checkInRate },
      { key: KpiKey.WORKFLOW_PENDING_TOTAL,   value: wf.pendingTotal },
      { key: KpiKey.PAYROLL_TOTAL_GROSS,      value: pay.totalGross },
      { key: KpiKey.FINANCE_REVENUE_POSTED,   value: fin.revenuePosted },
      { key: KpiKey.FINANCE_EXPENSE_POSTED,   value: fin.expensePosted },
      { key: KpiKey.FINANCE_NET,              value: fin.net },
    ]);
    return payload;
  }

  async getExecutiveDashboard(): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(null, 'executive');
    if (!s) return this.generateExecutiveDashboard();
    return s.payload;
  }

  // ── Risk Dashboard ─────────────────────────────────────────────────────────

  async generateRiskDashboard(companyId: string | null, date = new Date()): Promise<Record<string, unknown>> {
    const company = companyId ? await this.requireCompany(companyId) : null;
    const period = this.currentPeriod(date);

    const companies = companyId ? [company!] : await this.metrics.listActiveCompanies();
    let att: AttendanceMetrics, wf: WorkflowMetrics, fin: FinanceMetrics,
      hc: HeadcountMetrics, com: CommissionMetrics;

    if (companies.length === 1) {
      [att, wf, fin, hc, com] = await Promise.all([
        this.metrics.attendance(companies[0].id, date),
        this.metrics.workflows(companies[0].id),
        this.metrics.finance(companies[0].id, period.start, period.end),
        this.metrics.headcount(companies[0].id, date),
        this.metrics.commission(companies[0].id),
      ]);
    } else {
      const all = await Promise.all(companies.map(async (c) => ({
        att: await this.metrics.attendance(c.id, date),
        fin: await this.metrics.finance(c.id, period.start, period.end),
        hc:  await this.metrics.headcount(c.id, date),
        com: await this.metrics.commission(c.id),
      })));
      att = this.sumAttendance(all.map(m => m.att));
      fin = this.sumFinance(all.map(m => m.fin));
      hc  = this.sumHeadcount(all.map(m => m.hc));
      com = this.sumCommission(all.map(m => m.com));
      wf  = await this.metrics.workflows(null);
    }

    const payload = this.builder.riskDashboard(
      date, companyId, company?.name ?? null, att!, wf!, com!, hc!, fin!,
    ) as unknown as Record<string, unknown>;

    await this.snapshots.upsert({
      companyId,
      snapshotType: 'risk',
      snapshotDate: date,
      payload,
      actorUserId: this.SYSTEM_ACTOR,
    });
    return payload;
  }

  async getRiskDashboard(companyId: string | null): Promise<Record<string, unknown>> {
    const s = await this.snapshots.findLatest(companyId, 'risk');
    if (!s) return this.generateRiskDashboard(companyId);
    return s.payload;
  }

  // ── Pending Approval Dashboard ─────────────────────────────────────────────

  async generatePendingApprovalDashboard(companyId: string | null, date = new Date()): Promise<Record<string, unknown>> {
    const company = companyId ? await this.requireCompany(companyId) : null;
    const wf = await this.metrics.workflows(companyId);
    const items = await this.getPendingItems(companyId);

    const payload = this.builder.pendingApprovalDashboard(
      date, companyId, company?.name ?? null, wf, items,
    ) as unknown as Record<string, unknown>;

    await this.snapshots.upsert({
      companyId,
      snapshotType: 'pending_approval',
      snapshotDate: date,
      payload,
      actorUserId: this.SYSTEM_ACTOR,
    });
    return payload;
  }

  async getPendingApprovalDashboard(companyId: string | null): Promise<Record<string, unknown>> {
    // Always generate fresh — approval counts change minute-by-minute.
    return this.generatePendingApprovalDashboard(companyId);
  }

  // ── KPI trend query ────────────────────────────────────────────────────────

  async getKpiTrend(metricKey: string, query: GetTrendQuery) {
    if (new Date(query.from) > new Date(query.to)) throw new InvalidDateRangeError();
    // Use system company as proxy when companyId not given (executive trend)
    const companies = query.companyId
      ? [{ id: query.companyId }]
      : await this.metrics.listActiveCompanies();

    if (companies.length === 1) {
      return this.kpis.trend(companies[0].id, metricKey, new Date(query.from), new Date(query.to));
    }
    // Multi-company: return per-company trends
    return Promise.all(
      companies.map(async (c) => ({
        companyId: c.id,
        trend: await this.kpis.trend(c.id, metricKey, new Date(query.from), new Date(query.to)),
      })),
    );
  }

  // ── Snapshot history ───────────────────────────────────────────────────────

  async getSnapshotHistory(companyId: string | null, type: string, limit = 30) {
    return this.snapshots.listHistory(companyId, type as SnapshotType, limit);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async requireCompany(id: string): Promise<{ id: string; name: string }> {
    const companies = await this.metrics.listActiveCompanies();
    const c = companies.find(x => x.id === id);
    if (!c) throw new Error(`Company ${id} not found`);
    return c;
  }

  private async saveSnapshotAndKpis(
    companyId: string | null,
    type: string,
    date: Date,
    payload: Record<string, unknown>,
    facts: Array<{ key: string; value: number }>,
  ): Promise<void> {
    await this.snapshots.upsert({
      companyId,
      snapshotType: type as SnapshotType,
      snapshotDate: date,
      payload,
      actorUserId: this.SYSTEM_ACTOR,
    });
    if (companyId) {
      await this.kpis.upsertMany(facts.map(f => ({
        companyId: companyId!,
        factDate: date,
        metricKey: f.key,
        metricValue: f.value,
        actorUserId: this.SYSTEM_ACTOR,
      })));
    }
  }

  private async getPendingItems(companyId: string | null): Promise<PendingApprovalPayload['items']> {
    const items = await this.metrics.pendingWorkflowItems(companyId);
    return items;
  }

  /** Payroll cycles run 25th→23rd; return the current open period dates. */
  private currentPeriod(date: Date): { start: Date; end: Date } {
    const d = new Date(date);
    const day = d.getDate();
    const year = d.getFullYear();
    const month = d.getMonth();
    const start = day >= 25
      ? new Date(year, month, 25)
      : new Date(year, month - 1, 25);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(23);
    return { start, end };
  }

  // ── Metric aggregators (pure sum across companies) ─────────────────────────

  private sumAttendance(arr: AttendanceMetrics[]): AttendanceMetrics {
    const s = arr.reduce((a, b) => ({
      totalExpected: a.totalExpected + b.totalExpected,
      checkedIn: a.checkedIn + b.checkedIn,
      checkedOut: a.checkedOut + b.checkedOut,
      absent: a.absent + b.absent,
      lateCount: a.lateCount + b.lateCount,
      missingCheckout: a.missingCheckout + b.missingCheckout,
      checkInRate: 0,
    }), { totalExpected: 0, checkedIn: 0, checkedOut: 0, absent: 0, lateCount: 0, missingCheckout: 0, checkInRate: 0 });
    s.checkInRate = s.totalExpected > 0 ? Math.round((s.checkedIn / s.totalExpected) * 10000) / 100 : 0;
    return s;
  }

  private sumPayroll(arr: PayrollMetrics[]): PayrollMetrics {
    return arr.reduce((a, b) => ({
      cycleStatus: a.cycleStatus ?? b.cycleStatus,
      totalGross: this.r2(a.totalGross + b.totalGross),
      totalNet: this.r2(a.totalNet + b.totalNet),
    }), { cycleStatus: null, totalGross: 0, totalNet: 0 });
  }

  private sumFinance(arr: FinanceMetrics[]): FinanceMetrics {
    return arr.reduce((a, b) => ({
      revenuePosted: this.r2(a.revenuePosted + b.revenuePosted),
      expensePosted: this.r2(a.expensePosted + b.expensePosted),
      net: this.r2(a.net + b.net),
      advancePending: a.advancePending + b.advancePending,
    }), { revenuePosted: 0, expensePosted: 0, net: 0, advancePending: 0 });
  }

  private sumHeadcount(arr: HeadcountMetrics[]): HeadcountMetrics {
    return arr.reduce((a, b) => ({
      active: a.active + b.active,
      probation: a.probation + b.probation,
      terminatedMtd: a.terminatedMtd + b.terminatedMtd,
    }), { active: 0, probation: 0, terminatedMtd: 0 });
  }

  private sumCommission(arr: CommissionMetrics[]): CommissionMetrics {
    const s = arr.reduce((a, b) => ({
      onHoldCount: a.onHoldCount + b.onHoldCount,
      qualifiedRateSum: a.qualifiedRateSum + b.qualifiedRate,
    }), { onHoldCount: 0, qualifiedRateSum: 0 });
    return {
      onHoldCount: s.onHoldCount,
      qualifiedRate: arr.length > 0 ? this.r2(s.qualifiedRateSum / arr.length) : 0,
    };
  }

  private r2(n: number): number { return Math.round(n * 100) / 100; }
}
