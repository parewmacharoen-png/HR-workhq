// ============================================================================
// modules/reporting/domain/services/dashboard-builder.service.ts
// Pure functions. No I/O. Takes metric structs → typed payload objects.
// Keeps all business-reporting logic out of the application service and
// therefore unit-testable without a database.
// ============================================================================

import {
  MorningBriefPayload, EveningBriefPayload,
  CompanyDashboardPayload, OwnerDashboardPayload,
  ExecutiveDashboardPayload, RiskDashboardPayload,
  PendingApprovalPayload, SnapshotMeta,
} from '../entities/dashboard-payloads';
import {
  AttendanceMetrics, WorkflowMetrics, PayrollMetrics,
  FinanceMetrics, HeadcountMetrics, CommissionMetrics,
} from '../repositories/reporting.repository';

type CompanyRow = { id: string; name: string };

export class DashboardBuilderService {
  private meta(date: Date, companyId: string | null, companyName: string | null): SnapshotMeta {
    return {
      generatedAt: new Date().toISOString(),
      snapshotDate: date.toISOString().slice(0, 10),
      companyId,
      companyName,
    };
  }

  morningBrief(
    date: Date, company: CompanyRow, att: AttendanceMetrics,
  ): MorningBriefPayload {
    return {
      ...this.meta(date, company.id, company.name),
      totalExpected: att.totalExpected,
      checkedIn: att.checkedIn,
      notYetIn: att.totalExpected - att.checkedIn,
      lateCount: att.lateCount,
      checkInRate: att.checkInRate,
    };
  }

  eveningBrief(
    date: Date, company: CompanyRow, att: AttendanceMetrics, wf: WorkflowMetrics,
  ): EveningBriefPayload {
    return {
      ...this.meta(date, company.id, company.name),
      missingCheckout: att.missingCheckout,
      pendingOtCount: wf.byType['overtime'] ?? 0,
      absentCount: att.absent,
      pendingApprovals: wf.pendingTotal,
      pendingLeave: wf.byType['leave'] ?? 0,
    };
  }

  companyDashboard(
    date: Date, company: CompanyRow,
    att: AttendanceMetrics, wf: WorkflowMetrics,
    pay: PayrollMetrics, fin: FinanceMetrics,
    hc: HeadcountMetrics, com: CommissionMetrics,
    period: { start: Date; end: Date },
  ): CompanyDashboardPayload {
    return {
      ...this.meta(date, company.id, company.name),
      headcountActive: hc.active,
      headcountProbation: hc.probation,
      attendanceRate: att.checkInRate,
      pendingApprovals: wf.pendingTotal,
      payroll: {
        cycleStatus: pay.cycleStatus ?? 'none',
        totalGross: pay.totalGross,
        totalNet: pay.totalNet,
      },
      finance: {
        revenuePosted: fin.revenuePosted,
        expensePosted: fin.expensePosted,
        net: fin.net,
        advancePending: fin.advancePending,
      },
      commission: {
        onHoldCount: com.onHoldCount,
        qualifiedRate: com.qualifiedRate,
      },
    };
  }

  ownerDashboard(
    date: Date,
    perCompany: Array<{
      company: CompanyRow;
      att: AttendanceMetrics;
      wf: WorkflowMetrics;
      fin: FinanceMetrics;
      hc: HeadcountMetrics;
    }>,
    leaveReschedule: {
      countMtd: number;
      approvalRate: number;
      topEmployees: Array<{ employeeId: string; employeeName: string; count: number }>;
    },
    commissionDashboard?: import('../entities/commission-executive-dashboard.types').CommissionDashboardBlock,
  ): OwnerDashboardPayload {
    const companies = perCompany.map(({ company, att, wf, fin, hc }) => ({
      companyId: company.id,
      companyName: company.name,
      headcountActive: hc.active,
      attendanceRate: att.checkInRate,
      pendingApprovals: wf.pendingTotal,
      revenuePosted: fin.revenuePosted,
      expensePosted: fin.expensePosted,
      net: fin.net,
    }));

    const totals = companies.reduce(
      (acc, c) => ({
        headcount: acc.headcount + c.headcountActive,
        pendingApprovals: acc.pendingApprovals + c.pendingApprovals,
        revenuePosted: this.round2(acc.revenuePosted + c.revenuePosted),
        expensePosted: this.round2(acc.expensePosted + c.expensePosted),
        net: this.round2(acc.net + c.net),
      }),
      { headcount: 0, pendingApprovals: 0, revenuePosted: 0, expensePosted: 0, net: 0 },
    );

    return { ...this.meta(date, null, null), companies, totals, leaveReschedule, commissionDashboard };
  }

  executiveDashboard(
    date: Date, period: { start: Date; end: Date },
    // rolled-up across companies
    att: AttendanceMetrics, pay: PayrollMetrics,
    fin: FinanceMetrics, hc: HeadcountMetrics,
    com: CommissionMetrics, wf: WorkflowMetrics,
  ): ExecutiveDashboardPayload {
    return {
      ...this.meta(date, null, null),
      period: {
        start: period.start.toISOString().slice(0, 10),
        end: period.end.toISOString().slice(0, 10),
      },
      headcount: {
        active: hc.active,
        probation: hc.probation,
        terminatedMtd: hc.terminatedMtd,
      },
      attendance: {
        rate: att.checkInRate,
        late: att.lateCount,
        absent: att.absent,
      },
      payroll: {
        totalGross: pay.totalGross,
        totalNet: pay.totalNet,
        cycleStatus: pay.cycleStatus ?? 'none',
      },
      finance: {
        revenue: fin.revenuePosted,
        expenses: fin.expensePosted,
        net: fin.net,
      },
      commission: {
        qualifiedRate: com.qualifiedRate,
        onHold: com.onHoldCount,
      },
      workflows: {
        pending: wf.pendingTotal,
        byType: wf.byType,
      },
    };
  }

  riskDashboard(
    date: Date, companyId: string | null, companyName: string | null,
    att: AttendanceMetrics, wf: WorkflowMetrics,
    com: CommissionMetrics, hc: HeadcountMetrics, fin: FinanceMetrics,
  ): RiskDashboardPayload {
    const alerts: RiskDashboardPayload['alerts'] = [];

    if (att.missingCheckout > 5) {
      alerts.push({ severity: 'high', category: 'attendance', message: `${att.missingCheckout} employees missing checkout`, count: att.missingCheckout });
    }
    if (wf.overdueCount > 0) {
      alerts.push({ severity: wf.overdueCount > 10 ? 'high' : 'medium', category: 'approval', message: `${wf.overdueCount} approvals overdue >48h`, count: wf.overdueCount });
    }
    if (com.onHoldCount > 0) {
      alerts.push({ severity: 'medium', category: 'commission', message: `${com.onHoldCount} commission records on hold`, count: com.onHoldCount });
    }
    if (fin.advancePending > 0) {
      alerts.push({ severity: 'low', category: 'finance', message: `${fin.advancePending} pending salary advances`, count: fin.advancePending });
    }
    if (hc.terminatedMtd > 3) {
      alerts.push({ severity: 'medium', category: 'headcount', message: `${hc.terminatedMtd} terminations this month`, count: hc.terminatedMtd });
    }

    return {
      ...this.meta(date, companyId, companyName),
      alerts,
      metrics: {
        missingCheckouts: att.missingCheckout,
        pendingOt: wf.byType['overtime'] ?? 0,
        commissionOnHold: com.onHoldCount,
        overdueApprovals: wf.overdueCount,
        advancePending: fin.advancePending,
        terminatedMtd: hc.terminatedMtd,
      },
    };
  }

  pendingApprovalDashboard(
    date: Date, companyId: string | null, companyName: string | null,
    wf: WorkflowMetrics,
    items: PendingApprovalPayload['items'],
  ): PendingApprovalPayload {
    return {
      ...this.meta(date, companyId, companyName),
      total: wf.pendingTotal,
      byType: {
        leave:              wf.byType['leave'] ?? 0,
        overtime:           wf.byType['overtime'] ?? 0,
        advance:            wf.byType['advance'] ?? 0,
        depositRefund:      wf.byType['deposit_refund'] ?? 0,
        payrollAdjustment:  wf.byType['payroll_adjustment'] ?? 0,
        performanceReview:  wf.byType['performance_review'] ?? 0,
        other: wf.pendingTotal - Object.values(wf.byType).reduce((s, v) => s + v, 0),
      },
      overdueCount: wf.overdueCount,
      items,
    };
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
