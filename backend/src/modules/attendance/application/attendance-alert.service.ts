// ============================================================================
// modules/attendance/application/attendance-alert.service.ts
// ATT-010 — Attendance alert detection and dispatch.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ReminderType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { DateProvider } from '../../../shared/time/date.provider';
import { AttendanceAlertNotifier, AttendanceAlertKind } from './attendance-alert.notifier';
import type { AttendanceRulesSetting } from '../../settings/domain/attendance-settings.types';
import { EmployeeDayContextService } from './employee-day-context.service';
import { ShiftAssignmentService } from './shift-assignment.service';

export interface AttendanceAlertsToday {
  missingCheckIns: number;
  missingBreakReturns: number;
  missingCheckOuts: number;
  items: Array<{
    employeeId: string;
    employeeName: string;
    teamName: string | null;
    alertType: string;
    escalated: boolean;
  }>;
}

@Injectable()
export class AttendanceAlertService {
  private readonly logger = new Logger(AttendanceAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AttendanceSettingsService,
    private readonly notifier: AttendanceAlertNotifier,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    private readonly dayContext: EmployeeDayContextService,
    private readonly shifts: ShiftAssignmentService,
  ) {}

  async runForCompany(companyId: string, asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const rules = await this.settings.getRules(companyId);
    const workDate = this.bangkokWorkDate(ref);
    const nowMinutes = this.bangkokMinutesSinceMidnight(ref);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { name: true },
    });

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: { some: { companyId, effectiveTo: null, deletedAt: null } },
      },
      select: { id: true, firstName: true, lastName: true },
    });

    for (const employee of employees) {
      try {
        await this.processEmployee(
          companyId,
          company?.name ?? '—',
          employee,
          workDate,
          nowMinutes,
          rules,
          ref,
        );
      } catch (err) {
        this.logger.warn(`Alert check failed for employee ${employee.id}`, err);
      }
    }
  }

  async getAlertsToday(companyId: string, asOf?: Date): Promise<AttendanceAlertsToday> {
    const ref = asOf ?? this.dates.now();
    const workDate = this.bangkokWorkDate(ref);
    const reminders = await this.prisma.attendanceReminder.findMany({
      where: {
        workDate,
        employee: {
          assignments: { some: { companyId, effectiveTo: null, deletedAt: null } },
        },
        reminderType: {
          in: [
            ReminderType.checkin_pre_reminder,
            ReminderType.missing_checkin,
            ReminderType.missing_checkin_escalated,
            ReminderType.missing_checkout,
            ReminderType.missing_checkout_escalated,
            ReminderType.missing_break_return,
            ReminderType.break_return_pre_reminder,
            ReminderType.missing_break_return_escalated,
          ],
        },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const items = await Promise.all(reminders.map(async (r) => {
      const team = await this.teamName(r.employeeId);
      return {
        employeeId: r.employeeId,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        teamName: team,
        alertType: r.reminderType,
        escalated: r.reminderType.includes('escalated'),
      };
    }));

    return {
      missingCheckIns: items.filter((i) => i.alertType.startsWith('missing_checkin') || i.alertType === 'checkin_pre_reminder').length,
      missingBreakReturns: items.filter((i) => i.alertType.startsWith('missing_break_return')).length,
      missingCheckOuts: items.filter((i) => i.alertType.startsWith('missing_checkout')).length,
      items,
    };
  }

  async logResolved(employeeId: string, alertType: string, workDate: Date): Promise<void> {
    await this.clearReminders(employeeId, workDate, alertType);
    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AttendanceRecord',
      entityId: employeeId,
      action: 'attendance_alert_resolved',
      after: { alertType, workDate: workDate.toISOString().slice(0, 10) },
    });
  }

  /** ATT-LOC — alert owner/HR that a check-in/out landed far from the employee's WFH home baseline. */
  async sendLocationAnomalyAlert(input: {
    employeeId: string;
    companyId: string;
    event: 'check_in' | 'check_out';
    distanceMeters: number;
    thresholdMeters: number;
    latitude: number;
    longitude: number;
  }): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    const company = await this.prisma.company.findFirst({
      where: { id: input.companyId, deletedAt: null },
      select: { name: true },
    });
    const teamName = await this.teamName(input.employeeId);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : '—';

    await this.notifier.notifyLocationAnomaly({
      employeeId: input.employeeId,
      companyId: input.companyId,
      employeeName,
      teamName,
      companyName: company?.name ?? '—',
      event: input.event,
      distanceMeters: input.distanceMeters,
      thresholdMeters: input.thresholdMeters,
      latitude: input.latitude,
      longitude: input.longitude,
    });

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AttendanceRecord',
      entityId: input.employeeId,
      action: 'attendance_location_anomaly',
      after: {
        event: input.event,
        distanceMeters: Math.round(input.distanceMeters),
        thresholdMeters: input.thresholdMeters,
      },
    });
  }

  /** ATT-010b — resolve alerts when employee completes the action. */
  async resolveAlertsForEmployee(
    employeeId: string,
    workDate: Date,
    action: 'check_in' | 'check_out' | 'break_end',
  ): Promise<void> {
    const typesByAction: Record<string, ReminderType[]> = {
      check_in: [ReminderType.checkin_pre_reminder, ReminderType.missing_checkin, ReminderType.missing_checkin_escalated],
      check_out: [ReminderType.missing_checkout, ReminderType.missing_checkout_escalated],
      break_end: [ReminderType.break_return_pre_reminder, ReminderType.missing_break_return, ReminderType.missing_break_return_escalated],
    };
    const types = typesByAction[action] ?? [];
    if (!types.length) return;

    const deleted = await this.prisma.attendanceReminder.deleteMany({
      where: { employeeId, workDate, reminderType: { in: types } },
    });
    if (deleted.count > 0) {
      await this.logResolved(employeeId, action, workDate);
    }
  }

  private async clearReminders(
    employeeId: string,
    workDate: Date,
    alertType: string,
  ): Promise<void> {
    const map: Record<string, ReminderType[]> = {
      check_in: [ReminderType.checkin_pre_reminder, ReminderType.missing_checkin, ReminderType.missing_checkin_escalated],
      check_out: [ReminderType.missing_checkout, ReminderType.missing_checkout_escalated],
      break_end: [ReminderType.break_return_pre_reminder, ReminderType.missing_break_return, ReminderType.missing_break_return_escalated],
    };
    const types = map[alertType];
    if (!types) return;
    await this.prisma.attendanceReminder.deleteMany({
      where: { employeeId, workDate, reminderType: { in: types } },
    });
  }

  private async processEmployee(
    companyId: string,
    companyName: string,
    employee: { id: string; firstName: string; lastName: string },
    workDate: Date,
    nowMinutes: number,
    rules: AttendanceRulesSetting,
    asOf: Date,
  ): Promise<void> {
    const dayCtx = await this.dayContext.getContext(employee.id, companyId, workDate);
    if (dayCtx.skipAttendanceAlerts) {
      return;
    }

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId: employee.id, workDate, deletedAt: null },
      include: {
        breaks: { where: { breakEndAt: null }, orderBy: { breakStartAt: 'desc' }, take: 1 },
      },
    });

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    const teamName = await this.teamName(employee.id);
    const extra = { employeeName, teamName, companyName };

    const shiftWindow = await this.shifts.resolveShiftWindow(
      employee.id,
      companyId,
      workDate,
    );
    const shiftStart = shiftWindow.shift.startMinutes;
    const shiftEnd = shiftWindow.shift.endMinutes;

    // Missing check-in alerts (per-employee shift)
    if (!record?.checkInAt) {
      const preAt = shiftStart - rules.checkInPreReminderMinutes;
      const reminderAt = shiftStart + rules.checkInReminderMinutes;
      const escalateAt = shiftStart + rules.checkInEscalationMinutes;

      if (
        nowMinutes < shiftStart
        && this.shouldFireAlert(nowMinutes, preAt)
      ) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.checkin_pre_reminder,
          ReminderType.checkin_pre_reminder,
          () => this.notifier.notifyEmployee(
            employee.id,
            ReminderType.checkin_pre_reminder,
            { shiftName: shiftWindow.shift.name, shiftStartMinutes: shiftStart },
          ),
          'attendance_alert_sent',
        );
      }
      if (this.shouldFireAlert(nowMinutes, reminderAt)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_checkin,
          ReminderType.missing_checkin,
          () => this.notifier.notifyEmployee(
            employee.id,
            ReminderType.missing_checkin,
            { lateMinutes: rules.checkInReminderMinutes },
          ),
          'attendance_alert_sent',
        );
      }
      if (this.shouldFireAlert(nowMinutes, escalateAt)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_checkin_escalated,
          ReminderType.missing_checkin_escalated,
          async () => {
            await this.notifier.notifyBigLeader(
              companyId,
              employee.id,
              ReminderType.missing_checkin_escalated,
              { employeeName, teamName, companyName },
            );
          },
          'attendance_alert_escalated',
        );
      }
    }

    // Missing break return
    const openBreak = record?.breaks[0];
    if (openBreak?.breakStartAt) {
      const breakStartMinutes = this.bangkokMinutesSinceMidnight(openBreak.breakStartAt);
      const minutesOnBreak = Math.max(0, nowMinutes - breakStartMinutes);
      const preAt = breakStartMinutes + rules.breakReminderMinutes - rules.breakPreReminderMinutes;
      const fullAt = breakStartMinutes + rules.breakReminderMinutes;

      if (
        rules.breakPreReminderMinutes > 0
        && rules.breakPreReminderMinutes < rules.breakReminderMinutes
        && this.shouldFireAlert(nowMinutes, preAt)
      ) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.break_return_pre_reminder,
          'break_return_pre_reminder',
          () => this.notifier.notifyEmployee(employee.id, 'break_return_pre_reminder', {
            minutesRemaining: rules.breakPreReminderMinutes,
          }),
          'attendance_alert_sent',
        );
      }
      if (this.shouldFireAlert(nowMinutes, fullAt)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_break_return,
          ReminderType.missing_break_return,
          () => this.notifier.notifyEmployee(employee.id, 'missing_break_return', {
            breakMinutes: rules.breakReminderMinutes,
          }),
          'attendance_alert_sent',
        );
      }
      if (minutesOnBreak >= rules.breakEscalationMinutes
        && this.shouldFireAlert(nowMinutes, breakStartMinutes + rules.breakEscalationMinutes)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_break_return_escalated,
          ReminderType.missing_break_return_escalated,
          async () => {
            await this.notifier.notifyBigLeader(
              companyId,
              employee.id,
              ReminderType.missing_break_return_escalated,
              { employeeName, teamName, companyName },
            );
          },
          'attendance_alert_escalated',
        );
      }
    }

    // Missing check-out (per-employee shift end)
    if (record?.checkInAt && !record.checkOutAt) {
      const reminderAt = shiftEnd + rules.checkOutReminderMinutes;
      const escalateAt = shiftEnd + rules.checkOutEscalationMinutes;

      if (this.shouldFireAlert(nowMinutes, reminderAt)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_checkout,
          ReminderType.missing_checkout,
          () => this.notifier.notifyEmployee(employee.id, 'missing_checkout'),
          'attendance_alert_sent',
        );
      }
      if (this.shouldFireAlert(nowMinutes, escalateAt)) {
        await this.maybeSend(
          employee.id,
          workDate,
          ReminderType.missing_checkout_escalated,
          ReminderType.missing_checkout_escalated,
          async () => {
            await this.notifier.notifyBigLeader(
              companyId,
              employee.id,
              ReminderType.missing_checkout_escalated,
              { employeeName, teamName, companyName },
            );
          },
          'attendance_alert_escalated',
        );
      }
    }
  }

  /** Fire only in the minute window after trigger — skip stale catch-up if scheduler was down. */
  private shouldFireAlert(nowMinutes: number, triggerAt: number, graceMinutes = 5): boolean {
    if (nowMinutes < triggerAt) return false;
    return nowMinutes <= triggerAt + graceMinutes;
  }

  private async maybeSend(
    employeeId: string,
    workDate: Date,
    reminderType: ReminderType,
    alertKind: AttendanceAlertKind,
    send: () => Promise<void>,
    auditAction: string,
  ): Promise<void> {
    const existing = await this.prisma.attendanceReminder.findUnique({
      where: {
        employeeId_workDate_reminderType: { employeeId, workDate, reminderType },
      },
    });
    if (existing) return;

    await send();
    await this.prisma.attendanceReminder.create({
      data: { employeeId, workDate, reminderType },
    });
    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AttendanceReminder',
      entityId: employeeId,
      action: auditAction,
      after: { reminderType, alertKind, workDate: workDate.toISOString().slice(0, 10) },
    });
  }

  private bangkokWorkDate(asOf: Date): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BANGKOK_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(asOf);
    return new Date(`${parts}T00:00:00.000Z`);
  }

  private bangkokMinutesSinceMidnight(asOf: Date): number {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: BANGKOK_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(asOf);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }

  private async teamName(employeeId: string): Promise<string | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, teamId: { not: null }, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryTeam: 'desc' }],
      include: { team: { select: { name: true } } },
    });
    return assignment?.team?.name ?? null;
  }
}
