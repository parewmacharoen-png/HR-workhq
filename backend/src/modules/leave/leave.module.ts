// ============================================================================
// modules/leave/leave.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { SettingsModule } from '../settings/settings.module';
import { EmployeeModule } from '../employee/employee.module';
import { CalendarModule } from '../calendar/calendar.module';
import { LeaveController } from './interface/http/leave.controller';
import { LeaveService } from './application/leave.service';
import { LeaveApprovalRoutingService } from './application/leave-approval-routing.service';
import { EmployeeDayConflictService } from './application/employee-day-conflict.service';
import {
  LEAVE_REPOSITORY, HOLIDAY_CONVERSION_REPOSITORY,
} from './domain/repositories/leave.repository';
import {
  PrismaLeaveRepository, PrismaHolidayConversionRepository,
} from './infrastructure/persistence/leave.prisma.repository';

@Module({
  imports: [WorkflowModule, SettingsModule, forwardRef(() => EmployeeModule), forwardRef(() => CalendarModule)],
  controllers: [LeaveController],
  providers: [
    LeaveService,
    LeaveApprovalRoutingService,
    EmployeeDayConflictService,
    { provide: LEAVE_REPOSITORY, useClass: PrismaLeaveRepository },
    { provide: HOLIDAY_CONVERSION_REPOSITORY, useClass: PrismaHolidayConversionRepository },
  ],
  exports: [LeaveService, LeaveApprovalRoutingService, EmployeeDayConflictService, LEAVE_REPOSITORY],
})
export class LeaveModule {}
