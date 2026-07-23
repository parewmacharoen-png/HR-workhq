// ============================================================================
// modules/workday/application/workday.service.ts
// Foundation Sprint — central Work Day Engine orchestrator.
// ============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { BangkokTimeProvider, BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';
import {
  buildShiftWindow,
  defaultShiftFromRules,
  resolveEffectiveAssignment,
  resolveShiftFallbackFromProfile,
  toShiftDefinition,
  type ShiftAssignmentRow,
} from '../../attendance/domain/services/shift-resolver.service';
import {
  resolveWorkDayState,
  shouldFlagBreakTooLong,
  shouldFlagMissingCheckIn,
  shouldFlagMissingCheckOut,
} from '../domain/workday-state.resolver';
import {
  AttendanceCommandCenterDto,
  WORKDAY_STATE_LABELS,
  WorkDayAttendanceSnapshot,
  WorkDayDto,
  WorkDayEmployeeRef,
  WorkDayException,
  WorkDayExceptionType,
  WorkDayLeaveSnapshot,
  WorkDayMonthlyOffSnapshot,
  WorkDayOvertimeSnapshot,
  WorkDayPayrollImpact,
  WorkDayShiftSnapshot,
  WorkDayState,
  WorkDayStateGroup,
  WorkDayTimelineEntry,
} from '../domain/workday-state.types';
import { WorkDayPayrollPreviewService } from './workday-payroll-preview.service';
import { WorkDayScopeService } from './workday-scope.service';

interface EmployeeRow {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  teamName: string | null;
  companyId: string;
}

@Injectable()
export class WorkDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BangkokTimeProvider,
    private readonly settings: AttendanceSettingsService,
    private readonly payrollPreview: WorkDayPayrollPreviewService,
    private readonly scope: WorkDayScopeService,
  ) {}

  async getWorkDay(employeeId: string, dateIso: string): Promise<WorkDayDto> {
    const employee = await this.loadEmployee(employeeId);
    return this.buildWorkDay(employee, dateIso);
  }

  async getTodayStatus(employeeId: string): Promise<WorkDayDto> {
    const employee = await this.loadEmployee(employeeId);
    const dateIso = await this.resolveActiveWorkDateIso(employeeId) ?? this.time.workDateString();
    return this.buildWorkDay(employee, dateIso);
  }

  /** When night shift is still open from a prior calendar day, use that work date. */
  private async resolveActiveWorkDateIso(employeeId: string): Promise<string | null> {
    const open = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        checkInAt: { not: null },
        checkOutAt: null,
      },
      orderBy: [{ workDate: 'asc' }, { checkInAt: 'asc' }],
      select: { workDate: true },
    });
    if (!open) return null;
    return open.workDate.toISOString().slice(0, 10);
  }

  async getEmployeeMonthWorkDays(employeeId: string, month: string): Promise<WorkDayDto[]> {
    const employee = await this.loadEmployee(employeeId);
    const days = daysInMonth(month);
    return Promise.all(days.map((date) => this.buildWorkDay(employee, date)));
  }

  async getCompanyWorkDays(
    actor: ActorContext,
    companyId: string,
    dateIso: string,
    teamId?: string,
  ): Promise<WorkDayDto[]> {
    const employeeIds = await this.scope.resolveEmployeeIds(actor, companyId, teamId);
    return this.getCompanyWorkDaysByEmployeeIds(companyId, dateIso, employeeIds);
  }

  async getCompanyWorkDaysByEmployeeIds(
    companyId: string,
    dateIso: string,
    employeeIds: string[],
  ): Promise<WorkDayDto[]> {
    const employees = await this.loadEmployees(employeeIds, companyId);
    return Promise.all(employees.map((emp) => this.buildWorkDay(emp, dateIso)));
  }

  async getAttendanceCommandCenter(
    actor: ActorContext,
    companyId: string,
    dateIso?: string,
  ): Promise<AttendanceCommandCenterDto> {
    const date = dateIso ?? this.time.workDateString();
    const employeeIds = await this.scope.resolveEmployeeIds(actor, companyId);
    const workDays = await this.getCompanyWorkDaysByEmployeeIds(companyId, date, employeeIds);

    const summary = emptyStateSummary();
    const groupMap = new Map<WorkDayState, WorkDayStateGroup>();
    for (const state of Object.keys(WORKDAY_STATE_LABELS) as WorkDayState[]) {
      groupMap.set(state, {
        state,
        label: WORKDAY_STATE_LABELS[state],
        count: 0,
        employees: [],
      });
    }

    for (const day of workDays) {
      summary[day.state] += 1;
      const group = groupMap.get(day.state)!;
      group.count += 1;
      group.employees.push({
        ...day.employee,
        state: day.state,
        lateMinutes: day.attendance?.lateMinutes,
      });
    }

    const exceptionBuckets = buildExceptionBuckets(workDays);

    return {
      date,
      companyId,
      summary,
      groups: [...groupMap.values()].filter((g) => g.count > 0),
      exceptions: exceptionBuckets,
      widgets: {
        working: filterWidget(workDays, ['WORKING']),
        late: workDays.filter((d) => (d.attendance?.lateMinutes ?? 0) > 0 && d.attendance?.checkInAt),
        notCheckedIn: filterWidget(workDays, ['MISSING_CHECK_IN', 'SCHEDULED', 'ABSENT']),
        onBreak: filterWidget(workDays, ['BREAK']),
        ot: filterWidget(workDays, ['OT']),
        offDay: filterWidget(workDays, ['MONTHLY_OFF', 'HOLIDAY']),
        onLeave: filterWidget(workDays, ['LEAVE']),
        needsAction: workDays.filter(
          (d) => d.state === 'NEEDS_RECALCULATION' || d.exceptions.length > 0,
        ),
      },
    };
  }

  async getPayrollImpactPreview(employeeId: string, month: string) {
    const employee = await this.loadEmployee(employeeId);
    return this.payrollPreview.preview(employeeId, employee.companyId, month);
  }

  private async buildWorkDay(employee: EmployeeRow, dateIso: string): Promise<WorkDayDto> {
    const workDate = this.time.parseWorkDate(dateIso);
    const todayIso = this.time.workDateString();
    const now = this.time.now();
    const nowMinutes = this.time.minutesSinceMidnight(now);
    const rules = await this.settings.getRules(employee.companyId);

    const [
      attendance,
      absence,
      leaveRows,
      monthlyOffRows,
      otRow,
      assignments,
    ] = await Promise.all([
      this.prisma.attendanceRecord.findFirst({
        where: {
          employeeId: employee.id,
          companyId: employee.companyId,
          workDate,
          deletedAt: null,
        },
      }),
      this.prisma.absenceRecord.findFirst({
        where: {
          employeeId: employee.id,
          companyId: employee.companyId,
          workDate,
          deletedAt: null,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          companyId: employee.companyId,
          status: { in: ['approved', 'pending'] },
          deletedAt: null,
          startDate: { lte: workDate },
          endDate: { gte: workDate },
        },
        include: { leaveType: { select: { code: true, name: true } } },
      }),
      this.prisma.monthlyOffRequest.findMany({
        where: {
          employeeId: employee.id,
          companyId: employee.companyId,
          status: { in: ['approved', 'pending'] },
          deletedAt: null,
        },
        select: { id: true, selectedDates: true, status: true },
      }),
      this.prisma.overtimeRecord.findFirst({
        where: {
          employeeId: employee.id,
          companyId: employee.companyId,
          workDate,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employeeShiftAssignment.findMany({
        where: { employeeId: employee.id },
        include: {
          shift: {
            select: {
              id: true,
              name: true,
              startMinutes: true,
              endMinutes: true,
              crossesMidnight: true,
            },
          },
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    const assignmentRows = assignments as unknown as ShiftAssignmentRow[];
    const effective = resolveEffectiveAssignment(assignmentRows, workDate);
    const profileShift = await this.prisma.adminCommissionEmployeeProfile.findFirst({
      where: { employeeId: employee.id, companyId: employee.companyId, deletedAt: null },
      select: { defaultShift: true },
    });
    const shiftDef = effective
      ? toShiftDefinition(effective.shift)
      : resolveShiftFallbackFromProfile(profileShift?.defaultShift, rules);
    const window = buildShiftWindow(workDate, shiftDef);

    const approvedLeave = leaveRows.find((l) => l.status === 'approved') ?? null;
    const pendingLeave = leaveRows.find((l) => l.status === 'pending') ?? null;
    const approvedMonthlyOff = monthlyOffRows.find(
      (m) => m.status === 'approved' && datesInclude(m.selectedDates, dateIso),
    ) ?? null;
    const pendingMonthlyOff = monthlyOffRows.find(
      (m) => m.status === 'pending' && datesInclude(m.selectedDates, dateIso),
    ) ?? null;

    const isHoliday = false;
    const missingCheckIn = shouldFlagMissingCheckIn({
      dateIso,
      todayIso,
      nowMinutes,
      shiftStartMinutes: shiftDef.startMinutes,
      graceMinutes: rules.graceMinutes,
      checkInAt: attendance?.checkInAt ?? null,
      approvedLeave: !!approvedLeave,
      approvedMonthlyOff: !!approvedMonthlyOff,
      isHoliday,
    });
    const missingCheckOut = shouldFlagMissingCheckOut({
      dateIso,
      todayIso,
      nowMinutes,
      shiftEndMinutes: shiftDef.endMinutes,
      checkInAt: attendance?.checkInAt ?? null,
      checkOutAt: attendance?.checkOutAt ?? null,
      approvedLeave: !!approvedLeave,
      approvedMonthlyOff: !!approvedMonthlyOff,
      isHoliday,
    });
    const breakTooLong = shouldFlagBreakTooLong({
      breakStartAt: attendance?.breakStartAt ?? null,
      breakEndAt: attendance?.breakEndAt ?? null,
      now,
      breakMinutes: rules.breakMinutes,
    });

    const otStatus = otRow?.status as 'pending' | 'approved' | 'rejected' | undefined;
    const state = resolveWorkDayState({
      dateIso,
      todayIso,
      nowMinutes,
      isHoliday,
      approvedLeave: !!approvedLeave,
      pendingLeave: !!pendingLeave,
      approvedMonthlyOff: !!approvedMonthlyOff,
      pendingMonthlyOff: !!pendingMonthlyOff,
      hasAbsence: !!absence,
      attendance: attendance
        ? {
            checkInAt: attendance.checkInAt,
            checkOutAt: attendance.checkOutAt,
            breakStartAt: attendance.breakStartAt,
            breakEndAt: attendance.breakEndAt,
            needsRecalculation: attendance.needsRecalculation,
          }
        : null,
      overtime: otRow ? { status: otStatus ?? 'pending' } : null,
      shiftEndMinutes: shiftDef.endMinutes,
      graceMinutes: rules.graceMinutes,
      breakMinutes: rules.breakMinutes,
      missingCheckIn,
      missingCheckOut,
      breakTooLong,
    });

    const shift: WorkDayShiftSnapshot = {
      shiftId: shiftDef.id,
      shiftName: shiftDef.name,
      shiftStartAt: window.shiftStartAt.toISOString(),
      shiftEndAt: window.shiftEndAt.toISOString(),
      startMinutes: shiftDef.startMinutes,
      endMinutes: shiftDef.endMinutes,
      crossesMidnight: shiftDef.crossesMidnight,
    };

    const attendanceSnap: WorkDayAttendanceSnapshot | null = attendance
      ? {
          id: attendance.id,
          checkInAt: attendance.checkInAt?.toISOString() ?? null,
          checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
          breakStartAt: attendance.breakStartAt?.toISOString() ?? null,
          breakEndAt: attendance.breakEndAt?.toISOString() ?? null,
          lateMinutes: attendance.lateMinutes,
          roundedLateHours: Number(attendance.roundedLateHours ?? 0),
          lateDeduction: Number(attendance.lateDeduction ?? 0),
          workedMinutes: attendance.workedMinutes,
          needsRecalculation: attendance.needsRecalculation,
        }
      : null;

    const leave: WorkDayLeaveSnapshot = approvedLeave || pendingLeave
      ? {
          requestId: (approvedLeave ?? pendingLeave)!.id,
          leaveTypeCode: (approvedLeave ?? pendingLeave)!.leaveType.code,
          leaveTypeName: (approvedLeave ?? pendingLeave)!.leaveType.name,
          status: approvedLeave ? 'approved' : 'pending',
        }
      : { requestId: null, leaveTypeCode: null, leaveTypeName: null, status: null };

    const monthlyOff: WorkDayMonthlyOffSnapshot = approvedMonthlyOff || pendingMonthlyOff
      ? {
          requestId: (approvedMonthlyOff ?? pendingMonthlyOff)!.id,
          status: approvedMonthlyOff ? 'approved' : 'pending',
        }
      : { requestId: null, status: null };

    const overtime: WorkDayOvertimeSnapshot = otRow
      ? {
          id: otRow.id,
          otHours: Number(otRow.otHours),
          amount: Number(otRow.amount),
          status: otStatus ?? 'pending',
        }
      : { id: null, otHours: 0, amount: 0, status: null };

    const exceptions = buildExceptions({
      missingCheckIn,
      missingCheckOut,
      breakTooLong,
      needsRecalculation: attendance?.needsRecalculation ?? false,
      otPending: otStatus === 'pending',
      monthlyOffPending: !!pendingMonthlyOff,
      leavePending: !!pendingLeave,
    });

    const payrollImpact: WorkDayPayrollImpact | null = attendanceSnap
      ? {
          lateDeduction: attendanceSnap.lateDeduction,
          overtimeAmount: overtime.status === 'approved' ? overtime.amount : 0,
          manualBonus: 0,
          manualCommission: 0,
          manualAllowance: 0,
          manualDeduction: 0,
          unpaidLeaveDeduction: 0,
          totalImpact: attendanceSnap.lateDeduction
            + (overtime.status === 'approved' ? overtime.amount : 0),
        }
      : null;

    return {
      employee: toEmployeeRef(employee),
      date: dateIso,
      state,
      shift,
      attendance: attendanceSnap,
      monthlyOff,
      leave,
      overtime,
      exceptions,
      payrollImpact,
      timeline: [{ date: dateIso, state, label: WORKDAY_STATE_LABELS[state] }],
    };
  }

  private async loadEmployee(employeeId: string): Promise<EmployeeRow> {
    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        assignments: {
          where: { effectiveTo: null, deletedAt: null },
          orderBy: [{ isPrimaryCompany: 'desc' }, { isPrimaryTeam: 'desc' }],
          take: 1,
          select: {
            companyId: true,
            team: { select: { name: true } },
          },
        },
      },
    });
    if (!row || !row.assignments[0]) {
      throw new NotFoundException('Employee not found');
    }
    return {
      id: row.id,
      globalId: row.globalId,
      firstName: row.firstName,
      lastName: row.lastName,
      teamName: row.assignments[0].team?.name ?? null,
      companyId: row.assignments[0].companyId,
    };
  }

  private async loadEmployees(employeeIds: string[], companyId: string): Promise<EmployeeRow[]> {
    if (!employeeIds.length) return [];
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        assignments: {
          where: { companyId, effectiveTo: null, deletedAt: null },
          take: 1,
          select: {
            companyId: true,
            team: { select: { name: true } },
          },
        },
      },
    });
    return rows
      .filter((r) => r.assignments[0])
      .map((r) => ({
        id: r.id,
        globalId: r.globalId,
        firstName: r.firstName,
        lastName: r.lastName,
        teamName: r.assignments[0].team?.name ?? null,
        companyId: r.assignments[0].companyId,
      }));
  }
}

function toEmployeeRef(employee: EmployeeRow): WorkDayEmployeeRef {
  return {
    id: employee.id,
    globalId: employee.globalId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    teamName: employee.teamName,
  };
}

function datesInclude(selectedDates: unknown, dateIso: string): boolean {
  if (!Array.isArray(selectedDates)) return false;
  return selectedDates.includes(dateIso);
}

function emptyStateSummary(): Record<WorkDayState, number> {
  return {
    SCHEDULED: 0,
    WORKING: 0,
    BREAK: 0,
    OT: 0,
    FINISHED: 0,
    MONTHLY_OFF: 0,
    LEAVE: 0,
    ABSENT: 0,
    HOLIDAY: 0,
    MISSING_CHECK_IN: 0,
    MISSING_CHECK_OUT: 0,
    NEEDS_RECALCULATION: 0,
  };
}

function filterWidget(workDays: WorkDayDto[], states: WorkDayState[]): WorkDayDto[] {
  return workDays.filter((d) => states.includes(d.state));
}

function buildExceptions(flags: {
  missingCheckIn: boolean;
  missingCheckOut: boolean;
  breakTooLong: boolean;
  needsRecalculation: boolean;
  otPending: boolean;
  monthlyOffPending: boolean;
  leavePending: boolean;
}): WorkDayException[] {
  const items: WorkDayException[] = [];
  if (flags.missingCheckIn) {
    items.push({ type: 'missing_check_in', label: 'ลืมกดเข้างาน', severity: 'warning' });
  }
  if (flags.missingCheckOut) {
    items.push({ type: 'missing_check_out', label: 'ลืมกดเลิกงาน', severity: 'warning' });
  }
  if (flags.breakTooLong) {
    items.push({ type: 'break_too_long', label: 'พักเกินเวลา', severity: 'warning' });
  }
  if (flags.needsRecalculation) {
    items.push({ type: 'needs_recalculation', label: 'ต้องคำนวณใหม่', severity: 'action' });
  }
  if (flags.otPending) {
    items.push({ type: 'ot_pending', label: 'OT รออนุมัติ', severity: 'info' });
  }
  if (flags.monthlyOffPending) {
    items.push({ type: 'monthly_off_pending', label: 'วันหยุดประจำเดือนรออนุมัติ', severity: 'info' });
  }
  if (flags.leavePending) {
    items.push({ type: 'leave_pending', label: 'คำขอลารออนุมัติ', severity: 'info' });
  }
  return items;
}

function buildExceptionBuckets(workDays: WorkDayDto[]): AttendanceCommandCenterDto['exceptions'] {
  const types: WorkDayExceptionType[] = [
    'missing_check_in',
    'missing_check_out',
    'break_too_long',
    'needs_recalculation',
    'ot_pending',
    'monthly_off_pending',
    'leave_pending',
  ];
  const labels: Record<WorkDayExceptionType, string> = {
    missing_check_in: 'ลืมกดเข้างาน',
    missing_check_out: 'ลืมกดเลิกงาน',
    break_too_long: 'พักเกินเวลา',
    needs_recalculation: 'ต้องคำนวณใหม่',
    ot_pending: 'OT รออนุมัติ',
    monthly_off_pending: 'วันหยุดรออนุมัติ',
    leave_pending: 'ลารออนุมัติ',
  };

  return types.map((type) => {
    const items = workDays
      .filter((d) => d.exceptions.some((e) => e.type === type))
      .map((d) => ({
        ...d.employee,
        detail: d.exceptions.find((e) => e.type === type)?.label,
      }));
    return { type, label: labels[type], count: items.length, items };
  }).filter((bucket) => bucket.count > 0);
}

function daysInMonth(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= lastDay; d += 1) {
    days.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return days;
}
