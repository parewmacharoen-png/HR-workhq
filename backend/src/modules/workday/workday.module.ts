// ============================================================================
// modules/workday/workday.module.ts
// Foundation Sprint — WorkHQ v1 Work Day Engine
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveModule } from '../leave/leave.module';
import { PayrollModule } from '../payroll/payroll.module';
import { CalendarModule } from '../calendar/calendar.module';
import { EmployeeModule } from '../employee/employee.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkforceRiskModule } from '../workforce-risk/workforce-risk.module';
import { WorkDayService } from './application/workday.service';
import { WorkDayPayrollPreviewService } from './application/workday-payroll-preview.service';
import { WorkDayDailyBriefService } from './application/workday-daily-brief.service';
import { CompanyCalendarAggregatorService } from './application/company-calendar-aggregator.service';
import { WorkDayScopeService } from './application/workday-scope.service';
import { WorkdayController } from './interface/http/workday.controller';

@Module({
  imports: [
    forwardRef(() => AttendanceModule),
    forwardRef(() => LeaveModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => EmployeeModule),
    SettingsModule,
    forwardRef(() => WorkforceRiskModule),
  ],
  controllers: [WorkdayController],
  providers: [
    WorkDayService,
    WorkDayPayrollPreviewService,
    WorkDayDailyBriefService,
    CompanyCalendarAggregatorService,
    WorkDayScopeService,
  ],
  exports: [
    WorkDayService,
    WorkDayPayrollPreviewService,
    WorkDayDailyBriefService,
    CompanyCalendarAggregatorService,
    WorkDayScopeService,
  ],
})
export class WorkdayModule {}
