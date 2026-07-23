// ============================================================================
// modules/calendar/application/team-calendar.service.ts
// TEAM-001 — Team Leave & Off-Day Calendar
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  isEmergencyLeaveType,
  isOffDayLeaveType,
  isSickLeaveType,
  isUnpaidLeaveType,
} from '../../leave/domain/services/leave-type-classification';
import {
  CalendarEventCategory,
  CalendarEventDto,
  TeamCalendarResponse,
} from './dto/team-calendar.dto';
import { TeamCalendarScopeService } from './team-calendar-scope.service';

@Injectable()
export class TeamCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    private readonly scopeService: TeamCalendarScopeService,
  ) {}

  async getTeam(
    actor: ActorContext,
    query: { companyId?: string; teamId?: string; startDate?: string; endDate?: string; leaveType?: string; employeeId?: string },
  ): Promise<TeamCalendarResponse> {
    const scope = await this.scopeService.resolve(actor, query.companyId, query.teamId);
    const events = await this.loadEvents(scope, query);
    await this.auditView(actor, scope.companyId, 'team');
    return this.wrap(scope, events);
  }

  async getCompany(actor: ActorContext, companyId: string, query: { startDate?: string; endDate?: string }) {
    const scope = await this.scopeService.resolve(actor, companyId);
    const events = await this.loadEvents(scope, { ...query, companyId });
    await this.auditView(actor, companyId, 'company');
    return this.wrap(scope, events);
  }

  async getUpcoming(actor: ActorContext, companyId?: string, days = 7) {
    const scope = await this.scopeService.resolve(actor, companyId);
    const start = this.dates.today();
    const end = this.dates.addDays(start, days);
    const events = await this.loadEvents(scope, {
      companyId: scope.companyId ?? companyId,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });
    return this.wrap(scope, events);
  }

  async getToday(actor: ActorContext, companyId?: string) {
    const d = this.dates.todayString();
    return this.getForSingleDay(actor, companyId, d);
  }

  async getTomorrow(actor: ActorContext, companyId?: string) {
    const d = this.dates.tomorrowString();
    return this.getForSingleDay(actor, companyId, d);
  }

  private async getForSingleDay(actor: ActorContext, companyId: string | undefined, dateStr: string) {
    const scope = await this.scopeService.resolve(actor, companyId);
    const events = await this.loadEvents(scope, {
      companyId: scope.companyId ?? companyId,
      startDate: dateStr,
      endDate: dateStr,
    });
    return { date: dateStr, events, count: events.length };
  }

  private async loadEvents(
    scope: Awaited<ReturnType<TeamCalendarScopeService['resolve']>>,
    query: { companyId?: string; startDate?: string; endDate?: string; leaveType?: string; employeeId?: string },
  ): Promise<CalendarEventDto[]> {
    const start = query.startDate
      ? this.dates.parseDate(query.startDate)
      : this.dates.startOfMonth();
    const end = query.endDate
      ? this.dates.parseDate(query.endDate)
      : this.dates.endOfMonth();

    const companyFilter = query.companyId
      ? [query.companyId]
      : scope.companyIds;

    if (companyFilter.length === 0) return [];

    const employeeFilter = query.employeeId
      ? [query.employeeId]
      : scope.employeeIds;

    const leaveRows = await this.prisma.leaveRequest.findMany({
      where: {
        companyId: { in: companyFilter },
        status: { in: ['approved', 'pending'] },
        deletedAt: null,
        startDate: { lte: end },
        endDate: { gte: start },
        employeeId: employeeFilter ? { in: employeeFilter } : undefined,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        leaveType: { select: { code: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    const teamMap = await this.loadTeamNames(leaveRows.map((r) => r.employeeId));

    const events: CalendarEventDto[] = [];
    for (const r of leaveRows) {
      if (query.leaveType && r.leaveType.code !== query.leaveType) continue;
      events.push({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
        teamId: teamMap.get(r.employeeId)?.teamId ?? null,
        teamName: teamMap.get(r.employeeId)?.teamName ?? null,
        companyId: r.companyId,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        category: this.categoryForType(r.leaveType.code),
        leaveTypeCode: r.leaveType.code,
        leaveTypeName: r.leaveType.name,
        status: r.status,
        source: 'leave',
      });
    }

    const swapRows = await this.prisma.leaveShiftSwapRequest.findMany({
      where: {
        status: 'approved',
        deletedAt: null,
        companyId: { in: companyFilter },
        ...(employeeFilter ? { requesterEmployeeId: { in: employeeFilter } } : {}),
        OR: [
          {
            requesterLeaveRequest: {
              startDate: { lte: end },
              endDate: { gte: start },
            },
          },
        ],
      },
      include: {
        requesterEmployee: { select: { id: true, firstName: true, lastName: true } },
        requesterLeaveRequest: { select: { startDate: true, endDate: true } },
      },
    });

    for (const s of swapRows) {
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId: s.requesterEmployeeId, effectiveTo: null, deletedAt: null },
        include: { team: { select: { id: true, name: true, companyId: true } } },
      });
      if (!assignment || !companyFilter.includes(assignment.companyId)) continue;
      const sd = s.requesterLeaveRequest.startDate.toISOString().slice(0, 10);
      const ed = s.requesterLeaveRequest.endDate.toISOString().slice(0, 10);
      events.push({
        id: s.id,
        employeeId: s.requesterEmployeeId,
        employeeName: `${s.requesterEmployee.firstName} ${s.requesterEmployee.lastName}`,
        teamId: assignment.teamId,
        teamName: assignment.team?.name ?? null,
        companyId: assignment.companyId,
        startDate: sd,
        endDate: ed,
        category: 'shift_change',
        leaveTypeCode: null,
        leaveTypeName: 'สลับกะ',
        status: s.status,
        source: 'shift_swap',
      });
    }

    const monthlyOffRows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        companyId: { in: companyFilter },
        status: { in: ['approved', 'pending'] },
        deletedAt: null,
        ...(employeeFilter ? { employeeId: { in: employeeFilter } } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const missingTeamIds = monthlyOffRows
      .map((r) => r.employeeId)
      .filter((id) => !teamMap.has(id));
    if (missingTeamIds.length > 0) {
      const extraTeams = await this.loadTeamNames(missingTeamIds);
      for (const [id, info] of extraTeams) teamMap.set(id, info);
    }

    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    for (const row of monthlyOffRows) {
      const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
      for (const date of dates) {
        if (date < startIso || date > endIso) continue;
        events.push({
          id: `${row.id}:${date}`,
          employeeId: row.employeeId,
          employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
          teamId: teamMap.get(row.employeeId)?.teamId ?? null,
          teamName: teamMap.get(row.employeeId)?.teamName ?? null,
          companyId: row.companyId,
          startDate: date,
          endDate: date,
          category: 'monthly_off',
          leaveTypeCode: 'monthly_off',
          leaveTypeName: 'วันหยุดประจำเดือน',
          status: row.status,
          source: 'monthly_off',
        });
      }
    }

    return events.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  private categoryForType(code: string): CalendarEventCategory {
    if (isSickLeaveType(code)) return 'sick_leave';
    if (isEmergencyLeaveType(code)) return 'emergency_leave';
    if (isUnpaidLeaveType(code)) return 'unpaid_leave';
    if (isOffDayLeaveType(code)) return 'off_day';
    return 'approved_leave';
  }

  private async loadTeamNames(employeeIds: string[]) {
    const map = new Map<string, { teamId: string | null; teamName: string | null }>();
    if (employeeIds.length === 0) return map;
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { employeeId: { in: employeeIds }, effectiveTo: null, deletedAt: null },
      include: { team: { select: { id: true, name: true } } },
      orderBy: { isPrimaryTeam: 'desc' },
    });
    for (const r of rows) {
      if (!map.has(r.employeeId)) {
        map.set(r.employeeId, { teamId: r.teamId, teamName: r.team?.name ?? null });
      }
    }
    return map;
  }

  private wrap(
    scope: Awaited<ReturnType<TeamCalendarScopeService['resolve']>>,
    events: CalendarEventDto[],
  ): TeamCalendarResponse {
    const today = this.dates.todayString();
    const tomorrow = this.dates.tomorrowString();
    const weekEnd = this.dates.addDays(this.dates.today(), 7).toISOString().slice(0, 10);

    const covers = (e: CalendarEventDto, d: string) => e.startDate <= d && e.endDate >= d;

    return {
      events,
      scope: { companyId: scope.companyId, teamId: scope.teamId, role: scope.role },
      summary: {
        todayOff: events.filter((e) => covers(e, today)).length,
        tomorrowOff: events.filter((e) => covers(e, tomorrow)).length,
        upcoming7Days: events.filter((e) => e.startDate <= weekEnd && e.endDate >= today).length,
      },
    };
  }

  private async auditView(actor: ActorContext, companyId: string | null, view: string) {
    await this.audit.record(actor, {
      entityType: 'TeamCalendar',
      entityId: companyId ?? 'all',
      action: 'calendar_viewed',
      after: { view },
    });
  }
}
