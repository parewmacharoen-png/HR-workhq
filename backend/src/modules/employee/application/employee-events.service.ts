// ============================================================================
// modules/employee/application/employee-events.service.ts
// Dashboard queries + today's recognition events (EMP-006/007).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  bangkokCalendarParts,
  calculateAgeYears,
  calculateTenureBreakdown,
  completeAnniversaryYears,
  daysUntilBangkok,
  formatDateDdMmYyyy,
  formatTenureDisplay,
  formatTenureDisplayDetailed,
  isMilestoneAnniversaryYear,
  isSameMonthDay,
  milestoneLabelThai,
  nextMilestoneAnniversary,
  occursInMonth,
  resolveProbationStatus,
  upcomingSortKey,
} from '../domain/services/employee-date-events.service';
import {
  AnniversaryDashboardItem,
  BirthdayDashboardItem,
  EmployeeProfileDatesResponse,
  EmployeeRecognitionDashboardResponse,
  EmployeeTenureDashboardResponse,
  LongestTenureDashboardItem,
  ProbationEndingSoonBuckets,
  ProbationEndingSoonItem,
  TenureFields,
} from './dto/employee-events.dto';

export interface RecognitionEmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  position: string | null;
  dateOfBirth: Date | null;
  hireDate: Date;
  employmentStatus?: string;
  probationEndDate?: Date | null;
}

export interface TodayBirthdayEvent {
  employee: RecognitionEmployeeRow;
}

export interface TodayAnniversaryEvent {
  employee: RecognitionEmployeeRow;
  anniversaryYears: number;
}

@Injectable()
export class EmployeeEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly dates: DateProvider,
  ) {}

  private ref(asOf?: Date): Date {
    return asOf ?? this.dates.now();
  }

  buildTenureInfo(hireDate: Date, asOf?: Date): TenureFields {
    const ref = this.ref(asOf);
    const breakdown = calculateTenureBreakdown(hireDate, ref);
    const tenureDisplay = formatTenureDisplay(breakdown);
    return {
      hireDate: hireDate.toISOString().slice(0, 10),
      tenureYears: breakdown.years,
      tenureMonths: breakdown.months,
      tenureDays: breakdown.days,
      tenureDisplay,
      tenureDisplayDetailed: formatTenureDisplayDetailed(breakdown),
    };
  }

  buildProfileDates(
    dateOfBirth: Date | null,
    hireDate: Date,
    employmentStatus: string,
    asOf?: Date,
  ): EmployeeProfileDatesResponse {
    const ref = this.ref(asOf);
    const tenure = this.buildTenureInfo(hireDate, ref);
    const probation = resolveProbationStatus(employmentStatus);
    const nextMilestone = nextMilestoneAnniversary(hireDate, ref);
    return {
      dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
      ageYears: dateOfBirth ? calculateAgeYears(dateOfBirth, ref) : null,
      ...tenure,
      tenureText: tenure.tenureDisplay,
      anniversaryYears: completeAnniversaryYears(hireDate, ref),
      probationStatus: probation.label,
      probationStatusCode: probation.code,
      nextAnniversaryMilestoneYears: nextMilestone?.years ?? null,
      nextAnniversaryMilestoneLabel: nextMilestone?.label ?? null,
    };
  }

  async getRecognitionDashboard(
    actor: ActorContext,
    companyId: string,
    asOf?: Date,
  ): Promise<EmployeeRecognitionDashboardResponse> {
    const ref = this.ref(asOf);
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employees = await this.loadActiveCompanyEmployees(companyId);
    const cal = bangkokCalendarParts(ref);
    const giftStatus = await this.loadGiftStatusMap(companyId, employees.map((e) => e.id), ref);

    const birthdaysThisMonth: BirthdayDashboardItem[] = employees
      .filter((e) => e.dateOfBirth && occursInMonth(e.dateOfBirth, ref))
      .map((e) => {
        const parts = bangkokCalendarParts(e.dateOfBirth!);
        const gifts = giftStatus.get(e.id);
        return {
          employeeId: e.id,
          employeeName: `${e.firstName} ${e.lastName}`,
          department: e.department,
          position: e.position,
          birthday: formatDateDdMmYyyy(e.dateOfBirth!),
          birthdayDay: parts.day,
          birthdayGiftGivenThisYear: gifts?.birthdayGiven ?? false,
          birthdayGiftDate: gifts?.birthdayDate ?? null,
        };
      })
      .sort((a, b) => upcomingSortKey(a.birthdayDay, cal) - upcomingSortKey(b.birthdayDay, cal));

    const anniversariesThisMonth = employees
      .map((e): AnniversaryDashboardItem | null => {
        if (!occursInMonth(e.hireDate, ref)) return null;
        const hire = bangkokCalendarParts(e.hireDate);
        const yearsOnAnniversary = cal.year - hire.year;
        if (yearsOnAnniversary <= 0 || !isMilestoneAnniversaryYear(yearsOnAnniversary)) return null;
        const gifts = giftStatus.get(e.id);
        return {
          employeeId: e.id,
          employeeName: `${e.firstName} ${e.lastName}`,
          department: e.department,
          position: e.position,
          hireDate: formatDateDdMmYyyy(e.hireDate),
          anniversaryYears: yearsOnAnniversary,
          milestoneLabel: milestoneLabelThai(yearsOnAnniversary),
          anniversaryDay: hire.day,
          anniversaryGiftGivenThisYear: gifts?.anniversaryGiven ?? false,
          anniversaryGiftDate: gifts?.anniversaryDate ?? null,
        };
      })
      .filter((row): row is AnniversaryDashboardItem => row !== null)
      .sort((a, b) => upcomingSortKey(a.anniversaryDay, cal) - upcomingSortKey(b.anniversaryDay, cal));

    return { birthdaysThisMonth, anniversariesThisMonth };
  }

  async getTenureDashboard(
    actor: ActorContext,
    companyId: string,
    asOf?: Date,
  ): Promise<EmployeeTenureDashboardResponse> {
    const ref = this.ref(asOf);
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employees = await this.loadActiveCompanyEmployees(companyId, true);

    let longestTenure: LongestTenureDashboardItem | null = null;
    let maxTotalDays = -1;

    for (const employee of employees) {
      const breakdown = calculateTenureBreakdown(employee.hireDate, ref);
      if (breakdown.totalDays <= maxTotalDays) continue;
      maxTotalDays = breakdown.totalDays;
      longestTenure = {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        position: employee.position,
        tenureDisplay: formatTenureDisplay(breakdown),
        tenureYears: breakdown.years,
        tenureMonths: breakdown.months,
        tenureDays: breakdown.days,
      };
    }

    return {
      longestTenure,
      probationEndingSoon: this.buildProbationEndingSoon(employees, ref),
    };
  }

  private buildProbationEndingSoon(
    employees: RecognitionEmployeeRow[],
    asOf: Date,
  ): ProbationEndingSoonBuckets {
    const buckets: ProbationEndingSoonBuckets = {
      within7Days: [],
      within14Days: [],
      within30Days: [],
    };

    for (const employee of employees) {
      if (employee.employmentStatus !== 'probation' || !employee.probationEndDate) continue;
      const daysRemaining = daysUntilBangkok(employee.probationEndDate, asOf);
      if (daysRemaining < 0 || daysRemaining > 30) continue;

      const item: ProbationEndingSoonItem = {
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        position: employee.position,
        probationEndDate: employee.probationEndDate.toISOString().slice(0, 10),
        daysRemaining,
      };

      if (daysRemaining <= 7) buckets.within7Days.push(item);
      if (daysRemaining <= 14) buckets.within14Days.push(item);
      if (daysRemaining <= 30) buckets.within30Days.push(item);
    }

    const sortBySoonest = (a: ProbationEndingSoonItem, b: ProbationEndingSoonItem) =>
      a.daysRemaining - b.daysRemaining;
    buckets.within7Days.sort(sortBySoonest);
    buckets.within14Days.sort(sortBySoonest);
    buckets.within30Days.sort(sortBySoonest);

    return buckets;
  }

  async getTodaysBirthdays(companyId: string, asOf?: Date): Promise<TodayBirthdayEvent[]> {
    const ref = this.ref(asOf);
    const employees = await this.loadActiveCompanyEmployees(companyId);
    return employees
      .filter((e) => e.dateOfBirth && isSameMonthDay(e.dateOfBirth, ref))
      .map((employee) => ({ employee }));
  }

  async getTodaysAnniversaries(companyId: string, asOf?: Date): Promise<TodayAnniversaryEvent[]> {
    const ref = this.ref(asOf);
    const employees = await this.loadActiveCompanyEmployees(companyId);
    const cal = bangkokCalendarParts(ref);
    return employees
      .filter((e) => isSameMonthDay(e.hireDate, ref))
      .map((employee) => ({
        employee,
        anniversaryYears: cal.year - bangkokCalendarParts(employee.hireDate).year,
      }))
      .filter((e) => e.anniversaryYears >= 1);
  }

  private async loadActiveCompanyEmployees(
    companyId: string,
    includeProbationFields = false,
  ): Promise<RecognitionEmployeeRow[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: {
          some: {
            companyId,
            effectiveTo: null,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        dateOfBirth: true,
        hireDate: true,
        ...(includeProbationFields
          ? { employmentStatus: true, probationEndDate: true }
          : {}),
      },
      orderBy: { globalId: 'asc' },
    });
    return rows;
  }

  private async loadGiftStatusMap(
    companyId: string,
    employeeIds: string[],
    asOf: Date,
  ): Promise<Map<string, {
    birthdayGiven: boolean;
    birthdayDate: string | null;
    anniversaryGiven: boolean;
    anniversaryDate: string | null;
  }>> {
    const map = new Map<string, {
      birthdayGiven: boolean;
      birthdayDate: string | null;
      anniversaryGiven: boolean;
      anniversaryDate: string | null;
    }>();
    if (!employeeIds.length) return map;

    const year = bangkokCalendarParts(asOf).year;
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    const rows = await this.prisma.employeeRecognition.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        deletedAt: null,
        recognitionDate: { gte: start, lte: end },
        recognitionType: { in: ['BIRTHDAY_GIFT', 'WORK_ANNIVERSARY_GIFT'] },
      },
      orderBy: { recognitionDate: 'desc' },
    });

    for (const id of employeeIds) {
      map.set(id, {
        birthdayGiven: false,
        birthdayDate: null,
        anniversaryGiven: false,
        anniversaryDate: null,
      });
    }

    for (const row of rows) {
      const entry = map.get(row.employeeId);
      if (!entry) continue;
      const dateStr = row.recognitionDate.toISOString().slice(0, 10);
      if (row.recognitionType === 'BIRTHDAY_GIFT' && !entry.birthdayGiven) {
        entry.birthdayGiven = true;
        entry.birthdayDate = dateStr;
      }
      if (row.recognitionType === 'WORK_ANNIVERSARY_GIFT' && !entry.anniversaryGiven) {
        entry.anniversaryGiven = true;
        entry.anniversaryDate = dateStr;
      }
    }

    return map;
  }
}
