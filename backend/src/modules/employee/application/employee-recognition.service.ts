// ============================================================================
// modules/employee/application/employee-recognition.service.ts
// HR-013c / EMP-011 — recognition, awards & service milestones.
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AuditService } from '../../../shared/audit/audit.service';
import { ConflictError } from '../../../shared/kernel/domain-error';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import {
  AWARD_AND_SERVICE_TYPES,
  MONTHLY_AWARD_TYPES,
  SERVICE_AWARD_BY_YEARS,
  SERVICE_AWARD_MILESTONE_YEARS,
  isMonthlyAwardType,
  isServiceAwardType,
} from '../domain/employee-recognition.constants';
import {
  bangkokCalendarParts,
  completeAnniversaryYears,
  daysUntilBangkok,
  isSameMonthDay,
} from '../domain/services/employee-date-events.service';
import { EmployeeRecognitionAccessService } from './employee-recognition-access.service';
import {
  CreateEmployeeRecognitionDto,
  EmployeeAwardsDashboardResponse,
  EmployeeRecognitionListResponse,
  EmployeeRecognitionResponse,
  EmployeeRecognitionType,
  MarkAnniversaryGiftDto,
  MarkBirthdayGiftDto,
} from './dto/employee-recognition.dto';
import { EmployeeRecognitionNotifier } from '../../telegram/application/employee-recognition.notifier';
import { DateProvider } from '../../../shared/time/date.provider';

const SYSTEM_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class EmployeeRecognitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeRecognitionAccessService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    @Optional() @Inject(forwardRef(() => EmployeeRecognitionNotifier))
    private readonly telegram?: EmployeeRecognitionNotifier,
  ) {}

  private ref(asOf?: Date): Date {
    return asOf ?? this.dates.now();
  }

  async listRecognitions(
    actor: ActorContext,
    employeeId: string,
    companyId?: string,
    recognitionType?: EmployeeRecognitionType,
  ): Promise<EmployeeRecognitionListResponse> {
    const resolvedCompanyId = companyId ?? await this.resolvePrimaryCompanyId(employeeId);
    await this.access.assertCanRead(actor, employeeId, resolvedCompanyId);

    const rows = await this.prisma.employeeRecognition.findMany({
      where: {
        employeeId,
        companyId: resolvedCompanyId,
        deletedAt: null,
        ...(recognitionType ? { recognitionType } : {}),
      },
      orderBy: [{ recognitionDate: 'desc' }, { createdAt: 'desc' }],
    });

    const items = await Promise.all(rows.map((row) => this.toResponse(row)));
    return { employeeId, items };
  }

  async getAwardsDashboard(
    actor: ActorContext,
    companyId: string,
    asOf?: Date,
  ): Promise<EmployeeAwardsDashboardResponse> {
    const ref = this.ref(asOf);
    await this.access.assertCanReadCompanyDashboard(actor, companyId);
    const cal = bangkokCalendarParts(ref);

    const monthStart = new Date(Date.UTC(cal.year, cal.month - 1, 1));
    const monthEnd = new Date(Date.UTC(cal.year, cal.month, 0));

    const awardsThisMonthRows = await this.prisma.employeeRecognition.findMany({
      where: {
        companyId,
        deletedAt: null,
        recognitionType: { in: [...AWARD_AND_SERVICE_TYPES] },
        OR: [
          { recognitionDate: { gte: monthStart, lte: monthEnd } },
          { awardMonth: { gte: monthStart, lte: monthEnd } },
        ],
      },
      orderBy: [{ recognitionDate: 'desc' }],
      take: 50,
    });

    const awardsThisMonth = await Promise.all(
      awardsThisMonthRows.map(async (row) => {
        const employee = await this.loadEmployeeSummary(row.employeeId);
        return {
          id: row.id,
          employeeId: row.employeeId,
          employeeName: employee?.name ?? row.employeeId,
          department: employee?.department ?? null,
          position: employee?.position ?? null,
          recognitionType: row.recognitionType as EmployeeRecognitionType,
          recognitionDate: row.recognitionDate.toISOString().slice(0, 10),
          awardMonth: row.awardMonth ? row.awardMonth.toISOString().slice(0, 10) : null,
          giftOrReward: row.giftOrReward,
          notes: row.notes,
        };
      }),
    );

    const recentRows = await this.prisma.employeeRecognition.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
    });
    const recentRecognitions = await Promise.all(
      recentRows.map(async (row) => {
        const employee = await this.loadEmployeeSummary(row.employeeId);
        return {
          id: row.id,
          employeeId: row.employeeId,
          employeeName: employee?.name ?? row.employeeId,
          department: employee?.department ?? null,
          position: employee?.position ?? null,
          recognitionType: row.recognitionType as EmployeeRecognitionType,
          recognitionDate: row.recognitionDate.toISOString().slice(0, 10),
          awardMonth: row.awardMonth ? row.awardMonth.toISOString().slice(0, 10) : null,
          giftOrReward: row.giftOrReward,
          notes: row.notes,
        };
      }),
    );

    const serviceAwardsDue = await this.findServiceAwardsDue(companyId, ref);

    return { awardsThisMonth, serviceAwardsDue, recentRecognitions };
  }

  async createRecognition(
    actor: ActorContext,
    employeeId: string,
    dto: CreateEmployeeRecognitionDto,
  ): Promise<EmployeeRecognitionResponse> {
    await this.access.assertCanCreate(actor, employeeId, dto.companyId);
    await this.assertEmployeeExists(employeeId);

    if (dto.recognitionType === 'BIRTHDAY_GIFT' || dto.recognitionType === 'WORK_ANNIVERSARY_GIFT') {
      await this.assertNoDuplicateGiftThisYear(
        employeeId,
        dto.companyId,
        dto.recognitionType,
        dto.recognitionDate,
      );
    }

    if (isServiceAwardType(dto.recognitionType)) {
      await this.assertNoDuplicateServiceAward(employeeId, dto.companyId, dto.recognitionType);
    }

    if (isMonthlyAwardType(dto.recognitionType) && dto.awardMonth) {
      await this.assertNoDuplicateMonthlyAward(
        employeeId,
        dto.companyId,
        dto.recognitionType,
        dto.awardMonth,
      );
    }

    const row = await this.insertRecognition(actor, employeeId, dto);
    await this.notifyAfterCreate(row, dto.announceCompanyWide);
    return this.toResponse(row);
  }

  async markBirthdayGift(
    actor: ActorContext,
    employeeId: string,
    dto: MarkBirthdayGiftDto,
  ): Promise<EmployeeRecognitionResponse> {
    return this.createRecognition(actor, employeeId, {
      companyId: dto.companyId,
      recognitionType: 'BIRTHDAY_GIFT',
      recognitionDate: dto.recognitionDate,
      notes: dto.notes,
      announceCompanyWide: dto.announceCompanyWide,
    });
  }

  async markAnniversaryGift(
    actor: ActorContext,
    employeeId: string,
    dto: MarkAnniversaryGiftDto,
  ): Promise<EmployeeRecognitionResponse> {
    return this.createRecognition(actor, employeeId, {
      companyId: dto.companyId,
      recognitionType: 'WORK_ANNIVERSARY_GIFT',
      recognitionDate: dto.recognitionDate,
      notes: dto.notes,
    });
  }

  /** EMP-011 — daily service milestone automation (called from scheduler). */
  async processServiceAwardMilestones(companyId: string, asOf?: Date): Promise<number> {
    const ref = this.ref(asOf);
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hireDate: true,
      },
    });

    let created = 0;
    const actor: ActorContext = {
      userId: SYSTEM_ACTOR_USER_ID,
      impersonatorUserId: null,
      companyId: null,
    };

    for (const employee of employees) {
      if (!isSameMonthDay(employee.hireDate, ref)) continue;
      const years = completeAnniversaryYears(employee.hireDate, ref);
      if (!(SERVICE_AWARD_MILESTONE_YEARS as readonly number[]).includes(years)) continue;

      const recognitionType = SERVICE_AWARD_BY_YEARS[years];
      if (!recognitionType) continue;

      const existing = await this.prisma.employeeRecognition.findFirst({
        where: {
          employeeId: employee.id,
          companyId,
          recognitionType,
          deletedAt: null,
        },
      });
      if (existing) continue;

      const row = await this.insertRecognition(actor, employee.id, {
        companyId,
        recognitionType,
        recognitionDate: ref.toISOString().slice(0, 10),
        notes: `Auto service award — ${years} year milestone (EMP-011)`,
      });

      if (this.telegram) {
        await this.telegram.notifyAwardGiven({
          companyId,
          employeeId: employee.id,
          recognitionType,
          recognitionDate: row.recognitionDate,
          giftOrReward: row.giftOrReward,
          notes: row.notes,
          announceCompanyWide: years >= 5,
        }).catch(() => undefined);
      }

      created += 1;
    }

    return created;
  }

  async hasGiftThisYear(
    employeeId: string,
    companyId: string,
    type: 'BIRTHDAY_GIFT' | 'WORK_ANNIVERSARY_GIFT',
    asOf?: Date,
  ): Promise<{ given: boolean; recognitionDate: string | null }> {
    const ref = this.ref(asOf);
    const year = bangkokCalendarParts(ref).year;
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    const row = await this.prisma.employeeRecognition.findFirst({
      where: {
        employeeId,
        companyId,
        recognitionType: type,
        deletedAt: null,
        recognitionDate: { gte: start, lte: end },
      },
      orderBy: { recognitionDate: 'desc' },
    });

    return {
      given: !!row,
      recognitionDate: row ? row.recognitionDate.toISOString().slice(0, 10) : null,
    };
  }

  private async findServiceAwardsDue(companyId: string, asOf: Date) {
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        hireDate: true,
      },
    });

    const due = [];
    for (const employee of employees) {
      for (const milestoneYears of SERVICE_AWARD_MILESTONE_YEARS) {
        const anniversaryDate = this.nextMilestoneAnniversaryDate(employee.hireDate, milestoneYears, asOf);
        if (!anniversaryDate) continue;

        const daysUntil = daysUntilBangkok(anniversaryDate, asOf);
        if (daysUntil < 0 || daysUntil > 30) continue;

        const serviceAwardType = SERVICE_AWARD_BY_YEARS[milestoneYears];
        const existing = await this.prisma.employeeRecognition.findFirst({
          where: {
            employeeId: employee.id,
            companyId,
            recognitionType: serviceAwardType,
            deletedAt: null,
          },
        });
        if (existing) continue;

        due.push({
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          department: employee.department,
          position: employee.position,
          milestoneYears,
          serviceAwardType,
          anniversaryDate: anniversaryDate.toISOString().slice(0, 10),
          daysUntil,
        });
      }
    }

    due.sort((a, b) => a.daysUntil - b.daysUntil);
    return due;
  }

  private nextMilestoneAnniversaryDate(hireDate: Date, milestoneYears: number, asOf: Date): Date | null {
    const ref = bangkokCalendarParts(asOf);
    const hire = bangkokCalendarParts(hireDate);
    const anniversary = new Date(Date.UTC(ref.year, hire.month - 1, hire.day));
    const yearsOnAnniversary = completeAnniversaryYears(hireDate, anniversary);
    if (yearsOnAnniversary === milestoneYears) return anniversary;

    const nextYear = yearsOnAnniversary < milestoneYears ? ref.year : ref.year + 1;
    const candidate = new Date(Date.UTC(nextYear, hire.month - 1, hire.day));
    return completeAnniversaryYears(hireDate, candidate) === milestoneYears ? candidate : null;
  }

  private async insertRecognition(
    actor: ActorContext,
    employeeId: string,
    input: CreateEmployeeRecognitionDto,
  ) {
    const id = randomUUID();
    const recognitionDate = input.recognitionDate
      ? new Date(input.recognitionDate)
      : this.dates.now();
    const awardMonth = input.awardMonth ? new Date(input.awardMonth) : null;

    const row = await this.prisma.employeeRecognition.create({
      data: {
        id,
        employeeId,
        companyId: input.companyId,
        recognitionType: input.recognitionType,
        recognitionDate,
        awardMonth,
        giftOrReward: input.giftOrReward?.trim() || null,
        notes: input.notes?.trim() || null,
        recordedBy: actor.userId,
        givenBy: input.givenBy ?? actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'EmployeeRecognition',
      entityId: id,
      action: 'create',
      after: row,
    });

    return row;
  }

  private async assertNoDuplicateGiftThisYear(
    employeeId: string,
    companyId: string,
    type: 'BIRTHDAY_GIFT' | 'WORK_ANNIVERSARY_GIFT',
    recognitionDate?: string,
  ): Promise<void> {
    const asOf = recognitionDate ? new Date(recognitionDate) : this.dates.now();
    const existing = await this.hasGiftThisYear(employeeId, companyId, type, asOf);
    if (existing.given) {
      const label = type === 'BIRTHDAY_GIFT' ? 'birthday gift' : 'anniversary gift';
      throw new ConflictError(`${label} already recorded for this year`);
    }
  }

  private async assertNoDuplicateServiceAward(
    employeeId: string,
    companyId: string,
    type: EmployeeRecognitionType,
  ): Promise<void> {
    const existing = await this.prisma.employeeRecognition.findFirst({
      where: { employeeId, companyId, recognitionType: type, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError(`Service award ${type} already recorded for this employee`);
    }
  }

  private async assertNoDuplicateMonthlyAward(
    employeeId: string,
    companyId: string,
    type: EmployeeRecognitionType,
    awardMonth: string,
  ): Promise<void> {
    const month = new Date(awardMonth);
    const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));

    const existing = await this.prisma.employeeRecognition.findFirst({
      where: {
        employeeId,
        companyId,
        recognitionType: type,
        deletedAt: null,
        awardMonth: { gte: monthStart, lte: monthEnd },
      },
    });
    if (existing) {
      throw new ConflictError(`${type} already recorded for this award month`);
    }
  }

  private async assertEmployeeExists(employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new EmployeeNotFoundError(employeeId);
  }

  private async resolvePrimaryCompanyId(employeeId: string): Promise<string> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { companyId: true },
    });
    if (assignment) return assignment.companyId;

    const any = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    if (!any) throw new EmployeeNotFoundError(employeeId);
    return any.companyId;
  }

  private async loadEmployeeSummary(employeeId: string): Promise<{
    name: string;
    department: string | null;
    position: string | null;
  } | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { firstName: true, lastName: true, department: true, position: true },
    });
    if (!employee) return null;
    return {
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      department: employee.department,
      position: employee.position,
    };
  }

  private async notifyAfterCreate(
    row: {
      id: string;
      employeeId: string;
      companyId: string;
      recognitionType: string;
      recognitionDate: Date;
      giftOrReward: string | null;
      notes: string | null;
    },
    announceCompanyWide?: boolean,
  ): Promise<void> {
    if (!this.telegram) return;

    if (row.recognitionType === 'BIRTHDAY_GIFT' || row.recognitionType === 'WORK_ANNIVERSARY_GIFT') {
      await this.telegram.notifyGiftRecorded({
        companyId: row.companyId,
        employeeId: row.employeeId,
        recognitionType: row.recognitionType as 'BIRTHDAY_GIFT' | 'WORK_ANNIVERSARY_GIFT',
        recognitionDate: row.recognitionDate,
        notes: row.notes,
      }).catch(() => undefined);

      if (row.recognitionType === 'BIRTHDAY_GIFT' && announceCompanyWide) {
        await this.telegram.broadcastCompanyBirthdayAnnouncement(
          row.companyId,
          row.employeeId,
        ).catch(() => undefined);
      }
      return;
    }

    if ((AWARD_AND_SERVICE_TYPES as readonly string[]).includes(row.recognitionType)) {
      await this.telegram.notifyAwardGiven({
        companyId: row.companyId,
        employeeId: row.employeeId,
        recognitionType: row.recognitionType as EmployeeRecognitionType,
        recognitionDate: row.recognitionDate,
        giftOrReward: row.giftOrReward,
        notes: row.notes,
        announceCompanyWide,
      }).catch(() => undefined);
    }
  }

  private async toResponse(row: {
    id: string;
    employeeId: string;
    companyId: string;
    recognitionType: string;
    recognitionDate: Date;
    awardMonth: Date | null;
    giftOrReward: string | null;
    notes: string | null;
    recordedBy: string;
    givenBy: string | null;
    createdAt: Date;
  }): Promise<EmployeeRecognitionResponse> {
    const [recorder, giver] = await Promise.all([
      this.loadUserDisplayName(row.recordedBy),
      row.givenBy ? this.loadUserDisplayName(row.givenBy) : Promise.resolve(null),
    ]);

    return {
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      recognitionType: row.recognitionType as EmployeeRecognitionType,
      recognitionDate: row.recognitionDate.toISOString().slice(0, 10),
      awardMonth: row.awardMonth ? row.awardMonth.toISOString().slice(0, 10) : null,
      giftOrReward: row.giftOrReward,
      notes: row.notes,
      recordedBy: row.recordedBy,
      recorderName: recorder,
      givenBy: row.givenBy,
      givenByName: giver,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async loadUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    if (!user) return null;
    if (user.employee) {
      return `${user.employee.firstName} ${user.employee.lastName}`.trim();
    }
    return user.username ?? null;
  }
}
