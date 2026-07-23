// ============================================================================
// Employee Operating Center — single overview aggregate (GET /employees/:id/overview)
// ============================================================================

import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import { EmployeeAccessService } from './employee-access.service';
import { AccessControlService } from '../../permission/application/access-control.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import {
  bangkokCalendarParts,
  calculateAgeYears,
  calculateTenureBreakdown,
  daysUntilBangkok,
  formatTenureDisplay,
  isSameMonthDay,
} from '../domain/services/employee-date-events.service';
import type {
  EmployeeOverviewAlert,
  EmployeeOverviewActivity,
  EmployeeOverviewAttendanceSummary,
  EmployeeOverviewKpiSummary,
  EmployeeOverviewLeaveSummary,
  EmployeeOverviewPayrollSummary,
  EmployeeOverviewResponse,
  EmployeeOverviewSummary,
  EmployeeOverviewUpcomingEvent,
} from './dto/employee-overview.dto';
import {
  mapConnectionStatusToOverview,
  resolveTelegramConnectionStatus,
} from '../../employee-onboarding/domain/telegram-connection-status.util';

const REQUIRED_DOC_TYPES: DocumentType[] = [
  'national_id',
  'house_registration',
  'bank_account',
  'employment_contract',
];

@Injectable()
export class EmployeeOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly dates: DateProvider,
    private readonly accessControl: AccessControlService,
    private readonly salaryVisibility: SalaryVisibilityService,
  ) {}

  async getOverview(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeOverviewResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);

    const now = this.dates.now();
    const today = this.dates.parseDate(this.dates.todayString());
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        assignments: {
          where: { effectiveTo: null, deletedAt: null },
          include: { company: true, team: true },
        },
        bankAccounts: { where: { deletedAt: null, isPrimary: true }, take: 1 },
        telegramIdentities: { where: { deletedAt: null }, orderBy: { linkedAt: 'desc' }, take: 1 },
        hierarchyAsEmployee: {
          where: { effectiveTo: null, deletedAt: null },
          include: {
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
          take: 1,
        },
        documents: { where: { deletedAt: null }, select: { docType: true } },
      },
    });
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const primaryAssignment = employee.assignments.find((a) => a.isPrimaryCompany)
      ?? employee.assignments.find((a) => a.companyId === companyId)
      ?? employee.assignments[0];

    const identity = employee.telegramIdentities[0];
    const connectionStatus = await resolveTelegramConnectionStatus(this.prisma, employeeId);
    let telegramStatus = mapConnectionStatusToOverview(connectionStatus);
    if (identity?.status === 'ACTIVE') {
      telegramStatus = 'linked';
    }

    const effectiveAccess = await this.accessControl
      .getEmployeeAccessContext(employeeId)
      .catch(() => null);

    const manager = employee.hierarchyAsEmployee[0]?.manager;
    const managerName = manager ? `${manager.firstName} ${manager.lastName}`.trim() : null;

    const tenure = calculateTenureBreakdown(employee.hireDate, now);
    const ageYears = employee.dateOfBirth ? calculateAgeYears(employee.dateOfBirth, now) : null;
    const isBirthdayToday = employee.dateOfBirth ? isSameMonthDay(employee.dateOfBirth, now) : false;
    let birthdayInDays: number | null = null;
    if (employee.dateOfBirth && !isBirthdayToday) {
      const birth = bangkokCalendarParts(employee.dateOfBirth);
      const ref = bangkokCalendarParts(now);
      let nextBirthday = new Date(Date.UTC(ref.year, birth.month - 1, birth.day));
      if (nextBirthday < now) {
        nextBirthday = new Date(Date.UTC(ref.year + 1, birth.month - 1, birth.day));
      }
      birthdayInDays = daysUntilBangkok(nextBirthday, now);
    }

    const isAnniversaryToday = isSameMonthDay(employee.hireDate, now);
    let workAnniversaryInDays: number | null = null;
    if (!isAnniversaryToday) {
      const hire = bangkokCalendarParts(employee.hireDate);
      const ref = bangkokCalendarParts(now);
      let nextAnniversary = new Date(Date.UTC(ref.year, hire.month - 1, hire.day));
      if (nextAnniversary < now) {
        nextAnniversary = new Date(Date.UTC(ref.year + 1, hire.month - 1, hire.day));
      }
      workAnniversaryInDays = daysUntilBangkok(nextAnniversary, now);
    }

    const presentTypes = new Set(employee.documents.map((d) => d.docType));
    const docMissing = REQUIRED_DOC_TYPES.filter((t) => !presentTypes.has(t)).length;
    const bank = employee.bankAccounts[0];

    const summary: EmployeeOverviewSummary = {
      id: employee.id,
      globalId: employee.globalId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      nickname: employee.nickname,
      companyName: primaryAssignment?.company?.name ?? null,
      department: employee.department,
      teamName: primaryAssignment?.team?.name ?? null,
      position: employee.position,
      businessRole: effectiveAccess?.businessRole ?? null,
      employmentStatus: employee.employmentStatus,
      telegramStatus,
      telegramUsername: identity?.telegramUsername ?? null,
      managerName,
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      tenureDisplay: formatTenureDisplay(tenure),
      dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      ageYears,
      birthdayInDays,
      isBirthdayToday,
      isAnniversaryToday,
      workAnniversaryInDays,
      hasNationalId: Boolean(employee.nationalId),
    };

    const [attendance, leave, payroll, kpi, recentActivities] = await Promise.all([
      this.buildAttendanceSummary(employeeId, companyId, today, monthStart),
      this.buildLeaveSummary(employeeId, companyId, today),
      this.buildPayrollSummary(actor, employeeId, companyId, bank, employee.hireDate, now),
      this.buildKpiSummary(employeeId),
      this.buildRecentActivities(employeeId),
    ]);

    const alerts = this.buildAlerts({
      telegramStatus,
      docMissing,
      hasBank: Boolean(bank?.accountNo),
      hasNationalId: Boolean(employee.nationalId),
      isBirthdayToday,
      isAnniversaryToday,
      probationEndDate: employee.probationEndDate,
      employmentStatus: employee.employmentStatus,
      salaryReviewDue: payroll?.salaryReviewDue ?? false,
      today,
    });

    const upcomingEvents = this.buildUpcomingEvents(employee, now, today);

    return {
      summary,
      attendance,
      leave,
      payroll,
      kpi,
      alerts,
      recentActivities,
      upcomingEvents,
    };
  }

  private async buildAttendanceSummary(
    employeeId: string,
    companyId: string,
    today: Date,
    monthStart: Date,
  ): Promise<EmployeeOverviewAttendanceSummary | null> {
    const todayRecord = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, workDate: today, deletedAt: null },
    });

    const monthRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        companyId,
        workDate: { gte: monthStart },
        deletedAt: null,
      },
    });

    const presentDaysMonth = monthRecords.filter((r) => r.checkInAt).length;
    const lateCountMonth = monthRecords.filter((r) => r.lateMinutes > 0).length;
    const lateMinutesMonth = monthRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    const missingCheckInMonth = monthRecords.filter((r) => !r.checkInAt).length;
    const workingDays = Math.max(1, monthRecords.length);
    const attendancePercentMonth = Math.round((presentDaysMonth / workingDays) * 100);

    let todayStatus = 'off';
    if (todayRecord?.checkInAt && !todayRecord.checkOutAt) todayStatus = 'working';
    else if (todayRecord?.checkOutAt) todayStatus = 'completed';
    else if (todayRecord) todayStatus = 'incomplete';

    const latest = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, deletedAt: null, checkInAt: { not: null } },
      orderBy: { workDate: 'desc' },
    });

    return {
      todayStatus,
      lastCheckInAt: latest?.checkInAt?.toISOString() ?? null,
      lastCheckOutAt: latest?.checkOutAt?.toISOString() ?? null,
      workedMinutesToday: todayRecord?.workedMinutes ?? 0,
      lateMinutesMonth,
      presentDaysMonth,
      lateCountMonth,
      missingCheckInMonth,
      attendancePercentMonth,
    };
  }

  private async buildLeaveSummary(
    employeeId: string,
    companyId: string,
    today: Date,
  ): Promise<EmployeeOverviewLeaveSummary | null> {
    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId, deletedAt: null },
      include: { leaveType: { select: { name: true } } },
    });

    const upcomingLeave = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        endDate: { gte: today },
      },
      include: { leaveType: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
      take: 5,
    });

    const todayIso = today.toISOString().slice(0, 10);
    const onLeaveRow = upcomingLeave.find(
      (row) => row.startDate.toISOString().slice(0, 10) <= todayIso
        && row.endDate.toISOString().slice(0, 10) >= todayIso,
    );

    return {
      balances: balances.map((b) => ({
        leaveTypeName: b.leaveType.name,
        entitled: Number(b.entitled),
        used: Number(b.used),
        remaining: Number(b.remaining),
      })),
      upcomingLeave: upcomingLeave.map((row) => ({
        id: row.id,
        leaveTypeName: row.leaveType.name,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        days: Number(row.days),
      })),
      onLeaveToday: onLeaveRow
        ? {
            leaveTypeName: onLeaveRow.leaveType.name,
            startDate: onLeaveRow.startDate.toISOString().slice(0, 10),
            endDate: onLeaveRow.endDate.toISOString().slice(0, 10),
          }
        : null,
    };
  }

  private async buildPayrollSummary(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    bank: { bankCode: string | null; accountNo: string | null } | undefined,
    hireDate: Date,
    now: Date,
  ): Promise<EmployeeOverviewPayrollSummary> {
    const decision = await this.salaryVisibility.canViewSalary(actor.userId, employeeId);
    if (!decision.canView) {
      return {
        canViewSalary: false,
        currentSalary: null,
        salaryEffectiveFrom: null,
        bankCode: null,
        bankAccountMasked: null,
        lastAdjustmentAt: null,
        salaryReviewDue: false,
      };
    }

    const currentBand = await this.prisma.salaryHistory.findFirst({
      where: { employeeId, companyId, deletedAt: null, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });

    const lastChange = await this.prisma.employeeChangeHistory.findFirst({
      where: { employeeId, fieldName: { contains: 'salary', mode: 'insensitive' } },
      orderBy: { changedAt: 'desc' },
    });

    const msPerDay = 86_400_000;
    const daysSinceHire = Math.floor((now.getTime() - hireDate.getTime()) / msPerDay);
    let salaryReviewDue = false;
    if (daysSinceHire >= 365) {
      const lastReviewAt = lastChange?.changedAt ?? currentBand?.effectiveFrom ?? null;
      if (!lastReviewAt) {
        salaryReviewDue = true;
      } else {
        salaryReviewDue = (now.getTime() - lastReviewAt.getTime()) / msPerDay > 365;
      }
    }

    return {
      canViewSalary: true,
      currentSalary: currentBand ? Number(currentBand.monthlySalary) : null,
      salaryEffectiveFrom: currentBand?.effectiveFrom.toISOString().slice(0, 10) ?? null,
      bankCode: bank?.bankCode ?? null,
      bankAccountMasked: bank?.accountNo ? maskAccount(bank.accountNo) : null,
      lastAdjustmentAt: lastChange?.changedAt.toISOString() ?? null,
      salaryReviewDue,
    };
  }

  private async buildKpiSummary(employeeId: string): Promise<EmployeeOverviewKpiSummary | null> {
    const assignment = await this.prisma.kpiAssignment.findFirst({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        score: true,
        template: { select: { name: true } },
        cycle: { select: { name: true } },
      },
    });
    if (!assignment) return { latestScore: null, latestPeriod: null, status: null };
    return {
      latestScore: assignment.score?.totalScore != null ? Number(assignment.score.totalScore) : null,
      latestPeriod: assignment.cycle?.name ?? assignment.template?.name ?? null,
      status: assignment.status,
    };
  }

  private async buildRecentActivities(employeeId: string): Promise<EmployeeOverviewActivity[]> {
    const [auditRows, changeRows] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entityId: employeeId },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      }),
      this.prisma.employeeChangeHistory.findMany({
        where: { employeeId },
        orderBy: { changedAt: 'desc' },
        take: 10,
      }),
    ]);

    const fromAudit: EmployeeOverviewActivity[] = auditRows.map((row) => ({
      id: String(row.id),
      title: row.action,
      description: row.entityType,
      occurredAt: row.occurredAt.toISOString(),
      actorName: row.actorUserId,
      source: 'Web',
    }));

    const fromChanges: EmployeeOverviewActivity[] = changeRows.map((row) => ({
      id: row.id,
      title: `Updated ${row.fieldName}`,
      description: row.changeType,
      occurredAt: row.changedAt.toISOString(),
      actorName: row.changedBy,
      source: row.source ?? 'Web',
    }));

    return [...fromAudit, ...fromChanges]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10);
  }

  private buildAlerts(input: {
    telegramStatus: EmployeeOverviewSummary['telegramStatus'];
    docMissing: number;
    hasBank: boolean;
    hasNationalId: boolean;
    isBirthdayToday: boolean;
    isAnniversaryToday: boolean;
    probationEndDate: Date | null;
    employmentStatus: string;
    salaryReviewDue: boolean;
    today: Date;
  }): EmployeeOverviewAlert[] {
    const alerts: EmployeeOverviewAlert[] = [];

    if (input.isBirthdayToday) {
      alerts.push({
        id: 'birthday-today',
        icon: '🎂',
        title: 'วันนี้วันเกิด',
        description: 'พนักงานมีวันเกิดวันนี้',
        actionLabel: 'ดูข้อมูลส่วนตัว',
        actionTab: 'personal',
      });
    }

    if (input.isAnniversaryToday) {
      alerts.push({
        id: 'anniversary-today',
        icon: '🎉',
        title: 'วันนี้ครบรอบการทำงาน',
        description: 'พนักงานครบรอบการทำงานวันนี้',
        actionLabel: 'ดูการจ้างงาน',
        actionTab: 'employment',
      });
    }

    if (input.telegramStatus === 'not_linked' || input.telegramStatus === 'expired') {
      alerts.push({
        id: 'telegram-missing',
        icon: '⚠',
        title: 'Telegram ยังไม่ได้เชื่อม',
        description: 'ส่งลิงก์เชื่อมบัญชี Telegram ให้พนักงาน',
        actionLabel: 'เชื่อม Telegram',
        actionTab: 'overview',
      });
    }

    if (!input.hasBank) {
      alerts.push({
        id: 'bank-missing',
        icon: '⚠',
        title: 'ยังไม่มีบัญชีธนาคาร',
        description: 'เพิ่มข้อมูลบัญชีธนาคารสำหรับจ่ายเงินเดือน',
        actionLabel: 'เพิ่มบัญชี',
        actionTab: 'salary',
      });
    }

    if (!input.hasNationalId) {
      alerts.push({
        id: 'national-id-missing',
        icon: '🪪',
        title: 'ยังไม่มีเลขบัตรประชาชน',
        description: 'เพิ่มเลขบัตรประชาชนในโปรไฟล์พนักงาน',
        actionLabel: 'ดูข้อมูลส่วนตัว',
        actionTab: 'personal',
      });
    }

    if (input.docMissing > 0) {
      alerts.push({
        id: 'docs-missing',
        icon: '📄',
        title: 'เอกสารยังไม่ครบ',
        description: `ยังขาดเอกสารที่จำเป็น ${input.docMissing} รายการ`,
        actionLabel: 'ดูเอกสาร',
        actionTab: 'documents',
      });
    }

    if (input.employmentStatus === 'probation' && input.probationEndDate) {
      const daysLeft = daysUntilBangkok(input.probationEndDate, input.today);
      if (daysLeft >= 0 && daysLeft <= 30) {
        alerts.push({
          id: 'probation-ending',
          icon: '⏳',
          title: 'ใกล้สิ้นสุดทดลองงาน',
          description: `เหลืออีก ${daysLeft} วัน`,
          actionLabel: 'ดูการจ้างงาน',
          actionTab: 'employment',
        });
      }
    }

    if (input.salaryReviewDue) {
      alerts.push({
        id: 'salary-review-due',
        icon: '💰',
        title: 'ถึงกำหนดทบทวนเงินเดือน',
        description: 'ควรพิจารณาทบทวนเงินเดือนตามรอบประจำปี',
        actionLabel: 'ดูเงินเดือน',
        actionTab: 'salary',
      });
    }

    return alerts;
  }

  private buildUpcomingEvents(
    employee: {
      dateOfBirth: Date | null;
      hireDate: Date;
      probationEndDate: Date | null;
    },
    now: Date,
    today: Date,
  ): EmployeeOverviewUpcomingEvent[] {
    const events: EmployeeOverviewUpcomingEvent[] = [];

    if (employee.dateOfBirth) {
      const birth = bangkokCalendarParts(employee.dateOfBirth);
      const ref = bangkokCalendarParts(now);
      let nextBirthday = new Date(Date.UTC(ref.year, birth.month - 1, birth.day));
      if (nextBirthday < now) {
        nextBirthday = new Date(Date.UTC(ref.year + 1, birth.month - 1, birth.day));
      }
      const daysUntil = daysUntilBangkok(nextBirthday, today);
      if (daysUntil >= 0 && daysUntil <= 365) {
        events.push({
          id: 'birthday',
          icon: '🎂',
          title: 'วันเกิด',
          description: `${birth.day}/${birth.month}`,
          eventDate: nextBirthday.toISOString().slice(0, 10),
          daysUntil,
        });
      }
    }

    const hire = bangkokCalendarParts(employee.hireDate);
    const ref = bangkokCalendarParts(now);
    let nextAnniversary = new Date(Date.UTC(ref.year, hire.month - 1, hire.day));
    if (nextAnniversary < now) {
      nextAnniversary = new Date(Date.UTC(ref.year + 1, hire.month - 1, hire.day));
    }
    const anniversaryDays = daysUntilBangkok(nextAnniversary, today);
    if (anniversaryDays >= 0) {
      events.push({
        id: 'work-anniversary',
        icon: '🎉',
        title: 'ครบรอบทำงาน',
        description: formatTenureDisplay(calculateTenureBreakdown(employee.hireDate, nextAnniversary)),
        eventDate: nextAnniversary.toISOString().slice(0, 10),
        daysUntil: anniversaryDays,
      });
    }

    if (employee.probationEndDate && employee.probationEndDate >= today) {
      events.push({
        id: 'probation-end',
        icon: '⏳',
        title: 'สิ้นสุดทดลองงาน',
        description: employee.probationEndDate.toISOString().slice(0, 10),
        eventDate: employee.probationEndDate.toISOString().slice(0, 10),
        daysUntil: daysUntilBangkok(employee.probationEndDate, today),
      });
    }

    return events.sort((a, b) => a.daysUntil - b.daysUntil);
  }
}

function maskAccount(account: string): string {
  if (account.length <= 4) return account;
  return `${'•'.repeat(Math.max(0, account.length - 4))}${account.slice(-4)}`;
}
