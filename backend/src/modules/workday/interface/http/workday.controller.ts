// ============================================================================
// modules/workday/interface/http/workday.controller.ts
// ============================================================================

import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { WorkDayService } from '../../application/workday.service';
import { CompanyCalendarAggregatorService } from '../../application/company-calendar-aggregator.service';
import { BangkokTimeProvider } from '../../../../shared/time/bangkok-time.provider';

@Controller()
export class WorkdayController {
  constructor(
    private readonly workdays: WorkDayService,
    private readonly calendar: CompanyCalendarAggregatorService,
    private readonly time: BangkokTimeProvider,
  ) {}

  @Get('companies/:companyId/workdays/today')
  @RequirePermission('attendance:read')
  getCompanyToday(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('teamId') teamId?: string,
  ) {
    const date = this.time.workDateString();
    return this.workdays.getCompanyWorkDays(actor, companyId, date, teamId);
  }

  @Get('companies/:companyId/workdays')
  @RequirePermission('attendance:read')
  getCompanyByDate(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('date') date: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.workdays.getCompanyWorkDays(actor, companyId, date, teamId);
  }

  @Get('companies/:companyId/attendance-command-center')
  @RequirePermission('attendance:read')
  getCommandCenter(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('date') date?: string,
  ) {
    return this.workdays.getAttendanceCommandCenter(actor, companyId, date);
  }

  @Get('companies/:companyId/company-calendar')
  @RequirePermission('leave:read')
  getCompanyCalendar(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('month') month: string,
  ) {
    return this.calendar.getMonthEvents(actor, companyId, month);
  }

  @Get('employees/:employeeId/workdays/today')
  @RequirePermission('attendance:read')
  getEmployeeToday(@Param('employeeId') employeeId: string) {
    return this.workdays.getTodayStatus(employeeId);
  }

  @Get('employees/:employeeId/workdays')
  @RequirePermission('attendance:read')
  getEmployeeMonth(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
  ) {
    return this.workdays.getEmployeeMonthWorkDays(employeeId, month);
  }

  @Get('employees/:employeeId/payroll-preview')
  @RequirePermission('payroll:read')
  getPayrollPreview(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
  ) {
    return this.workdays.getPayrollImpactPreview(employeeId, month);
  }
}
