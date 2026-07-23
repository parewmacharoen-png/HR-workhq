import { Controller, Get, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { TeamCalendarService } from '../../application/team-calendar.service';
import { TeamLeaveConflictService } from '../../application/team-leave-conflict.service';
import { TeamCalendarScopeService } from '../../application/team-calendar-scope.service';
import { DateProvider } from '../../../../shared/time/date.provider';

@Controller('calendar')
export class TeamCalendarController {
  constructor(
    private readonly calendar: TeamCalendarService,
    private readonly conflicts: TeamLeaveConflictService,
    private readonly scope: TeamCalendarScopeService,
    private readonly dates: DateProvider,
  ) {}

  @Get('team')
  @RequirePermission('leave:read')
  getTeam(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('teamId') teamId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('leaveType') leaveType?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.calendar.getTeam(actor, { companyId, teamId, startDate, endDate, leaveType, employeeId });
  }

  @Get('company')
  @RequirePermission('leave:read')
  getCompany(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.calendar.getCompany(actor, companyId, { startDate, endDate });
  }

  @Get('upcoming')
  @RequirePermission('leave:read')
  getUpcoming(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('days') days?: string,
  ) {
    return this.calendar.getUpcoming(actor, companyId, days ? Number(days) : 7);
  }

  @Get('today')
  @RequirePermission('leave:read')
  getToday(@CurrentActor() actor: ActorContext, @Query('companyId') companyId?: string) {
    return this.calendar.getToday(actor, companyId);
  }

  @Get('tomorrow')
  @RequirePermission('leave:read')
  getTomorrow(@CurrentActor() actor: ActorContext, @Query('companyId') companyId?: string) {
    return this.calendar.getTomorrow(actor, companyId);
  }

  @Get('conflicts')
  @RequirePermission('leave:read')
  async checkConflicts(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('teamId') teamId?: string,
    @Query('excludeRequestId') excludeRequestId?: string,
  ) {
    const scope = await this.scope.resolve(actor, companyId, teamId);
    const memberIds = scope.employeeIds ?? [];
    return this.conflicts.checkTeamOverlap(
      actor,
      memberIds,
      companyId,
      this.dates.parseDate(startDate),
      this.dates.parseDate(endDate),
      excludeRequestId,
    );
  }
}
