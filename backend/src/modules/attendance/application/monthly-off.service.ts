// ============================================================================
// modules/attendance/application/monthly-off.service.ts
// Monthly off is separate from leave — normal monthly days off.
// ============================================================================

import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { payrollPeriodEndOf, payrollPeriodStartOf } from '../../../shared/time/payroll-period.util';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import type { ApprovalContext } from '../../workflow/domain/types/approval.types';
import {
  countOffDayUnits,
  previewOtBonus,
  type LeaveDayRow,
  type MonthlyOffDateRow,
} from '../../payroll/domain/services/off-day-ot-usage.service';
import { shortNoticeDates } from '../../leave/domain/services/leave-notice.util';
import { computeMonthlyOffEntitlement } from '../../leave/domain/services/monthly-off-entitlement.service';
import type { MonthlyOffSubmitPreview } from '../domain/monthly-off-submit-message.util';
import { DailyAttendanceLedgerService } from './daily-attendance-ledger.service';
import { cancelLinkedApprovals } from '../../../shared/kernel/cancel-linked-approvals';
import { EmployeeDayConflictService } from '../../leave/application/employee-day-conflict.service';

export interface MonthlyOffSubmission {
  employeeId: string;
  companyId: string;
  /** Payroll period anchor (25th) as YYYY-MM-DD, or legacy YYYY-MM. */
  month: string;
  selectedDates: string[];
}

function resolveMonthlyOffPeriodDate(month: string, time: BangkokTimeProvider): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) {
    return time.parseWorkDate(month);
  }
  return time.parseWorkDate(payrollPeriodStartOf(`${month}-15`));
}

@Injectable()
export class MonthlyOffService implements OnModuleInit {
  private readonly logger = new Logger(MonthlyOffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly workflow: WorkflowService,
    private readonly time: BangkokTimeProvider,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly ledger: DailyAttendanceLedgerService,
    private readonly dayConflicts: EmployeeDayConflictService,
  ) {}

  onModuleInit(): void {
    void this.reconcileResolvedWorkflows()
      .then(() => this.markStaleMonthlyOffOutboxProcessed())
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed reconciling monthly-off workflows: ${message}`);
      });
  }

  /** Avoid endless outbox retries after reconcile repaired domain rows. */
  private async markStaleMonthlyOffOutboxProcessed(): Promise<void> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        processedAt: null,
        eventType: { in: ['workflow.approved', 'workflow.rejected', 'workflow.cancelled'] },
        payload: { path: ['entityType'], equals: 'monthly_off' },
      },
      data: { processedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} stale monthly_off workflow outbox event(s) as processed`);
    }
  }

  async submit(actor: ActorContext, input: MonthlyOffSubmission): Promise<{
    id: string;
    excessDayCount: number;
    preview: MonthlyOffSubmitPreview;
  }> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(
      actor,
      input.employeeId,
      input.companyId,
    );
    const monthDate = resolveMonthlyOffPeriodDate(input.month, this.time);
    const periodStartIso = payrollPeriodStartOf(monthDate.toISOString().slice(0, 10));
    const periodEndIso = payrollPeriodEndOf(periodStartIso);

    const uniqueDates = [...new Set(input.selectedDates)].sort();
    if (!uniqueDates.length) {
      throw new BadRequestException('กรุณาระบุวันหยุดอย่างน้อย 1 วัน');
    }
    for (const date of uniqueDates) {
      if (date < periodStartIso || date > periodEndIso) {
        throw new BadRequestException(`วันที่ ${date} ไม่อยู่ในรอบเงินเดือน ${periodStartIso} ถึง ${periodEndIso}`);
      }
    }

    await this.dayConflicts.assertNoConflict({
      employeeId: input.employeeId,
      companyId: input.companyId,
      dates: uniqueDates,
    });

    const entitlement = await this.resolveOffEntitlement(
      input.employeeId,
      input.companyId,
      periodStartIso,
      periodEndIso,
    );
    const allowance = entitlement.entitledOffDays;
    const alreadyUsed = await this.countOffDaysInPeriod(
      input.employeeId,
      input.companyId,
      periodStartIso,
      periodEndIso,
    );
    const totalAfter = alreadyUsed + uniqueDates.length;
    const excessDayCount = Math.max(0, totalAfter - allowance);

    const id = randomUUID();
    await this.prisma.monthlyOffRequest.create({
      data: {
        id,
        employeeId: input.employeeId,
        companyId: input.companyId,
        month: monthDate,
        selectedDates: uniqueDates,
        status: 'pending',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    try {
      const approvalContext = await this.buildApprovalContext(input.employeeId, input.companyId);
      const { instanceId } = await this.workflow.start(actor, {
        entityType: 'monthly_off',
        entityId: id,
        companyId: input.companyId,
        workflowType: 'monthly_off_request',
        approvalContext,
      });
      await this.prisma.monthlyOffRequest.update({
        where: { id },
        data: { workflowInstanceId: instanceId },
      });
    } catch (err) {
      await this.prisma.monthlyOffRequest.delete({ where: { id } }).catch(() => undefined);
      throw err;
    }

    const preview = await this.buildSubmitPreview({
      employeeId: input.employeeId,
      companyId: input.companyId,
      periodStartIso,
      periodEndIso,
      newDates: uniqueDates,
      excessDayCount,
      submittedAt: new Date(),
    });

    return { id, excessDayCount, preview };
  }

  async buildSubmitPreview(input: {
    employeeId: string;
    companyId: string;
    periodStartIso: string;
    periodEndIso: string;
    newDates: string[];
    excessDayCount: number;
    submittedAt: Date;
  }): Promise<MonthlyOffSubmitPreview> {
    const rules = await this.leaveSettings.getRules(input.companyId);
    const entitlement = await this.resolveOffEntitlement(
      input.employeeId,
      input.companyId,
      input.periodStartIso,
      input.periodEndIso,
    );
    const [monthlyOffRows, leaveRows, requestLeaves] = await Promise.all([
      this.prisma.monthlyOffRequest.findMany({
        where: {
          employeeId: input.employeeId,
          companyId: input.companyId,
          status: { in: ['approved', 'pending'] },
          deletedAt: null,
        },
        select: { selectedDates: true, status: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: input.employeeId,
          companyId: input.companyId,
          status: { in: ['approved', 'pending'] },
          deletedAt: null,
          startDate: { lte: new Date(`${input.periodEndIso}T00:00:00.000Z`) },
          endDate: { gte: new Date(`${input.periodStartIso}T00:00:00.000Z`) },
        },
        include: { leaveType: { select: { code: true } } },
      }),
      this.prisma.requestInstance.findMany({
        where: {
          requesterEmployeeId: input.employeeId,
          companyId: input.companyId,
          deletedAt: null,
          status: { in: ['approved', 'in_review'] },
          requestType: { key: 'leave_request' },
        },
        include: { values: true },
      }),
    ]);

    const mappedLeaves: LeaveDayRow[] = leaveRows.map((row) => ({
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      leaveTypeCode: row.leaveType.code,
    }));

    for (const req of requestLeaves) {
      const values = Object.fromEntries(
        req.values.map((v) => [v.fieldKey, v.valueText ?? v.valueJson]),
      );
      const leaveType = String(values.leaveType ?? 'personal');
      const startRaw = String(values.startDate ?? '');
      const endRaw = String(values.endDate ?? startRaw);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) continue;
      const endIso = /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : startRaw;
      mappedLeaves.push({
        startDate: new Date(`${startRaw}T00:00:00.000Z`),
        endDate: new Date(`${endIso}T00:00:00.000Z`),
        status: req.status,
        leaveTypeCode: leaveType,
      });
    }

    const usedUnits = countOffDayUnits({
      periodStartIso: input.periodStartIso,
      periodEndIso: input.periodEndIso,
      monthlyOffRows: monthlyOffRows as MonthlyOffDateRow[],
      leaveRows: mappedLeaves,
      extraMonthlyOffDates: input.newDates,
      includePending: true,
    });

    return {
      periodLabel: `${input.periodStartIso} – ${input.periodEndIso}`,
      submittedDayCount: input.newDates.length,
      monthlyOffAllowance: entitlement.entitledOffDays,
      fullMonthlyOffAllowance: entitlement.fullMonthlyOffDays,
      offDayProrated: entitlement.prorated,
      eligibleEmploymentDays: entitlement.eligibleEmploymentDays,
      periodDays: entitlement.periodDays,
      excessMonthlyOffDays: input.excessDayCount,
      otPreview: previewOtBonus(rules, usedUnits, entitlement.entitledOffDays),
      shortNoticeDates: shortNoticeDates(
        input.submittedAt,
        input.newDates,
        rules.defaultLeaveNoticeDays,
      ),
      noticeDays: rules.defaultLeaveNoticeDays,
    };
  }

  /** Count approved + pending off-days in a payroll period (excludes rejected/cancelled). */
  private async resolveOffEntitlement(
    employeeId: string,
    companyId: string,
    periodStartIso: string,
    periodEndIso: string,
  ) {
    const [rules, employee] = await Promise.all([
      this.leaveSettings.getRules(companyId),
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: { hireDate: true, terminationDate: true },
      }),
    ]);
    if (!employee) {
      throw new BadRequestException('ไม่พบข้อมูลพนักงาน');
    }
    return computeMonthlyOffEntitlement({
      monthlyOffDays: rules.monthlyOffDays,
      periodStartIso,
      periodEndIso,
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
    });
  }

  /** Count approved + pending off-days in a payroll period (excludes rejected/cancelled). */
  private async countOffDaysInPeriod(
    employeeId: string,
    companyId: string,
    periodStartIso: string,
    periodEndIso: string,
  ): Promise<number> {
    const rows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: { in: ['approved', 'pending'] },
        deletedAt: null,
      },
      select: { selectedDates: true },
    });
    let count = 0;
    for (const row of rows) {
      const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
      for (const date of dates) {
        if (date >= periodStartIso && date <= periodEndIso) count += 1;
      }
    }
    return count;
  }

  private async buildApprovalContext(employeeId: string, companyId: string): Promise<ApprovalContext> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { roleLevel: true },
    });
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null },
      include: {
        businessRoleAssignments: { where: { isActive: true, deletedAt: null }, take: 1 },
      },
    });
    return {
      employeeId,
      companyId,
      requesterRoleLevel: assignment?.roleLevel ?? null,
      requesterBusinessRole: user?.businessRoleAssignments[0]?.role ?? null,
    };
  }

  async listApprovedForTeam(
    companyId: string,
    employeeIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ employeeId: string; date: string; status: string }>> {
    const rows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        status: { in: ['approved', 'pending'] },
        deletedAt: null,
      },
      select: {
        employeeId: true,
        selectedDates: true,
        status: true,
      },
    });
    const events: Array<{ employeeId: string; date: string; status: string }> = [];
    const startIso = startDate.toISOString().slice(0, 10);
    const endIso = endDate.toISOString().slice(0, 10);
    for (const row of rows) {
      const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
      for (const date of dates) {
        if (date >= startIso && date <= endIso) {
          events.push({ employeeId: row.employeeId, date, status: row.status });
        }
      }
    }
    return events;
  }

  async onWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
    actorUserId?: string,
  ): Promise<void> {
    const row = await this.prisma.monthlyOffRequest.findFirst({
      where: { id: entityId, deletedAt: null },
    });
    if (!row) {
      this.logger.warn(`onWorkflowResolved: MonthlyOffRequest ${entityId} not found`);
      return;
    }
    if (row.status === 'approved' || row.status === 'rejected') {
      return;
    }

    const approverId = status === 'approved'
      ? await this.resolveApproverUserId(row.workflowInstanceId, actorUserId)
      : null;
    const next = status === 'approved' ? 'approved' : 'rejected';
    await this.prisma.monthlyOffRequest.update({
      where: { id: row.id },
      data: {
        status: next,
        approvedById: approverId,
        approvedAt: status === 'approved' ? new Date() : null,
        // updatedBy has no FK — system sentinel is fine; approvedById must be a real user or null.
        updatedBy: approverId ?? actorUserId ?? null,
      },
    });

    if (status === 'approved') {
      await this.syncApprovedOffDays(row.employeeId, row.companyId, row.selectedDates);
    }
  }

  /**
   * Repair monthly-off rows stuck in pending after workflow already resolved
   * (e.g. outbox handler failed on invalid approvedById FK).
   */
  async reconcileResolvedWorkflows(): Promise<number> {
    const rows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        status: 'pending',
        deletedAt: null,
        workflowInstanceId: { not: null },
      },
      select: { id: true, workflowInstanceId: true },
      take: 500,
    });
    if (!rows.length) return 0;

    const workflowIds = rows
      .map((row) => row.workflowInstanceId)
      .filter((id): id is string => Boolean(id));
    const workflows = await this.prisma.workflowInstance.findMany({
      where: { id: { in: workflowIds }, deletedAt: null },
      select: { id: true, status: true },
    });
    const statusById = new Map(workflows.map((row) => [row.id, row.status]));

    let fixed = 0;
    for (const row of rows) {
      const wfStatus = row.workflowInstanceId
        ? statusById.get(row.workflowInstanceId)
        : undefined;
      if (!wfStatus || wfStatus === 'pending') continue;
      const resolved: 'approved' | 'rejected' | 'cancelled' =
        wfStatus === 'approved'
          ? 'approved'
          : wfStatus === 'cancelled'
            ? 'cancelled'
            : 'rejected';
      try {
        await this.onWorkflowResolved(row.id, resolved);
        fixed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`reconcileResolvedWorkflows failed for ${row.id}: ${message}`);
      }
    }
    // Orphan pending rows with no workflow can never reach the approval inbox.
    const orphans = await this.prisma.monthlyOffRequest.findMany({
      where: {
        status: 'pending',
        deletedAt: null,
        workflowInstanceId: null,
      },
      select: { id: true, employeeId: true, companyId: true, selectedDates: true },
      take: 200,
    });
    for (const orphan of orphans) {
      const dates = Array.isArray(orphan.selectedDates)
        ? (orphan.selectedDates as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        : [];
      const conflicts = dates.length
        ? await this.dayConflicts.findConflicts({
          employeeId: orphan.employeeId,
          companyId: orphan.companyId,
          dates,
          excludeMonthlyOffRequestId: orphan.id,
        })
        : [];
      // Drop only clear duplicates (same day already booked elsewhere).
      if (!dates.length || conflicts.length > 0) {
        await this.prisma.monthlyOffRequest.update({
          where: { id: orphan.id },
          data: {
            status: 'rejected',
            deletedAt: new Date(),
            updatedBy: null,
          },
        });
        fixed += 1;
      }
    }

    if (fixed > 0) {
      this.logger.log(`Reconciled ${fixed} monthly-off request(s) from resolved workflows`);
    }
    return fixed;
  }

  private async resolveApproverUserId(
    workflowInstanceId: string | null,
    actorUserId?: string,
  ): Promise<string | null> {
    if (actorUserId && actorUserId !== SYSTEM_ACTOR.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: actorUserId, deletedAt: null },
        select: { id: true },
      });
      if (user) return user.id;
    }
    if (!workflowInstanceId) return null;

    const action = await this.prisma.workflowAction.findFirst({
      where: {
        workflowInstanceId,
        action: { in: ['approve', 'override'] },
      },
      orderBy: { actedAt: 'desc' },
      select: { actorUserId: true },
    });
    return action?.actorUserId ?? null;
  }

  /** Link approved monthly off dates across attendance, absence, and reminders. */
  async syncApprovedOffDays(
    employeeId: string,
    companyId: string,
    selectedDates: unknown,
  ): Promise<void> {
    if (!Array.isArray(selectedDates)) return;

    for (const raw of selectedDates) {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue;
      const workDate = new Date(`${raw}T00:00:00.000Z`);

      await this.ledger.recordOffDay(employeeId, companyId, workDate, 'monthly_off');

      await this.prisma.absenceRecord.updateMany({
        where: {
          employeeId,
          companyId,
          workDate,
          deletedAt: null,
          status: { in: ['flagged', 'approved'] },
        },
        data: {
          status: 'waived',
          waivedAt: new Date(),
          waivedBy: SYSTEM_ACTOR.userId,
          waiveReason: 'วันหยุดประจำเดือนอนุมัติแล้ว',
        },
      });

      await this.prisma.attendanceReminder.deleteMany({
        where: { employeeId, workDate },
      });
    }

    this.logger.log(
      `Synced approved monthly off employee=${employeeId} dates=${(selectedDates as string[]).join(',')}`,
    );
  }

  /**
   * Apply an approved off-day change:
   * - cancel the old date on the original request (attendance reverted)
   * - create a NEW approved monthly-off for the new date (fresh submittedAt for payroll notice)
   * Mutating in place would hide the cancel trail and let people dodge short-notice rules.
   */
  async swapMonthlyOffDay(
    employeeId: string,
    companyId: string,
    currentOffDay: string,
    requestedOffDay: string,
    actorUserId: string,
  ): Promise<{
    monthlyOffRequestId: string;
    cancelledFromRequestId: string;
    previousDate: string;
    nextDate: string;
  }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(currentOffDay) || !/^\d{4}-\d{2}-\d{2}$/.test(requestedOffDay)) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
    }
    if (currentOffDay === requestedOffDay) {
      throw new BadRequestException('วันหยุดใหม่ต้องไม่ซ้ำกับวันเดิม');
    }

    const rows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: { in: ['approved', 'pending'] },
        deletedAt: null,
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    for (const row of rows) {
      const dates = Array.isArray(row.selectedDates) ? [...row.selectedDates as string[]] : [];
      const index = dates.indexOf(currentOffDay);
      if (index === -1) continue;
      if (dates.includes(requestedOffDay)) {
        throw new BadRequestException('วันหยุดใหม่ซ้ำกับวันหยุดที่มีอยู่แล้วในรอบเดียวกัน');
      }

      await this.dayConflicts.assertNoConflict({
        employeeId,
        companyId,
        dates: [requestedOffDay],
        excludeMonthlyOffRequestId: row.id,
      });

      const remaining = dates.filter((d) => d !== currentOffDay);
      if (!remaining.length) {
        await this.prisma.monthlyOffRequest.update({
          where: { id: row.id },
          data: {
            selectedDates: [],
            status: 'rejected',
            updatedBy: actorUserId,
          },
        });
      } else {
        await this.prisma.monthlyOffRequest.update({
          where: { id: row.id },
          data: {
            selectedDates: remaining,
            updatedBy: actorUserId,
          },
        });
      }

      await this.revertOffDaySideEffects(employeeId, companyId, currentOffDay);

      const newId = randomUUID();
      const now = new Date();
      await this.prisma.monthlyOffRequest.create({
        data: {
          id: newId,
          employeeId,
          companyId,
          month: row.month,
          selectedDates: [requestedOffDay],
          status: 'approved',
          approvedById: actorUserId !== SYSTEM_ACTOR.userId ? actorUserId : null,
          approvedAt: now,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await this.syncApprovedOffDays(employeeId, companyId, [requestedOffDay]);

      this.logger.log(
        `Changed monthly off employee=${employeeId} ${currentOffDay} -> ${requestedOffDay} `
        + `from=${row.id} to=${newId}`,
      );
      return {
        monthlyOffRequestId: newId,
        cancelledFromRequestId: row.id,
        previousDate: currentOffDay,
        nextDate: requestedOffDay,
      };
    }

    throw new BadRequestException(`ไม่พบวันหยุด ${currentOffDay} ในรายการวันหยุดประจำเดือน`);
  }

  /**
   * Admin delete one monthly-off date from history.
   * Reverts attendance/absence side effects, cancels linked requests when empty.
   */
  async adminDeleteOffDate(
    actor: ActorContext,
    monthlyOffRequestId: string,
    offDate: string,
  ): Promise<{ employeeId: string; companyId: string; affectedDates: string[] }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(offDate)) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
    }

    const row = await this.prisma.monthlyOffRequest.findFirst({
      where: { id: monthlyOffRequestId, deletedAt: null },
    });
    if (!row) throw new BadRequestException('ไม่พบวันหยุดประจำเดือน');

    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, row.employeeId, row.companyId);

    const dates = Array.isArray(row.selectedDates)
      ? (row.selectedDates as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    if (!dates.includes(offDate)) {
      throw new BadRequestException(`ไม่พบวันหยุด ${offDate} ในรายการ`);
    }

    const nextDates = dates.filter((d) => d !== offDate);

    if (row.status === 'approved') {
      await this.revertOffDaySideEffects(row.employeeId, row.companyId, offDate);
    }

    if (!nextDates.length) {
      await this.prisma.monthlyOffRequest.update({
        where: { id: row.id },
        data: {
          selectedDates: [],
          status: 'rejected',
          deletedAt: new Date(),
          deletedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });

      await cancelLinkedApprovals(this.prisma, {
        entityType: 'MonthlyOffRequest',
        workflowEntityType: 'monthly_off',
        entityId: row.id,
        actorUserId: actor.userId,
        reason: 'ลบจากประวัติการลา — ยกเลิกวันหยุดประจำเดือนและผลที่เกี่ยวข้องทั้งระบบ',
      });
    } else {
      await this.prisma.monthlyOffRequest.update({
        where: { id: row.id },
        data: {
          selectedDates: nextDates,
          updatedBy: actor.userId,
        },
      });
    }

    this.logger.log(
      `Admin deleted monthly off date employee=${row.employeeId} date=${offDate} request=${row.id}`,
    );

    return {
      employeeId: row.employeeId,
      companyId: row.companyId,
      affectedDates: [offDate],
    };
  }

  /**
   * Admin change one monthly-off date (keeps approval status).
   */
  async adminUpdateOffDate(
    actor: ActorContext,
    monthlyOffRequestId: string,
    offDate: string,
    newDate: string,
    correctionReason: string,
  ): Promise<{ employeeId: string; companyId: string; affectedDates: string[] }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(offDate) || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      throw new BadRequestException('รูปแบบวันที่ไม่ถูกต้อง');
    }
    if (offDate === newDate) {
      throw new BadRequestException('วันหยุดใหม่ต้องไม่ซ้ำกับวันเดิม');
    }
    if (!correctionReason.trim()) {
      throw new BadRequestException('กรุณาระบุเหตุผลในการแก้ไข');
    }

    const row = await this.prisma.monthlyOffRequest.findFirst({
      where: { id: monthlyOffRequestId, deletedAt: null },
    });
    if (!row) throw new BadRequestException('ไม่พบวันหยุดประจำเดือน');

    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, row.employeeId, row.companyId);

    const dates = Array.isArray(row.selectedDates)
      ? [...(row.selectedDates as string[])]
      : [];
    const index = dates.indexOf(offDate);
    if (index === -1) {
      throw new BadRequestException(`ไม่พบวันหยุด ${offDate} ในรายการ`);
    }
    if (dates.includes(newDate)) {
      throw new BadRequestException('วันหยุดใหม่ซ้ำกับวันหยุดที่มีอยู่แล้วในรอบเดียวกัน');
    }

    await this.dayConflicts.assertNoConflict({
      employeeId: row.employeeId,
      companyId: row.companyId,
      dates: [newDate],
      excludeMonthlyOffRequestId: row.id,
    });

    dates[index] = newDate;
    dates.sort();

    await this.prisma.monthlyOffRequest.update({
      where: { id: row.id },
      data: {
        selectedDates: dates,
        updatedBy: actor.userId,
      },
    });

    if (row.status === 'approved') {
      await this.revertOffDaySideEffects(row.employeeId, row.companyId, offDate);
      await this.syncApprovedOffDays(row.employeeId, row.companyId, [newDate]);
    }

    this.logger.log(
      `Admin updated monthly off employee=${row.employeeId} ${offDate} -> ${newDate} request=${row.id} reason=${correctionReason}`,
    );

    return {
      employeeId: row.employeeId,
      companyId: row.companyId,
      affectedDates: [offDate, newDate],
    };
  }

  /** Revert attendance/absence effects for all dates on an approved monthly-off request. */
  async revertAllOffDaySideEffects(
    employeeId: string,
    companyId: string,
    selectedDates: unknown,
  ): Promise<void> {
    if (!Array.isArray(selectedDates)) return;
    for (const raw of selectedDates) {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue;
      await this.revertOffDaySideEffects(employeeId, companyId, raw);
    }
  }

  async revertOffDaySideEffects(
    employeeId: string,
    companyId: string,
    dateIso: string,
  ): Promise<void> {
    const workDate = new Date(`${dateIso}T00:00:00.000Z`);

    await this.prisma.attendanceReminder.deleteMany({
      where: { employeeId, workDate },
    });

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, workDate, deletedAt: null },
    });
    if (record && !record.checkInAt) {
      await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          deletedAt: new Date(),
          deletedBy: SYSTEM_ACTOR.userId,
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    }

    await this.prisma.absenceRecord.updateMany({
      where: {
        employeeId,
        companyId,
        workDate,
        deletedAt: null,
        status: 'waived',
        waiveReason: 'วันหยุดประจำเดือนอนุมัติแล้ว',
      },
      data: {
        status: 'flagged',
        waivedAt: null,
        waivedBy: null,
        waiveReason: null,
      },
    });
  }
}
