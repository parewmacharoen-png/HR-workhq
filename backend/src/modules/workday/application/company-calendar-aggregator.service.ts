// ============================================================================
// modules/workday/application/company-calendar-aggregator.service.ts
// Monthly event list: monthly off, leave, shift change, birthday, anniversary, holiday.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { BangkokTimeProvider, BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { MonthlyOffService } from '../../attendance/application/monthly-off.service';
import { WorkDayScopeService } from './workday-scope.service';

export type CompanyCalendarEventType =
  | 'monthly_off'
  | 'leave'
  | 'shift_change'
  | 'birthday'
  | 'anniversary'
  | 'holiday';

export interface CompanyCalendarEvent {
  date: string;
  type: CompanyCalendarEventType;
  title: string;
  employeeId?: string;
  employeeName?: string;
  meta?: Record<string, string>;
}

@Injectable()
export class CompanyCalendarAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BangkokTimeProvider,
    private readonly monthlyOff: MonthlyOffService,
    private readonly scope: WorkDayScopeService,
  ) {}

  async getMonthEvents(
    actor: ActorContext,
    companyId: string,
    month: string,
  ): Promise<CompanyCalendarEvent[]> {
    const employeeIds = await this.scope.resolveEmployeeIds(actor, companyId);
    const periodStart = this.time.parseWorkDate(`${month}-01`);
    const periodEnd = new Date(Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      0,
    ));
    const startIso = periodStart.toISOString().slice(0, 10);
    const endIso = periodEnd.toISOString().slice(0, 10);

    const [employees, leaves, shiftAssignments] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds }, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          hireDate: true,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          companyId,
          employeeId: { in: employeeIds },
          status: 'approved',
          deletedAt: null,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          leaveType: { select: { name: true } },
        },
      }),
      this.prisma.employeeShiftAssignment.findMany({
        where: {
          employeeId: { in: employeeIds },
          effectiveFrom: { gte: periodStart, lte: periodEnd },
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          shift: { select: { name: true } },
        },
      }),
    ]);

    const monthlyOffEvents = await this.monthlyOff.listApprovedForTeam(
      companyId,
      employeeIds,
      periodStart,
      periodEnd,
    );

    const events: CompanyCalendarEvent[] = [];

    for (const row of monthlyOffEvents) {
      if (row.status !== 'approved') continue;
      const emp = employees.find((e) => e.id === row.employeeId);
      events.push({
        date: row.date,
        type: 'monthly_off',
        title: 'วันหยุดประจำเดือน',
        employeeId: row.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : undefined,
      });
    }

    for (const leave of leaves) {
      const from = leave.startDate.toISOString().slice(0, 10);
      const to = leave.endDate.toISOString().slice(0, 10);
      const overlapStart = from > startIso ? from : startIso;
      const overlapEnd = to < endIso ? to : endIso;
      for (let d = overlapStart; d <= overlapEnd; d = addDay(d)) {
        events.push({
          date: d,
          type: 'leave',
          title: leave.leaveType.name,
          employeeId: leave.employee.id,
          employeeName: `${leave.employee.firstName} ${leave.employee.lastName}`,
        });
      }
    }

    for (const assignment of shiftAssignments) {
      const date = assignment.effectiveFrom.toISOString().slice(0, 10);
      events.push({
        date,
        type: 'shift_change',
        title: `เปลี่ยนกะ → ${assignment.shift.name}`,
        employeeId: assignment.employee.id,
        employeeName: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
      });
    }

    for (const emp of employees) {
      if (emp.dateOfBirth) {
        const bday = birthdayInMonth(emp.dateOfBirth, month);
        if (bday) {
          events.push({
            date: bday,
            type: 'birthday',
            title: 'วันเกิด',
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
          });
        }
      }
      if (emp.hireDate) {
        const anniv = anniversaryInMonth(emp.hireDate, month);
        if (anniv) {
          events.push({
            date: anniv,
            type: 'anniversary',
            title: 'ครบรอบการทำงาน',
            employeeId: emp.id,
            employeeName: `${emp.firstName} ${emp.lastName}`,
          });
        }
      }
    }

    for (let d = startIso; d <= endIso; d = addDay(d)) {
      if (isWeekend(d)) {
        events.push({ date: d, type: 'holiday', title: 'วันหยุดสุดสัปดาห์' });
      }
    }

    return events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  }
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function birthdayInMonth(dateOfBirth: Date, month: string): string | null {
  const dobMonth = dateOfBirth.toISOString().slice(5, 7);
  const targetMonth = month.slice(5, 7);
  if (dobMonth !== targetMonth) return null;
  const day = dateOfBirth.toISOString().slice(8, 10);
  return `${month}-${day}`;
}

function anniversaryInMonth(hireDate: Date, month: string): string | null {
  const hireMonth = hireDate.toISOString().slice(5, 7);
  const targetMonth = month.slice(5, 7);
  if (hireMonth !== targetMonth) return null;
  const day = hireDate.toISOString().slice(8, 10);
  return `${month}-${day}`;
}

function isWeekend(dateIso: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK_TZ,
    weekday: 'short',
  }).format(new Date(`${dateIso}T00:00:00.000Z`));
  return weekday === 'Sat' || weekday === 'Sun';
}
