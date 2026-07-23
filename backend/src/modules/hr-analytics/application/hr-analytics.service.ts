// ============================================================================
// modules/hr-analytics/application/hr-analytics.service.ts
// ANALYTICS-001 — HR executive insights
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class HrAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly dates: DateProvider,
  ) {}

  async getDashboard(actor: ActorContext, companyId: string, teamId?: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const today = this.dates.parseDate(this.dates.todayString());

    const employeeWhere = {
      deletedAt: null,
      assignments: {
        some: {
          companyId,
          effectiveTo: null,
          deletedAt: null,
          ...(teamId ? { teamId } : {}),
        },
      },
    };

    const [
      headcount,
      activeEmployees,
      probationEmployees,
      pendingRequests,
      exitCases,
      leaveToday,
      trainingOverdue,
      unackAnnouncements,
      missingDocs,
      salaryReviewPending,
      referralPending,
    ] = await Promise.all([
      this.prisma.employee.count({ where: employeeWhere }),
      this.prisma.employee.count({
        where: { ...employeeWhere, employmentStatus: 'active' },
      }),
      this.prisma.employee.count({
        where: {
          ...employeeWhere,
          employmentStatus: 'active',
          probationEndDate: { gte: today },
        },
      }),
      this.prisma.requestInstance.count({
        where: { companyId, deletedAt: null, status: { in: ['submitted', 'in_review'] } },
      }),
      this.prisma.employeeExitCase.count({
        where: { companyId, deletedAt: null, status: { notIn: ['closed', 'cancelled'] } },
      }),
      this.prisma.leaveRequest.count({
        where: {
          companyId,
          status: 'approved',
          deletedAt: null,
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      this.prisma.trainingAssignment.count({
        where: { status: 'overdue', deletedAt: null, course: { companyId } },
      }),
      this.prisma.announcementDelivery.count({
        where: {
          acknowledgedAt: null,
          announcement: { companyId, status: 'published', mustAcknowledge: true },
        },
      }),
      this.prisma.employeeDocument.count({
        where: { deletedAt: null, acknowledgedAt: null, employee: { deletedAt: null, assignments: { some: { companyId, effectiveTo: null, deletedAt: null } } } },
      }),
      this.prisma.salaryReview.count({
        where: { companyId, deletedAt: null, status: 'pending_approval' },
      }),
      this.prisma.referral.count({
        where: { companyId, deletedAt: null, status: { in: ['pending', 'qualified'] } },
      }),
    ]);

    const openCycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId, deletedAt: null, status: { in: ['open', 'locked'] } },
      orderBy: { periodStart: 'desc' },
    });

    let payrollTotal = 0;
    if (openCycle) {
      const agg = await this.prisma.payslip.aggregate({
        where: { payrollCycleId: openCycle.id, deletedAt: null },
        _sum: { net: true },
      });
      payrollTotal = Number(agg._sum?.net ?? 0);
    }

    const snapshots = await this.prisma.hrDailySnapshot.findMany({
      where: { companyId },
      orderBy: { snapshotDate: 'desc' },
      take: 2,
    });

    const momHeadcount = snapshots.length >= 2
      ? snapshots[0].headcount - snapshots[1].headcount
      : 0;

    return {
      headcount,
      activeEmployees,
      probationEmployees,
      exitCases,
      pendingRequests,
      leaveUtilizationToday: leaveToday,
      payrollTotal,
      trainingOverdue,
      announcementAcknowledgementGap: unackAnnouncements,
      missingDocuments: missingDocs,
      salaryReviewPending,
      referralBonusesPending: referralPending,
      monthOverMonthHeadcountDelta: momHeadcount,
      generatedAt: this.dates.now().toISOString(),
    };
  }

  async exportCsv(actor: ActorContext, companyId: string): Promise<string> {
    const dash = await this.getDashboard(actor, companyId);
    const headers = Object.keys(dash).join(',');
    const values = Object.values(dash).map((v) => JSON.stringify(v)).join(',');
    return `${headers}\n${values}`;
  }

  async buildDailySnapshot(companyId: string, asOf?: Date) {
    const ref = asOf ?? this.dates.now();
    const dateStr = this.dates.todayString();
    const snapshotDate = this.dates.parseDate(dateStr);

    const dash = await this.getDashboard(
      { userId: '00000000-0000-4000-8000-000000000001', impersonatorUserId: null, companyId },
      companyId,
    );

    return this.prisma.hrDailySnapshot.upsert({
      where: {
        companyId_snapshotDate: { companyId, snapshotDate },
      },
      create: {
        companyId,
        snapshotDate,
        headcount: dash.headcount,
        activeEmployees: dash.activeEmployees,
        probationEmployees: dash.probationEmployees,
        leaveCount: dash.leaveUtilizationToday,
        payrollTotal: dash.payrollTotal,
        pendingRequests: dash.pendingRequests,
        exitCases: dash.exitCases,
        payloadJson: dash as object,
      },
      update: {
        headcount: dash.headcount,
        activeEmployees: dash.activeEmployees,
        probationEmployees: dash.probationEmployees,
        leaveCount: dash.leaveUtilizationToday,
        payrollTotal: dash.payrollTotal,
        pendingRequests: dash.pendingRequests,
        exitCases: dash.exitCases,
        payloadJson: dash as object,
      },
    });
  }

  async getTelegramSummary(companyId: string) {
    const dash = await this.getDashboard(
      { userId: '00000000-0000-4000-8000-000000000001', impersonatorUserId: null, companyId },
      companyId,
    );
    return [
      '📊 <b>สรุป HR วันนี้</b>',
      '',
      `👥 พนักงาน: ${dash.headcount} (active ${dash.activeEmployees})`,
      `🌴 ลาวันนี้: ${dash.leaveUtilizationToday}`,
      `⏳ คำร้องค้าง: ${dash.pendingRequests}`,
      `🚪 Exit cases: ${dash.exitCases}`,
      `📚 Training overdue: ${dash.trainingOverdue}`,
      `📢 ประกาศยังไม่รับทราบ: ${dash.announcementAcknowledgementGap}`,
    ].join('\n');
  }
}
