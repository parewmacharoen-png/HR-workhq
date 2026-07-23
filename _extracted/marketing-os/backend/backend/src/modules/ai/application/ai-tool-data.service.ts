// ============================================================================
// modules/ai/application/ai-tool-data.service.ts
// Read-only WorkHQ data queries backing AI tools.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ReportingService } from '../../reporting/application/reporting.service';
import { CommissionExecutiveDashboardService } from '../../reporting/application/commission-executive-dashboard.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import { EmployeeSelfServiceQueryService } from './employee-self-service-query.service';
import { AiToolContextService } from './ai-tool-context.service';
import { AiToolExecutionContext, AiToolName } from '../domain/tool.types';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { MarketingKpiQueryService } from '../../marketing/application/marketing-kpi-query.service';
import { MarketingBackOfficeService } from '../../marketing/application/marketing-backoffice.service';
import { MarketingExpenseService } from '../../marketing/application/marketing-expense.service';
import { MarketingInsightService } from '../../marketing/application/marketing-insight.service';
import { CommissionFinalizationService } from '../../commission/application/commission-finalization.service';
import { CommissionAdjustmentService } from '../../commission/application/commission-adjustment.service';
import { ExecutiveInsightService } from '../../reporting/application/executive-insight.service';
import { CommissionCycleType } from '../../commission/domain/repositories/commission-finalization.repository';

@Injectable()
export class AiToolDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingService,
    private readonly commissionDashboard: CommissionExecutiveDashboardService,
    private readonly context: AiToolContextService,
    private readonly rag: RagRetrievalService,
    private readonly selfService: EmployeeSelfServiceQueryService,
    private readonly marketingKpi: MarketingKpiQueryService,
    private readonly marketingBackOffice: MarketingBackOfficeService,
    private readonly marketingExpenses: MarketingExpenseService,
    private readonly marketingInsights: MarketingInsightService,
    private readonly commissionFinalization: CommissionFinalizationService,
    private readonly commissionAdjustments: CommissionAdjustmentService,
    private readonly executiveInsights: ExecutiveInsightService,
  ) {}

  async fetch(
    toolName: AiToolName,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown> = {},
    actor?: ActorContext,
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_employee_profile': return this.employeeProfile(ctx);
      case 'get_leave_balance': return this.leaveBalance(ctx);
      case 'get_attendance_summary': return this.attendanceSummary(ctx);
      case 'get_latest_payslip': return this.payslipLatest(ctx);
      case 'get_commission_summary': return this.commissionSummary(ctx);
      case 'get_referral_summary': return this.referralSummary(ctx);
      case 'get_my_profile': return this.selfService.getMyProfile(ctx);
      case 'get_my_leave_balance': return this.selfService.getMyLeaveBalance(ctx);
      case 'get_my_leave_history': return this.selfService.getMyLeaveHistory(ctx);
      case 'get_my_attendance_summary': return this.selfService.getMyAttendanceSummary(ctx);
      case 'get_my_late_statistics': return this.selfService.getMyLateStatistics(ctx);
      case 'get_my_ot_summary': return this.selfService.getMyOtSummary(ctx);
      case 'get_my_latest_payslip': return this.selfService.getMyLatestPayslip(ctx);
      case 'get_my_payroll_summary': return this.selfService.getMyPayrollSummary(ctx);
      case 'get_my_commission': return this.selfService.getMyCommission(ctx);
      case 'get_my_commission_history': return this.selfService.getMyCommissionHistory(ctx);
      case 'get_my_referrals': return this.selfService.getMyReferrals(ctx);
      case 'get_my_marketing_kpi': return this.myMarketingKpi(actor, ctx, input);
      case 'get_my_latest_marketing_report': return this.myLatestMarketingReport(actor, ctx);
      case 'get_team_marketing_kpi': return this.teamMarketingKpi(actor, ctx, input);
      case 'get_company_marketing_kpi': return this.companyMarketingKpi(actor, ctx, input);
      case 'get_marketing_report_audit': return this.marketingReportAudit(actor, input);
      case 'get_my_marketing_expenses': return this.myMarketingExpenses(actor, ctx, input);
      case 'get_team_marketing_expenses': return this.teamMarketingExpenses(actor, ctx, input);
      case 'get_company_marketing_expenses': return this.companyMarketingExpenses(actor, ctx, input);
      case 'get_marketing_roi': return this.marketingRoi(actor, ctx, input);
      case 'get_marketing_performance_insights': return this.marketingPerformanceInsights(actor, ctx, input);
      case 'get_marketing_risk_alerts': return this.marketingRiskAlerts(actor, ctx, input);
      case 'get_marketing_forecast': return this.marketingForecast(actor, ctx, input);
      case 'get_marketing_team_comparison': return this.marketingTeamComparison(actor, ctx, input);
      case 'get_team_attendance': return this.teamAttendance(ctx);
      case 'get_team_leave_requests': return this.teamLeaveRequests(ctx);
      case 'get_team_ot_requests': return this.teamOtRequests(ctx);
      case 'get_team_performance_summary': return this.teamPerformanceSummary(ctx);
      case 'get_company_dashboard': return this.companyDashboard(ctx);
      case 'get_finance_summary': return this.financeSummary(ctx);
      case 'get_payroll_summary': return this.payrollSummary(ctx);
      case 'get_recruitment_summary': return this.recruitmentSummary(ctx);
      case 'get_risk_summary': return this.riskSummary(ctx);
      case 'get_executive_summary': return this.executiveSummary(actor, ctx, input);
      case 'get_executive_risks': return this.executiveRisks(actor, ctx, input);
      case 'get_executive_forecast': return this.executiveForecast(actor, ctx, input);
      case 'get_executive_recommendations': return this.executiveRecommendations(actor, ctx, input);
      case 'get_commission_dashboard': return this.commissionDashboardTool(actor, ctx, input);
      case 'get_commission_cycle_status': return this.commissionCycleStatusTool(actor, ctx, input);
      case 'get_commission_preview': return this.commissionPreviewTool(actor, ctx, input);
      case 'get_commission_adjustments': return this.commissionAdjustmentsTool(actor, ctx, input);
      case 'get_commission_adjustment_history': return this.commissionAdjustmentHistoryTool(actor, ctx, input);
      case 'get_company_profit_ranking': return this.companyProfitRanking(ctx);
      case 'get_team_performance_rankings': return this.teamPerformanceRankings(ctx, input);
      case 'search_company_knowledge': return this.searchCompanyKnowledge(ctx, input);
      default:
        throw new Error(`Unhandled tool: ${toolName}`);
    }
  }

  private periodStartOf(date: Date): Date {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 25));
    if (date.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
    return start;
  }

  private todayDate(): { iso: string; date: Date } {
    const iso = new Date().toISOString().slice(0, 10);
    return { iso, date: new Date(`${iso}T00:00:00.000Z`) };
  }

  private async resolveOpenEarnCycleId(companyId: string): Promise<string | null> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ['open', 'locked'] },
      },
      orderBy: { periodStart: 'desc' },
    });
    return cycle?.id ?? null;
  }

  private async employeeProfile(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const employee = await this.prisma.employee.findFirst({
      where: { id: ctx.employeeId, deletedAt: null },
      select: {
        globalId: true,
        firstName: true,
        lastName: true,
        email: true,
        hireDate: true,
        employmentStatus: true,
      },
    });
    if (!employee) return { error: 'Employee record not found' };

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: ctx.employeeId,
        companyId: ctx.companyId,
        effectiveTo: null,
        deletedAt: null,
      },
      include: {
        company: { select: { code: true, name: true } },
        team: { select: { name: true } },
      },
    });

    return {
      globalId: employee.globalId,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.email,
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      employmentStatus: employee.employmentStatus,
      company: assignment?.company ?? null,
      teamName: assignment?.team?.name ?? null,
      roleLevel: assignment?.roleLevel ?? null,
    };
  }

  private async leaveBalance(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const types = await this.prisma.leaveType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    const periodStart = this.periodStartOf(new Date());

    const balances = await Promise.all(types.map(async (type) => {
      const row = await this.prisma.leaveBalance.findFirst({
        where: {
          employeeId: ctx.employeeId!,
          leaveTypeId: type.id,
          periodStart,
          deletedAt: null,
        },
      });
      return {
        leaveTypeCode: type.code,
        leaveTypeName: type.name,
        entitled: row ? Number(row.entitled) : 0,
        used: row ? Number(row.used) : 0,
        borrowed: row ? Number(row.borrowed) : 0,
        remaining: row ? Number(row.remaining) : 0,
        periodStart: periodStart.toISOString().slice(0, 10),
      };
    }));

    return { companyId: ctx.companyId, balances };
  }

  private async attendanceSummary(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { iso, date } = this.todayDate();

    const [todayRecord, monthRecords] = await Promise.all([
      this.prisma.attendanceRecord.findFirst({
        where: {
          employeeId: ctx.employeeId,
          companyId: ctx.companyId,
          workDate: date,
          deletedAt: null,
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          employeeId: ctx.employeeId,
          companyId: ctx.companyId,
          workDate: { gte: monthStart, lte: date },
          deletedAt: null,
        },
      }),
    ]);

    const today = todayRecord
      ? {
          workDate: iso,
          checkInAt: todayRecord.checkInAt?.toISOString() ?? null,
          checkOutAt: todayRecord.checkOutAt?.toISOString() ?? null,
          workedMinutes: todayRecord.workedMinutes,
          lateMinutes: todayRecord.lateMinutes,
          status: todayRecord.status,
        }
      : { workDate: iso, status: 'no_record', message: 'No attendance record for today' };

    const checkedInDays = monthRecords.filter((r) => r.checkInAt).length;
    const lateDays = monthRecords.filter((r) => r.lateMinutes > 0).length;
    const totalLateMinutes = monthRecords.reduce((a, r) => a + r.lateMinutes, 0);

    return {
      today,
      monthToDate: {
        month: monthStart.toISOString().slice(0, 7),
        checkedInDays,
        lateDays,
        totalLateMinutes,
        recordCount: monthRecords.length,
      },
    };
  }

  private async payslipLatest(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const payslip = await this.prisma.payslip.findFirst({
      where: {
        employeeId: ctx.employeeId,
        deletedAt: null,
        payrollCycle: { companyId: ctx.companyId, deletedAt: null },
      },
      orderBy: { generatedAt: 'desc' },
      include: { payrollCycle: true },
    });

    if (!payslip) return { message: 'No payslip found' };

    return {
      periodStart: payslip.payrollCycle.periodStart.toISOString().slice(0, 10),
      periodEnd: payslip.payrollCycle.periodEnd.toISOString().slice(0, 10),
      gross: Number(payslip.gross),
      deductions: Number(payslip.deductions),
      net: Number(payslip.net),
      cycleStatus: payslip.payrollCycle.status,
    };
  }

  private async commissionSummary(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId: ctx.companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });

    const baseWhere = {
      employeeId: ctx.employeeId,
      companyId: ctx.companyId,
      deletedAt: null,
      ...(cycle ? { earnCycleId: cycle.id } : {}),
    };

    const [pending, qualified, hold] = await Promise.all([
      this.prisma.commissionRecord.findMany({
        where: { ...baseWhere, status: 'accrued', qualified: false },
        select: { grossAmount: true },
      }),
      this.prisma.commissionRecord.findMany({
        where: { ...baseWhere, qualified: true, status: { not: 'paid' } },
        select: { grossAmount: true },
      }),
      this.prisma.commissionRecord.findMany({
        where: { ...baseWhere, status: 'hold' },
        select: { grossAmount: true },
      }),
    ]);

    const sum = (rows: { grossAmount: unknown }[]) =>
      rows.reduce((a, r) => a + Number(r.grossAmount), 0);

    return {
      cycleLabel: cycle
        ? `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`
        : null,
      pendingCount: pending.length,
      qualifiedCount: qualified.length,
      holdCount: hold.length,
      pendingAmount: sum(pending),
      qualifiedAmount: sum(qualified),
      holdAmount: sum(hold),
    };
  }

  private async referralSummary(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const base = { referrerEmployeeId: ctx.employeeId, companyId: ctx.companyId, deletedAt: null };
    const [pending, qualified, paid] = await Promise.all([
      this.prisma.referral.findMany({ where: { ...base, status: 'pending' }, select: { rewardAmount: true } }),
      this.prisma.referral.findMany({ where: { ...base, status: 'qualified' }, select: { rewardAmount: true } }),
      this.prisma.referral.findMany({ where: { ...base, status: 'paid' }, select: { rewardAmount: true } }),
    ]);
    const sum = (rows: { rewardAmount: unknown }[]) =>
      rows.reduce((a, r) => a + Number(r.rewardAmount), 0);

    return {
      pendingCount: pending.length,
      qualifiedCount: qualified.length,
      paidCount: paid.length,
      pendingReward: sum(pending),
      qualifiedReward: sum(qualified),
      paidReward: sum(paid),
    };
  }

  private async teamBuckets(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return null;
    const teamId = await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return null;

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    const members = assignments.map((a) => ({
      id: a.employee.id,
      name: `${a.employee.firstName} ${a.employee.lastName}`.trim(),
    }));
    const memberIds = members.map((m) => m.id);
    const nameById = new Map(members.map((m) => [m.id, m.name]));

    const { iso, date } = this.todayDate();
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId: { in: memberIds }, workDate: date, deletedAt: null },
    });
    const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

    const notCheckedIn: Array<{ name: string }> = [];
    const notCheckedOut: Array<{ name: string }> = [];
    const lateArrivals: Array<{ name: string; lateMinutes: number }> = [];

    for (const id of memberIds) {
      const name = nameById.get(id) ?? id;
      const rec = byEmployee.get(id);
      if (!rec?.checkInAt) {
        notCheckedIn.push({ name });
        continue;
      }
      if (!rec.checkOutAt) notCheckedOut.push({ name });
      if (rec.lateMinutes > 0) lateArrivals.push({ name, lateMinutes: rec.lateMinutes });
    }

    return {
      date: iso,
      teamSize: memberIds.length,
      checkedIn: memberIds.length - notCheckedIn.length,
      notCheckedIn,
      notCheckedOut,
      lateArrivals,
    };
  }

  private async teamAttendance(ctx: AiToolExecutionContext) {
    const buckets = await this.teamBuckets(ctx);
    if (!buckets) return { error: 'User is not a team leader or has no team scope' };
    return {
      date: buckets.date,
      teamSize: buckets.teamSize,
      checkedIn: buckets.checkedIn,
      notCheckedInCount: buckets.notCheckedIn.length,
      notCheckedOutCount: buckets.notCheckedOut.length,
      lateCount: buckets.lateArrivals.length,
      lateArrivals: buckets.lateArrivals,
      notCheckedIn: buckets.notCheckedIn,
    };
  }

  private async teamLeaveRequests(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };
    const teamId = await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return { error: 'User is not a team leader or has no team scope' };

    const members = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    const memberIds = members.map((m) => m.employeeId);

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: memberIds },
        companyId: ctx.companyId,
        status: 'pending',
        deletedAt: null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 20,
    });

    return {
      pendingCount: requests.length,
      requests: requests.map((r) => ({
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
        leaveType: r.leaveType.name,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        days: Number(r.days),
        reason: r.reason,
      })),
    };
  }

  private async teamOtRequests(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };
    const teamId = await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return { error: 'User is not a team leader or has no team scope' };

    const members = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    const memberIds = members.map((m) => m.employeeId);

    const requests = await this.prisma.overtimeRecord.findMany({
      where: {
        employeeId: { in: memberIds },
        companyId: ctx.companyId,
        status: 'pending',
        deletedAt: null,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { workDate: 'asc' },
      take: 20,
    });

    return {
      pendingCount: requests.length,
      requests: requests.map((r) => ({
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
        workDate: r.workDate.toISOString().slice(0, 10),
        otHours: Number(r.otHours),
        amount: Number(r.amount),
        status: r.status,
      })),
    };
  }

  private async teamPerformanceSummary(ctx: AiToolExecutionContext) {
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };
    const teamId = await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return { error: 'User is not a team leader or has no team scope' };

    const members = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    const memberIds = members.map((m) => m.employeeId);

    const cycle = await this.prisma.performanceCycle.findFirst({
      where: {
        OR: [{ companyId: ctx.companyId }, { companyId: null }],
        status: 'open',
        deletedAt: null,
      },
      orderBy: { periodStart: 'desc' },
    });

    if (!cycle) {
      return { message: 'No open performance cycle', teamSize: memberIds.length };
    }

    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        performanceCycleId: cycle.id,
        employeeId: { in: memberIds },
        companyId: ctx.companyId,
        deletedAt: null,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { totalScore: 'desc' },
    });

    return {
      cycleLabel: `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`,
      teamSize: memberIds.length,
      evaluatedCount: evaluations.length,
      evaluations: evaluations.map((e) => ({
        employeeName: `${e.employee.firstName} ${e.employee.lastName}`.trim(),
        totalScore: Number(e.totalScore),
        status: e.status,
      })),
    };
  }

  private async companyDashboard(ctx: AiToolExecutionContext) {
    if (ctx.companyId) {
      return this.reporting.getCompanyDashboard(ctx.companyId);
    }
    return this.reporting.getOwnerDashboard();
  }

  private async financeSummary(ctx: AiToolExecutionContext) {
    const payload = await this.reporting.getOwnerDashboard() as {
      companies: Array<{ companyId: string; companyName: string; revenuePosted: number; expensePosted: number; net: number }>;
      totals: { revenuePosted: number; expensePosted: number; net: number };
    };

    if (ctx.companyId) {
      const company = payload.companies.find((c) => c.companyId === ctx.companyId);
      return company ?? { error: 'Company not found in owner dashboard' };
    }
    return { totals: payload.totals, companies: payload.companies };
  }

  private async payrollSummary(_ctx: AiToolExecutionContext) {
    const payload = await this.reporting.getExecutiveDashboard() as {
      payroll: { totalGross: number; totalNet: number; cycleStatus: string };
    };
    return payload.payroll;
  }

  private async recruitmentSummary(ctx: AiToolExecutionContext) {
    const where: { deletedAt: null; companyId?: string } = { deletedAt: null };
    if (ctx.companyId) where.companyId = ctx.companyId;

    const [total, uniqueCounted, grouped] = await Promise.all([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.count({ where: { ...where, isUniqueCounted: true } }),
      this.prisma.candidate.groupBy({
        by: ['stage'],
        where,
        _count: { id: true },
      }),
    ]);

    const byStage: Record<string, number> = {};
    for (const g of grouped) byStage[g.stage] = g._count.id;

    return { total, uniqueCounted, byStage };
  }

  private async myMarketingKpi(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingKpi.getMyKpi(actor, earnCycleId);
  }

  private async teamMarketingKpi(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const teamId = typeof input.teamId === 'string'
      ? input.teamId
      : await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return { error: 'User is not a team leader or has no team scope' };

    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingKpi.getTeamKpi(actor, ctx.companyId, teamId, earnCycleId);
  }

  private async companyMarketingKpi(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId is required' };
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingKpi.getCompanyKpi(actor, companyId, earnCycleId);
  }

  private async myLatestMarketingReport(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
  ) {
    if (!actor) throw new Error('Actor context required');
    if (!ctx.companyId) return { error: 'companyId could not be resolved for this user' };
    const report = await this.marketingBackOffice.getLatestMyReport(actor, ctx.companyId);
    if (!report) return { error: 'No marketing report found' };
    return {
      id: report.id,
      reportDate: report.reportDate,
      status: report.status,
      submittedAt: report.submittedAt,
      contactedCount: report.contactedCount,
      newMemberCount: report.newMemberCount,
      depositAmount: report.depositAmount,
      startedWorkCount: report.startedWorkCount,
    };
  }

  private async marketingReportAudit(
    actor: ActorContext | undefined,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const reportId = typeof input.reportId === 'string' ? input.reportId : null;
    if (!reportId) return { error: 'reportId is required' };
    return this.marketingBackOffice.getReportAuditForAi(actor, reportId);
  }

  private async myMarketingExpenses(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    if (!ctx.companyId) return { error: 'companyId could not be resolved for this user' };
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    const [expenses, summary] = await Promise.all([
      this.marketingExpenses.getMyExpenses(actor, ctx.companyId, earnCycleId),
      this.marketingExpenses.getMyExpenseSummary(actor, ctx.companyId, earnCycleId),
    ]);
    return { expenses, summary };
  }

  private async teamMarketingExpenses(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    if (!ctx.companyId) return { error: 'companyId could not be resolved for this user' };
    if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };

    const teamId = typeof input.teamId === 'string'
      ? input.teamId
      : await this.context.leaderTeamId(ctx.employeeId);
    if (!teamId) return { error: 'User is not a team leader or has no team scope' };

    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingExpenses.getTeamExpenseSummaryForAi(actor, ctx.companyId, teamId, earnCycleId);
  }

  private async companyMarketingExpenses(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId is required' };
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingExpenses.getCompanyExpenseSummaryForAi(actor, companyId, earnCycleId);
  }

  private async marketingRoi(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId is required' };
    const teamId = typeof input.teamId === 'string' ? input.teamId : undefined;
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    return this.marketingExpenses.getMarketingRoi(actor, companyId, teamId, earnCycleId);
  }

  private insightQuery(
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId is required' } as const;
    return {
      companyId,
      earnCycleId: typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined,
      teamId: typeof input.teamId === 'string' ? input.teamId : undefined,
    };
  }

  private async marketingPerformanceInsights(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const query = this.insightQuery(ctx, input);
    if ('error' in query) return query;
    return this.marketingInsights.getPerformanceInsights(actor, query);
  }

  private async marketingRiskAlerts(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const query = this.insightQuery(ctx, input);
    if ('error' in query) return query;
    return this.marketingInsights.getRiskAlerts(actor, query);
  }

  private async marketingForecast(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const query = this.insightQuery(ctx, input);
    if ('error' in query) return query;
    return this.marketingInsights.getForecast(actor, query);
  }

  private async marketingTeamComparison(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required');
    const query = this.insightQuery(ctx, input);
    if ('error' in query) return query;
    return this.marketingInsights.getTeamComparison(actor, query);
  }

  private async commissionDashboardTool(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for commission dashboard');
    const earnCycleId = typeof input.earnCycleId === 'string' ? input.earnCycleId : undefined;
    const comparePreviousMonth = input.comparePreviousMonth === true
      || input.comparePreviousMonth === 'true';
    return this.commissionDashboard.getDashboard(actor, {
      companyId: ctx.companyId || undefined,
      earnCycleId,
      comparePreviousMonth,
    });
  }

  private async commissionCycleStatusTool(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for commission cycle status');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId required' };

    if (typeof input.cycleId === 'string') {
      return this.commissionFinalization.getCycleStatus(actor, input.cycleId);
    }

    const earnCycleId = typeof input.earnCycleId === 'string'
      ? input.earnCycleId
      : await this.resolveOpenEarnCycleId(companyId);
    if (!earnCycleId) return { error: 'No earn cycle found' };

    const type = typeof input.type === 'string' ? input.type as CommissionCycleType : undefined;
    const cycles = await this.commissionFinalization.listCycles(actor, {
      companyId,
      earnCycleId,
      ...(type ? { type } : {}),
    });
    return { earnCycleId, cycles };
  }

  private async commissionPreviewTool(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for commission preview');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId required' };

    if (typeof input.cycleId === 'string') {
      return this.commissionFinalization.previewCycle(actor, input.cycleId);
    }

    const earnCycleId = typeof input.earnCycleId === 'string'
      ? input.earnCycleId
      : await this.resolveOpenEarnCycleId(companyId);
    const type = typeof input.type === 'string' ? input.type as 'referral' | 'recruitment' : null;
    if (!earnCycleId || !type) {
      return { error: 'cycleId or (earnCycleId + type) required' };
    }

    const cycle = await this.commissionFinalization.ensureBatchCycle(actor, {
      companyId,
      earnCycleId,
      type,
    });
    return this.commissionFinalization.previewCycle(actor, cycle.id);
  }

  private async commissionAdjustmentsTool(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for commission adjustments');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId required' };

    const adjustments = await this.commissionAdjustments.getAdjustments(actor, {
      companyId,
      ...(typeof input.earnCycleId === 'string' ? { earnCycleId: input.earnCycleId } : {}),
      ...(typeof input.employeeId === 'string' ? { employeeId: input.employeeId } : {}),
      ...(typeof input.type === 'string' ? { type: input.type as CommissionCycleType } : {}),
      ...(typeof input.status === 'string' ? { status: input.status as 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied' } : {}),
    });

    const totalDelta = adjustments.reduce((sum, row) => {
      const signed = row.direction === 'increase' ? row.adjustmentAmount : -row.adjustmentAmount;
      return sum + (row.status === 'applied' ? signed : 0);
    }, 0);

    return { adjustments, appliedTotalDelta: totalDelta };
  }

  private async commissionAdjustmentHistoryTool(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for commission adjustment history');
    const companyId = typeof input.companyId === 'string' ? input.companyId : ctx.companyId;
    if (!companyId) return { error: 'companyId required' };

    const entries = await this.commissionAdjustments.getAdjustmentHistory(actor, {
      companyId,
      ...(typeof input.earnCycleId === 'string' ? { earnCycleId: input.earnCycleId } : {}),
      ...(typeof input.employeeId === 'string' ? { employeeId: input.employeeId } : {}),
    });

    const totalAdjustment = entries.reduce((sum, row) => sum + row.adjustmentAmount, 0);
    return { entries, totalAdjustment };
  }

  private async riskSummary(ctx: AiToolExecutionContext) {
    const companyId = ctx.companyId || null;
    return this.reporting.getRiskDashboard(companyId);
  }

  private async executiveSummary(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for executive summary');
    const companyId = typeof input.companyId === 'string'
      ? input.companyId
      : (ctx.companyId || undefined);

    const [summary, risks, recruitment, performance, companiesOverview] = await Promise.all([
      this.executiveInsights.getExecutiveSummary(actor, { companyId }),
      this.executiveInsights.getExecutiveRisks(actor, { companyId }),
      this.recruitmentSummary(ctx),
      this.ownerPerformanceOverview(companyId ?? null),
      companyId ? Promise.resolve(null) : this.reporting.getOwnerDashboard(),
    ]);

    return {
      generatedAt: summary.generatedAt,
      snapshotDate: summary.scope.snapshotDate,
      scope: summary.scope.scope === 'leader' ? 'company' : summary.scope.scope,
      companyId: summary.scope.companyId,
      headline: summary.headline,
      finance: summary.finance,
      payroll: summary.payroll,
      attendance: summary.attendance,
      headcount: summary.headcount,
      commission: summary.commission,
      workflows: summary.workflows,
      leave: summary.leave,
      marketing: summary.marketing,
      recruitment,
      performance,
      companiesOverview,
      topRisks: risks.risks.slice(0, 5),
    };
  }

  private async executiveRisks(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for executive risks');
    const companyId = typeof input.companyId === 'string'
      ? input.companyId
      : (ctx.companyId || undefined);
    return this.executiveInsights.getExecutiveRisks(actor, { companyId });
  }

  private async executiveForecast(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for executive forecast');
    const companyId = typeof input.companyId === 'string'
      ? input.companyId
      : (ctx.companyId || undefined);
    return this.executiveInsights.getExecutiveForecast(actor, { companyId });
  }

  private async executiveRecommendations(
    actor: ActorContext | undefined,
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    if (!actor) throw new Error('Actor context required for executive recommendations');
    const companyId = typeof input.companyId === 'string'
      ? input.companyId
      : (ctx.companyId || undefined);
    return this.executiveInsights.getExecutiveRecommendations(actor, { companyId });
  }

  private async companyProfitRanking(ctx: AiToolExecutionContext) {
    const payload = await this.reporting.getOwnerDashboard() as {
      generatedAt?: string;
      snapshotDate?: string;
      companies: Array<{
        companyId: string;
        companyName: string;
        revenuePosted: number;
        expensePosted: number;
        net: number;
      }>;
      totals: { revenuePosted: number; expensePosted: number; net: number };
    };

    let companies = payload.companies ?? [];
    if (ctx.companyId) {
      companies = companies.filter((c) => c.companyId === ctx.companyId);
    }

    const ranked = [...companies]
      .sort((a, b) => b.net - a.net)
      .map((c, index) => ({
        rank: index + 1,
        companyId: c.companyId,
        companyName: c.companyName,
        net: c.net,
        revenuePosted: c.revenuePosted,
        expensePosted: c.expensePosted,
      }));

    return {
      generatedAt: payload.generatedAt ?? new Date().toISOString(),
      snapshotDate: payload.snapshotDate ?? new Date().toISOString().slice(0, 10),
      rankedBy: 'net',
      companies: ranked,
      topPerformer: ranked[0] ?? null,
      totals: payload.totals,
    };
  }

  private async teamPerformanceRankings(
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    const bottomN = typeof input.bottomN === 'number' && input.bottomN > 0
      ? Math.min(Math.floor(input.bottomN), 20)
      : 5;
    const companyId = ctx.companyId || null;

    const cycle = await this.prisma.performanceCycle.findFirst({
      where: {
        status: 'open',
        deletedAt: null,
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      orderBy: { periodStart: 'desc' },
    });

    if (!cycle) {
      return { message: 'No open performance cycle', underperformingTeams: [], topTeams: [] };
    }

    const teams = await this.prisma.team.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        name: true,
        companyId: true,
        company: { select: { name: true, code: true } },
      },
    });

    const rankings: Array<{
      teamId: string;
      teamName: string;
      companyName: string;
      companyCode: string;
      memberCount: number;
      evaluatedCount: number;
      averageScore: number;
    }> = [];

    for (const team of teams) {
      const members = await this.prisma.employeeAssignment.findMany({
        where: { teamId: team.id, effectiveTo: null, deletedAt: null },
        select: { employeeId: true },
      });
      if (members.length === 0) continue;

      const memberIds = members.map((m) => m.employeeId);
      const evaluations = await this.prisma.evaluation.findMany({
        where: {
          performanceCycleId: cycle.id,
          employeeId: { in: memberIds },
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
        select: { totalScore: true },
      });

      if (evaluations.length === 0) continue;

      const averageScore = evaluations.reduce((a, e) => a + Number(e.totalScore), 0)
        / evaluations.length;

      rankings.push({
        teamId: team.id,
        teamName: team.name,
        companyName: team.company.name,
        companyCode: team.company.code,
        memberCount: members.length,
        evaluatedCount: evaluations.length,
        averageScore: Math.round(averageScore * 100) / 100,
      });
    }

    rankings.sort((a, b) => a.averageScore - b.averageScore);

    const portfolioAverage = rankings.length > 0
      ? Math.round(
        (rankings.reduce((a, r) => a + r.averageScore, 0) / rankings.length) * 100,
      ) / 100
      : null;

    const underperformingTeams = rankings
      .filter((r) => portfolioAverage === null || r.averageScore < portfolioAverage)
      .slice(0, bottomN);

    const topTeams = [...rankings].reverse().slice(0, bottomN);

    return {
      cycleLabel: `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`,
      portfolioAverage,
      teamCount: rankings.length,
      underperformingTeams,
      topTeams,
      allTeams: rankings,
    };
  }

  private async ownerPerformanceOverview(companyId: string | null) {
    const cycle = await this.prisma.performanceCycle.findFirst({
      where: {
        status: 'open',
        deletedAt: null,
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      orderBy: { periodStart: 'desc' },
    });

    if (!cycle) {
      return { openCycle: false, message: 'No open performance cycle' };
    }

    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        performanceCycleId: cycle.id,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: { totalScore: true, status: true },
    });

    if (evaluations.length === 0) {
      return {
        openCycle: true,
        cycleLabel: `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`,
        evaluatedCount: 0,
        averageScore: null,
      };
    }

    const averageScore = evaluations.reduce((a, e) => a + Number(e.totalScore), 0)
      / evaluations.length;
    const finalizedCount = evaluations.filter((e) => e.status === 'finalized').length;

    return {
      openCycle: true,
      cycleLabel: `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`,
      evaluatedCount: evaluations.length,
      finalizedCount,
      averageScore: Math.round(averageScore * 100) / 100,
    };
  }

  private async searchCompanyKnowledge(
    ctx: AiToolExecutionContext,
    input: Record<string, unknown>,
  ) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) {
      return { count: 0, results: [], error: 'query is required' };
    }

    const chunks = await this.rag.retrieve(ctx.companyId, query);
    return this.rag.formatChunksForTool(chunks);
  }
}
