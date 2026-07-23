// ============================================================================
// modules/reporting/infrastructure/persistence/metric-query.prisma.repository.ts
// Executes all live metric queries against the DB. Kept in one file so any
// slow query is easy to find and add a targeted index to.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  MetricQueryRepository,
  AttendanceMetrics, WorkflowMetrics, PayrollMetrics,
  FinanceMetrics, HeadcountMetrics, CommissionMetrics, LeaveRescheduleMetrics,
  PendingWorkflowItem,
} from '../../domain/repositories/reporting.repository';

@Injectable()
export class PrismaMetricQueryRepository implements MetricQueryRepository {

  constructor(private readonly prisma: PrismaService) {}

  // ── Active companies ───────────────────────────────────────────────────────
  async listActiveCompanies(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  // ── Attendance metrics ─────────────────────────────────────────────────────
  async attendance(companyId: string, date: Date): Promise<AttendanceMetrics> {
    const workDate = this.dateOnly(date);

    const [totalExpected, records, missingCheckout, lateCount] = await Promise.all([
      this.prisma.employeeAssignment.count({
        where: { companyId, isPrimaryCompany: true, effectiveTo: null, deletedAt: null },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: { companyId, workDate, deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.attendanceRecord.count({
        where: { companyId, workDate, checkInAt: { not: null }, checkOutAt: null, deletedAt: null },
      }),
      this.prisma.attendanceRecord.count({
        where: { companyId, workDate, lateMinutes: { gt: 0 }, deletedAt: null },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const g of records) byStatus[g.status] = g._count.id;
    const checkedIn = (byStatus['present'] ?? 0) + (byStatus['corrected'] ?? 0);
    const checkedOut = await this.prisma.attendanceRecord.count({
      where: { companyId, workDate, checkOutAt: { not: null }, deletedAt: null },
    });
    const absent = byStatus['absent'] ?? 0;
    const checkInRate = totalExpected > 0 ? Math.round((checkedIn / totalExpected) * 10000) / 100 : 0;

    return { totalExpected, checkedIn, checkedOut, absent, lateCount, missingCheckout, checkInRate };
  }

  // ── Workflow / approval metrics ────────────────────────────────────────────
  async workflows(companyId: string | null): Promise<WorkflowMetrics> {
    const where: any = { status: 'pending', deletedAt: null };
    if (companyId) where.companyId = companyId;

    const [grouped, total] = await Promise.all([
      this.prisma.workflowInstance.groupBy({
        by: ['entityType'],
        where,
        _count: { id: true },
      }),
      this.prisma.workflowInstance.count({ where }),
    ]);

    const byType: Record<string, number> = {};
    for (const g of grouped) byType[g.entityType] = g._count.id;

    // Overdue: still pending after 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const overdueCount = await this.prisma.workflowInstance.count({
      where: { ...where, createdAt: { lt: cutoff } },
    });

    return { pendingTotal: total, byType, overdueCount };
  }

  // ── Payroll metrics ────────────────────────────────────────────────────────
  async payroll(companyId: string): Promise<PayrollMetrics> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });
    if (!cycle) return { cycleStatus: null, totalGross: 0, totalNet: 0 };

    const grossSum = await this.prisma.payslip.aggregate({
      where: { payrollCycleId: cycle.id, deletedAt: null },
      _sum: { gross: true, net: true },
    });

    return {
      cycleStatus: cycle.status,
      totalGross: Number(grossSum._sum.gross ?? 0),
      totalNet: Number(grossSum._sum.net ?? 0),
    };
  }

  // ── Finance metrics ────────────────────────────────────────────────────────
  async finance(companyId: string, periodStart: Date, periodEnd: Date): Promise<FinanceMetrics> {
    const [txnSums, advancePending] = await Promise.all([
      this.prisma.financialTransaction.groupBy({
        by: ['type'],
        where: {
          companyId,
          status: 'posted',
          transactionDate: { gte: periodStart, lte: periodEnd },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.advanceRequest.count({
        where: { companyId, status: 'pending', deletedAt: null },
      }),
    ]);

    let revenuePosted = 0, expensePosted = 0;
    for (const g of txnSums) {
      if (g.type === 'revenue') revenuePosted = Number(g._sum.amount ?? 0);
      if (g.type === 'expense') expensePosted = Number(g._sum.amount ?? 0);
    }

    return {
      revenuePosted,
      expensePosted,
      net: Math.round((revenuePosted - expensePosted) * 100) / 100,
      advancePending,
    };
  }

  // ── Headcount metrics ──────────────────────────────────────────────────────
  async headcount(companyId: string, date: Date): Promise<HeadcountMetrics> {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);

    const [active, probation, terminatedMtd] = await Promise.all([
      this.prisma.employeeAssignment.count({
        where: {
          companyId, isPrimaryCompany: true, effectiveTo: null, deletedAt: null,
          employee: { employmentStatus: 'active', deletedAt: null },
        },
      }),
      this.prisma.employeeAssignment.count({
        where: {
          companyId, isPrimaryCompany: true, effectiveTo: null, deletedAt: null,
          employee: { employmentStatus: 'probation', deletedAt: null },
        },
      }),
      this.prisma.employee.count({
        where: {
          terminationDate: { gte: monthStart, lte: date },
          employmentStatus: 'terminated',
          deletedAt: null,
          assignments: { some: { companyId, deletedAt: null } },
        },
      }),
    ]);

    return { active, probation, terminatedMtd };
  }

  // ── Commission metrics ─────────────────────────────────────────────────────
  async commission(companyId: string): Promise<CommissionMetrics> {
    const [onHoldCount, totalCount, qualifiedCount] = await Promise.all([
      this.prisma.commissionRecord.count({
        where: { companyId, status: 'hold', deletedAt: null },
      }),
      this.prisma.commissionRecord.count({
        where: { companyId, deletedAt: null },
      }),
      this.prisma.commissionRecord.count({
        where: { companyId, qualified: true, deletedAt: null },
      }),
    ]);

    const qualifiedRate = totalCount > 0
      ? Math.round((qualifiedCount / totalCount) * 10000) / 100
      : 0;

    return { onHoldCount, qualifiedRate };
  }

  async leaveReschedules(
    companyId: string | null,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<LeaveRescheduleMetrics> {
    const where: any = {
      deletedAt: null,
      createdAt: { gte: monthStart, lte: monthEnd },
    };
    if (companyId) where.companyId = companyId;

    const [total, approved, grouped] = await Promise.all([
      this.prisma.leaveRescheduleRequest.count({ where }),
      this.prisma.leaveRescheduleRequest.count({
        where: { ...where, status: 'approved' },
      }),
      this.prisma.leaveRescheduleRequest.groupBy({
        by: ['employeeId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    const employeeIds = grouped.map((g) => g.employeeId);
    const employees = employeeIds.length > 0
      ? await this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstName: true, lastName: true },
      })
      : [];
    const nameById = new Map(
      employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
    );

    return {
      countMtd: total,
      approvalRate: total > 0 ? Math.round((approved / total) * 10000) / 100 : 0,
      topEmployees: grouped.map((g) => ({
        employeeId: g.employeeId,
        employeeName: nameById.get(g.employeeId) ?? g.employeeId,
        count: g._count.id,
      })),
    };
  }

  // ── Pending workflow items (for pending-approval dashboard) ────────────────
  async pendingWorkflowItems(companyId: string | null): Promise<PendingWorkflowItem[]> {
    const where: any = { status: 'pending', deletedAt: null };
    if (companyId) where.companyId = companyId;

    const rows = await this.prisma.workflowInstance.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: {
        id: true, entityType: true, currentStepOrder: true,
        initiatedBy: true, companyId: true, createdAt: true,
      },
    });

    const now = Date.now();
    return rows.map(r => ({
      instanceId: r.id,
      entityType: r.entityType,
      initiatedBy: r.initiatedBy ?? '',
      companyId: r.companyId ?? '',
      currentStep: r.currentStepOrder,
      pendingHours: Math.floor((now - (r.createdAt as Date).getTime()) / 3_600_000),
    }));
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  private dateOnly(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
}
