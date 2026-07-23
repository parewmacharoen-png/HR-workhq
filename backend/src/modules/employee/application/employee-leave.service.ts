import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LeaveService } from '../../leave/application/leave.service';
import { LeaveRequestNotFoundError, LeaveTypeNotFoundError } from '../../leave/domain/errors/leave.errors';
import { halfYearPeriodContaining } from '../../leave/domain/services/emergency-leave-entitlement.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import { ValidationError } from '../../../shared/kernel/domain-error';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { isShortNotice } from '../../leave/domain/services/leave-notice.util';
import { MonthlyOffService } from '../../attendance/application/monthly-off.service';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';
import { EmployeeAccessService } from './employee-access.service';
import {
  EmployeeLeaveBalanceEditDto,
  EmployeeLeaveHistoryItemDto,
  EmployeeLeaveResponseDto,
  EmployeeLeaveSummaryDto,
  EmployeeLeaveYearUsageDto,
} from './dto/employee-leave.dto';
import {
  DeleteEmployeeLeaveHistoryDto,
  UpdateEmployeeLeaveHistoryDto,
} from './dto/employee-leave-history.dto';
import { UpdateEmployeeLeaveBalancesDto } from './dto/employee-leave-balances.dto';

const OPENING_BALANCE_TYPES = ['emergency', 'sick', 'unpaid'] as const;
type OpeningBalanceType = (typeof OPENING_BALANCE_TYPES)[number];

const OPENING_TYPE_LABELS: Record<OpeningBalanceType, string> = {
  emergency: 'ลากรณีฉุกเฉิน',
  sick: 'ลาป่วย',
  unpaid: 'ลาไม่รับค่าจ้าง',
};

@Injectable()
export class EmployeeLeaveService {
  private readonly logger = new Logger(EmployeeLeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly leaveService: LeaveService,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly dates: DateProvider,
    private readonly monthlyOff: MonthlyOffService,
    private readonly payrollBuilder: PayrollBuilderService,
  ) {}

  async getLeave(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeLeaveResponseDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);

    const noticeDays = (await this.leaveSettings.getRules(companyId)).defaultLeaveNoticeDays;
    const [requests, monthlyOffRows, offDayChanges] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { employeeId, companyId, deletedAt: null },
        include: { leaveType: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.monthlyOffRequest.findMany({
        where: { employeeId, companyId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.requestInstance.findMany({
        where: {
          requesterEmployeeId: employeeId,
          companyId,
          deletedAt: null,
          status: { in: ['approved', 'completed'] },
          requestType: { key: 'off_day_change' },
        },
        include: {
          values: true,
          approvalSteps: {
            where: { status: 'approved' },
            orderBy: { actedAt: 'desc' },
            take: 1,
            include: {
              actorUser: {
                include: { employee: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 200,
      }),
    ]);

    const now = this.dates.now();
    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const changeMeta = this.indexOffDayChanges(offDayChanges);
    const approvers = await this.loadApprovers([
      ...requests,
      ...monthlyOffRows,
    ]);
    const leaveHistory = requests.map((row) => this.mapLeaveHistoryRow(row, approvers, noticeDays));
    // Dates that already appear as a single "เปลี่ยนวันหยุด" row are omitted from monthly-off list.
    const monthlyHistory = monthlyOffRows
      .flatMap((row) => this.mapMonthlyOffHistoryRows(row, noticeDays, approvers))
      .filter((row) => !changeMeta.has(row.startDate));
    const changeHistory = offDayChanges.flatMap((row) =>
      this.mapOffDayChangeHistoryRows(row, noticeDays),
    );
    const history = [...leaveHistory, ...monthlyHistory, ...changeHistory].sort(
      (a, b) => b.requestDate.localeCompare(a.requestDate) || b.startDate.localeCompare(a.startDate),
    );

    const yearItems = history.filter((row) => {
      const created = row.requestDate.slice(0, 10);
      return created >= yearStart.toISOString().slice(0, 10)
        && created <= yearEnd.toISOString().slice(0, 10);
    });

    const approvedYearItems = history.filter(
      (row) => row.status === 'approved' && row.startDate.startsWith(`${year}-`),
    );
    const opening = await this.loadOpeningBalances(
      employeeId,
      companyId,
      year,
      now,
      approvedYearItems,
    );
    const yearUsage = this.buildYearUsage(opening, approvedYearItems);
    const balanceEdits = this.buildBalanceEdits(opening);
    const summary = this.buildSummary(yearUsage, yearItems);

    return { summary, history, balances: balanceEdits };
  }

  async setPriorUsage(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    dto: UpdateEmployeeLeaveBalancesDto,
  ): Promise<EmployeeLeaveResponseDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);

    const rules = await this.leaveSettings.getRules(companyId);
    const now = this.dates.now();
    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));

    const types = await this.prisma.leaveType.findMany({
      where: { code: { in: [...OPENING_BALANCE_TYPES] }, deletedAt: null },
    });
    const typeByCode = new Map(types.map((row) => [row.code, row]));

    const approved = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        status: 'approved',
        startDate: { gte: yearStart, lte: yearEnd },
      },
      include: { leaveType: { select: { code: true } } },
    });

    for (const item of dto.items) {
      const type = typeByCode.get(item.leaveTypeCode);
      if (!type) throw new LeaveTypeNotFoundError(item.leaveTypeCode);

      if (item.leaveTypeCode === 'emergency') {
        const period = halfYearPeriodContaining(now);
        const periodStartIso = period.periodStart.toISOString().slice(0, 10);
        const periodEndIso = period.periodEnd.toISOString().slice(0, 10);
        const systemUsed = approved
          .filter((row) => {
            const start = row.startDate.toISOString().slice(0, 10);
            return row.leaveType.code === 'emergency'
              && start >= periodStartIso
              && start <= periodEndIso;
          })
          .reduce((sum, row) => sum + Number(row.days), 0);
        const entitled = item.entitled ?? rules.emergencyLeaveDaysPerHalfYear;
        const used = item.priorUsed + systemUsed;
        await this.upsertLeaveBalance({
          employeeId,
          leaveTypeId: type.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          entitled,
          used,
          actorUserId: actor.userId,
        });
        continue;
      }

      await this.upsertLeaveBalance({
        employeeId,
        leaveTypeId: type.id,
        periodStart: yearStart,
        periodEnd: yearEnd,
        entitled: 0,
        used: item.priorUsed,
        actorUserId: actor.userId,
      });
    }

    return this.getLeave(actor, employeeId, companyId);
  }

  async updateHistoryItem(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    itemId: string,
    dto: UpdateEmployeeLeaveHistoryDto,
  ): Promise<EmployeeLeaveResponseDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);

    const affectedDates: string[] = [];

    if (dto.source === 'monthly_off') {
      const offDate = dto.offDate ?? dto.startDate;
      const newDate = dto.startDate ?? dto.endDate;
      if (!offDate || !newDate) {
        throw new ValidationError('กรุณาระบุวันที่วันหยุดประจำเดือน');
      }
      const result = await this.monthlyOff.adminUpdateOffDate(
        actor,
        itemId,
        offDate,
        newDate,
        dto.correctionReason,
      );
      affectedDates.push(...result.affectedDates);
    } else {
      const before = await this.prisma.leaveRequest.findFirst({
        where: { id: itemId, employeeId, companyId, deletedAt: null },
      });
      if (!before) throw new LeaveRequestNotFoundError(itemId);

      affectedDates.push(
        ...this.leaveService.leaveAffectedDates(before.startDate, before.endDate),
      );

      await this.leaveService.updateLeaveRequest(actor, itemId, {
        leaveTypeCode: dto.leaveTypeCode,
        startDate: dto.startDate,
        endDate: dto.endDate,
        days: dto.days,
        reason: dto.reason,
        correctionReason: dto.correctionReason,
      });

      const afterStart = dto.startDate ? new Date(dto.startDate) : before.startDate;
      const afterEnd = dto.endDate ? new Date(dto.endDate) : before.endDate;
      affectedDates.push(...this.leaveService.leaveAffectedDates(afterStart, afterEnd));
    }

    await this.rebuildOpenPayrollCycles(actor, companyId, affectedDates);
    return this.getLeave(actor, employeeId, companyId);
  }

  async deleteHistoryItem(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    itemId: string,
    dto: DeleteEmployeeLeaveHistoryDto,
  ): Promise<EmployeeLeaveResponseDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);

    const affectedDates: string[] = [];

    if (dto.source === 'monthly_off') {
      if (!dto.offDate) throw new ValidationError('กรุณาระบุวันที่วันหยุดประจำเดือน');
      const result = await this.monthlyOff.adminDeleteOffDate(actor, itemId, dto.offDate);
      affectedDates.push(...result.affectedDates);
    } else {
      const before = await this.prisma.leaveRequest.findFirst({
        where: { id: itemId, employeeId, companyId, deletedAt: null },
      });
      if (!before) throw new LeaveRequestNotFoundError(itemId);

      affectedDates.push(
        ...this.leaveService.leaveAffectedDates(before.startDate, before.endDate),
      );
      await this.leaveService.deleteLeaveRequest(actor, itemId);
    }

    await this.rebuildOpenPayrollCycles(actor, companyId, affectedDates);
    return this.getLeave(actor, employeeId, companyId);
  }

  private async rebuildOpenPayrollCycles(
    actor: ActorContext,
    companyId: string,
    affectedDates: string[],
  ): Promise<void> {
    const dates = [...new Set(affectedDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    if (!dates.length) return;

    const periodStart = new Date(`${dates[0]}T00:00:00.000Z`);
    const periodEnd = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);

    const cycles = await this.prisma.payrollCycle.findMany({
      where: {
        companyId,
        status: 'open',
        deletedAt: null,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { id: true },
    });

    for (const cycle of cycles) {
      try {
        await this.payrollBuilder.buildCycle(actor, cycle.id);
        this.logger.log(`Rebuilt open payroll cycle ${cycle.id} after leave history change`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Payroll rebuild skipped for cycle ${cycle.id} after leave history change: ${message}`,
        );
      }
    }
  }

  private buildSummary(
    yearUsage: EmployeeLeaveYearUsageDto[],
    yearItems: Array<{ status: string }>,
  ): EmployeeLeaveSummaryDto {
    const pickTotal = (code: string) =>
      yearUsage.find((row) => row.leaveTypeCode === code)?.totalUsed ?? 0;
    const emergencyRemaining =
      yearUsage.find((row) => row.leaveTypeCode === 'emergency')?.remaining ?? 0;

    return {
      annualLeaveRemaining: 0,
      emergencyLeaveRemaining: emergencyRemaining,
      sickLeaveUsed: pickTotal('sick'),
      unpaidLeaveUsed: pickTotal('unpaid'),
      leaveRequestsThisYear: yearItems.length,
      pendingRequests: yearItems.filter((row) => row.status === 'pending').length,
      approvedRequests: yearItems.filter((row) => row.status === 'approved').length,
      rejectedRequests: yearItems.filter((row) => row.status === 'rejected').length,
      cancelledRequests: yearItems.filter((row) => row.status === 'cancelled').length,
      yearUsage,
    };
  }

  private buildYearUsage(
    opening: Map<OpeningBalanceType, {
      leaveTypeName: string;
      priorUsed: number;
      yearPriorUsed: number;
      entitled: number;
      remaining: number | null;
    }>,
    approvedYearItems: EmployeeLeaveHistoryItemDto[],
  ): EmployeeLeaveYearUsageDto[] {
    const usage: EmployeeLeaveYearUsageDto[] = [];

    for (const code of OPENING_BALANCE_TYPES) {
      const row = opening.get(code);
      const systemUsed = this.sumSystemUsed(approvedYearItems, code);
      const priorUsed = row?.yearPriorUsed ?? 0;
      usage.push({
        leaveTypeCode: code,
        leaveTypeName: row?.leaveTypeName ?? OPENING_TYPE_LABELS[code],
        priorUsed,
        systemUsed,
        totalUsed: priorUsed + systemUsed,
        remaining: code === 'emergency' ? (row?.remaining ?? 0) : null,
      });
    }

    const monthlySystemUsed = this.sumSystemUsed(approvedYearItems, 'monthly_off');
    usage.push({
      leaveTypeCode: 'monthly_off',
      leaveTypeName: 'วันหยุดประจำเดือน',
      priorUsed: 0,
      systemUsed: monthlySystemUsed,
      totalUsed: monthlySystemUsed,
      remaining: null,
    });

    return usage;
  }

  private buildBalanceEdits(
    opening: Map<OpeningBalanceType, {
      leaveTypeName: string;
      priorUsed: number;
      yearPriorUsed: number;
      entitled: number;
      remaining: number | null;
    }>,
  ): EmployeeLeaveBalanceEditDto[] {
    return OPENING_BALANCE_TYPES.map((code) => {
      const row = opening.get(code);
      return {
        leaveTypeCode: code,
        leaveTypeName: row?.leaveTypeName ?? OPENING_TYPE_LABELS[code],
        priorUsed: row?.priorUsed ?? 0,
        entitled: row?.entitled ?? 0,
        entitledEditable: code === 'emergency',
      };
    });
  }

  private sumSystemUsed(
    items: EmployeeLeaveHistoryItemDto[],
    code: string,
  ): number {
    return items
      .filter((row) => {
        if (code === 'monthly_off') {
          return row.leaveTypeCode === 'monthly_off'
            || row.source === 'monthly_off'
            || row.source === 'off_day_change';
        }
        return row.leaveTypeCode === code && row.source !== 'monthly_off' && row.source !== 'off_day_change';
      })
      .reduce((sum, row) => sum + row.days, 0);
  }

  private async loadOpeningBalances(
    employeeId: string,
    companyId: string,
    year: number,
    now: Date,
    approvedYearItems: EmployeeLeaveHistoryItemDto[],
  ): Promise<Map<OpeningBalanceType, {
    leaveTypeName: string;
    /** Prior used for the editable period (current half-year for emergency). */
    priorUsed: number;
    /** Prior used across the calendar year. */
    yearPriorUsed: number;
    entitled: number;
    remaining: number | null;
  }>> {
    const types = await this.prisma.leaveType.findMany({
      where: { code: { in: [...OPENING_BALANCE_TYPES] }, deletedAt: null },
    });
    const rules = await this.leaveSettings.getRules(companyId);

    const result = new Map<OpeningBalanceType, {
      leaveTypeName: string;
      priorUsed: number;
      yearPriorUsed: number;
      entitled: number;
      remaining: number | null;
    }>();

    for (const type of types) {
      const code = type.code as OpeningBalanceType;
      if (!OPENING_BALANCE_TYPES.includes(code)) continue;

      if (code === 'emergency') {
        const periods = [
          {
            periodStart: new Date(Date.UTC(year, 0, 1)),
            periodEnd: new Date(Date.UTC(year, 5, 30)),
          },
          {
            periodStart: new Date(Date.UTC(year, 6, 1)),
            periodEnd: new Date(Date.UTC(year, 11, 31)),
          },
        ];
        let yearPriorUsed = 0;
        let currentPriorUsed = 0;
        let entitled = rules.emergencyLeaveDaysPerHalfYear;
        let remaining: number | null = entitled;
        const current = halfYearPeriodContaining(now);

        for (const period of periods) {
          const bal = await this.prisma.leaveBalance.findFirst({
            where: {
              employeeId,
              leaveTypeId: type.id,
              periodStart: period.periodStart,
              deletedAt: null,
            },
          });
          const startIso = period.periodStart.toISOString().slice(0, 10);
          const endIso = period.periodEnd.toISOString().slice(0, 10);
          const systemInPeriod = approvedYearItems
            .filter((row) => (
              row.leaveTypeCode === 'emergency'
              && row.startDate >= startIso
              && row.startDate <= endIso
            ))
            .reduce((sum, row) => sum + row.days, 0);
          const periodPrior = bal ? Math.max(0, Number(bal.used) - systemInPeriod) : 0;
          yearPriorUsed += periodPrior;
          if (period.periodStart.getTime() === current.periodStart.getTime()) {
            currentPriorUsed = periodPrior;
            entitled = bal ? Number(bal.entitled) : rules.emergencyLeaveDaysPerHalfYear;
            remaining = bal
              ? Number(bal.remaining)
              : entitled - systemInPeriod;
          }
        }

        result.set(code, {
          leaveTypeName: type.name || OPENING_TYPE_LABELS[code],
          priorUsed: currentPriorUsed,
          yearPriorUsed,
          entitled,
          remaining,
        });
        continue;
      }

      const yearStart = new Date(Date.UTC(year, 0, 1));
      const bal = await this.prisma.leaveBalance.findFirst({
        where: {
          employeeId,
          leaveTypeId: type.id,
          periodStart: yearStart,
          deletedAt: null,
        },
      });
      const priorUsed = bal ? Number(bal.used) : 0;
      result.set(code, {
        leaveTypeName: type.name || OPENING_TYPE_LABELS[code],
        priorUsed,
        yearPriorUsed: priorUsed,
        entitled: 0,
        remaining: null,
      });
    }

    for (const code of OPENING_BALANCE_TYPES) {
      if (!result.has(code)) {
        const entitled = code === 'emergency' ? rules.emergencyLeaveDaysPerHalfYear : 0;
        result.set(code, {
          leaveTypeName: OPENING_TYPE_LABELS[code],
          priorUsed: 0,
          yearPriorUsed: 0,
          entitled,
          remaining: code === 'emergency' ? entitled : null,
        });
      }
    }

    return result;
  }

  private async upsertLeaveBalance(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    periodEnd: Date;
    entitled: number;
    used: number;
    actorUserId: string;
  }): Promise<void> {
    const remaining = input.entitled - input.used;
    const existing = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        periodStart: input.periodStart,
        deletedAt: null,
      },
    });

    if (existing) {
      await this.prisma.leaveBalance.update({
        where: { id: existing.id },
        data: {
          periodEnd: input.periodEnd,
          entitled: new Prisma.Decimal(input.entitled),
          used: new Prisma.Decimal(input.used),
          remaining: new Prisma.Decimal(remaining),
          updatedBy: input.actorUserId,
        },
      });
      return;
    }

    await this.prisma.leaveBalance.create({
      data: {
        id: randomUUID(),
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        entitled: new Prisma.Decimal(input.entitled),
        used: new Prisma.Decimal(input.used),
        borrowed: new Prisma.Decimal(0),
        remaining: new Prisma.Decimal(remaining),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
  }

  private mapLeaveHistoryRow(
    row: {
      id: string;
      createdAt: Date;
      startDate: Date;
      endDate: Date;
      days: { toNumber?: () => number } | number;
      status: string;
      reason: string | null;
      workflowInstanceId: string | null;
      leaveType: { code: string; name: string };
    },
    approvers: Map<string, string>,
    noticeDays: number,
  ): EmployeeLeaveHistoryItemDto {
    const days = typeof row.days === 'number' ? row.days : Number(row.days);
    const startDate = row.startDate.toISOString().slice(0, 10);
    return {
      id: row.id,
      requestDate: row.createdAt.toISOString(),
      leaveTypeCode: row.leaveType.code,
      leaveTypeName: row.leaveType.name,
      startDate,
      endDate: row.endDate.toISOString().slice(0, 10),
      days,
      status: row.status === 'returned' ? 'cancelled' : row.status,
      approverName: row.workflowInstanceId
        ? approvers.get(row.workflowInstanceId) ?? null
        : null,
      reason: row.reason,
      workflowInstanceId: row.workflowInstanceId,
      shortNotice: isShortNotice(row.createdAt, startDate, noticeDays),
      source: 'leave_request',
    };
  }

  private indexOffDayChanges(
    rows: Array<{
      id: string;
      submittedAt: Date | null;
      createdAt: Date;
      values: Array<{ fieldKey: string; valueText: string | null; valueJson: unknown }>;
      approvalSteps: Array<{
        actorUser: {
          username: string;
          employee: { firstName: string; lastName: string } | null;
        } | null;
      }>;
    }>,
  ): Map<string, {
    changeId: string;
    previousDate: string;
    submittedAt: Date;
    reason: string | null;
    approverName: string | null;
  }> {
    const map = new Map<string, {
      changeId: string;
      previousDate: string;
      submittedAt: Date;
      reason: string | null;
      approverName: string | null;
    }>();
    for (const row of rows) {
      const values = Object.fromEntries(
        row.values.map((v) => [v.fieldKey, v.valueText ?? String(v.valueJson ?? '')]),
      );
      const previousDate = String(values.currentOffDay ?? '').slice(0, 10);
      const nextDate = String(values.requestedOffDay ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) continue;
      const actor = row.approvalSteps[0]?.actorUser;
      const approverName = actor?.employee
        ? `${actor.employee.firstName} ${actor.employee.lastName}`.trim()
        : actor?.username ?? null;
      map.set(nextDate, {
        changeId: row.id,
        previousDate,
        submittedAt: row.submittedAt ?? row.createdAt,
        reason: String(values.reason ?? '').trim() || null,
        approverName,
      });
    }
    return map;
  }

  /** One readable row per approved day-change (not cancel + new as two rows). */
  private mapOffDayChangeHistoryRows(
    row: {
      id: string;
      submittedAt: Date | null;
      createdAt: Date;
      values: Array<{ fieldKey: string; valueText: string | null; valueJson: unknown }>;
      approvalSteps: Array<{
        actorUser: {
          username: string;
          employee: { firstName: string; lastName: string } | null;
        } | null;
      }>;
    },
    noticeDays: number,
  ): EmployeeLeaveHistoryItemDto[] {
    const values = Object.fromEntries(
      row.values.map((v) => [v.fieldKey, v.valueText ?? String(v.valueJson ?? '')]),
    );
    const previousDate = String(values.currentOffDay ?? '').slice(0, 10);
    const nextDate = String(values.requestedOffDay ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(previousDate) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      return [];
    }
    const submittedAt = row.submittedAt ?? row.createdAt;
    const reasonText = String(values.reason ?? '').trim();
    const actor = row.approvalSteps[0]?.actorUser;
    const approverName = actor?.employee
      ? `${actor.employee.firstName} ${actor.employee.lastName}`.trim()
      : actor?.username ?? null;
    const shortNotice = isShortNotice(submittedAt, nextDate, noticeDays);

    return [{
      id: `${row.id}:change`,
      requestDate: submittedAt.toISOString(),
      leaveTypeCode: 'monthly_off_change',
      leaveTypeName: 'เปลี่ยนวันหยุด',
      startDate: nextDate,
      endDate: nextDate,
      days: 1,
      status: 'approved',
      approverName,
      // Keep only the employee's own reason; UI shows from→to via previousDate.
      reason: reasonText || null,
      workflowInstanceId: null,
      shortNotice,
      source: 'off_day_change',
      previousDate,
    }];
  }

  private mapMonthlyOffHistoryRows(
    row: {
      id: string;
      createdAt: Date;
      selectedDates: unknown;
      status: string;
      workflowInstanceId: string | null;
      approvedById?: string | null;
    },
    noticeDays: number,
    approvers: Map<string, string>,
  ): EmployeeLeaveHistoryItemDto[] {
    const dates = Array.isArray(row.selectedDates)
      ? (row.selectedDates as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    if (!dates.length) return [];

    const status = row.status === 'approved'
      ? 'approved'
      : row.status === 'pending'
        ? 'pending'
        : row.status === 'rejected'
          ? 'rejected'
          : 'cancelled';

    // Rejected empty shells from completed swaps are not shown.
    if (status === 'rejected') return [];

    return dates.map((date) => {
      const shortNotice = isShortNotice(row.createdAt, date, noticeDays);
      return {
        id: `${row.id}:${date}`,
        requestDate: row.createdAt.toISOString(),
        leaveTypeCode: 'monthly_off',
        leaveTypeName: 'วันหยุดประจำเดือน',
        startDate: date,
        endDate: date,
        days: 1,
        status,
        approverName: row.workflowInstanceId
          ? approvers.get(row.workflowInstanceId) ?? null
          : null,
        reason: null,
        workflowInstanceId: row.workflowInstanceId,
        shortNotice,
        source: 'monthly_off' as const,
        previousDate: null,
      };
    });
  }

  private async loadApprovers(
    requests: Array<{ workflowInstanceId: string | null }>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(
      requests.map((row) => row.workflowInstanceId).filter((id): id is string => Boolean(id)),
    )];
    if (!ids.length) return new Map();

    const actions = await this.prisma.workflowAction.findMany({
      where: {
        workflowInstanceId: { in: ids },
        action: { in: ['approve', 'reject', 'override'] },
      },
      orderBy: { actedAt: 'desc' },
      include: {
        actor: {
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const map = new Map<string, string>();
    for (const action of actions) {
      if (map.has(action.workflowInstanceId)) continue;
      const employee = action.actor.employee;
      const name = employee
        ? `${employee.firstName} ${employee.lastName}`.trim()
        : action.actor.username;
      map.set(action.workflowInstanceId, name);
    }
    return map;
  }
}
