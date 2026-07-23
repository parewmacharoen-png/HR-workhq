// ============================================================================
// modules/attendance/attendance.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { SettingsModule } from '../settings/settings.module';
import { LeaveModule } from '../leave/leave.module';
import { EmployeeModule } from '../employee/employee.module';
import { TelegramModule } from '../telegram/telegram.module';
import { FormulaEngineModule } from '../formula-engine/formula-engine.module';
import { AttendanceController } from './interface/http/attendance.controller';
import { ShiftAssignmentController } from './interface/http/shift-assignment.controller';
import { AbsenceController } from './interface/http/absence.controller';
import { AttendanceService } from './application/attendance.service';
import { AbsenceRecordService } from './application/absence-record.service';
import { AbsenceAutoWaiveService } from './application/absence-auto-waive.service';
import { AbsenceFlagJob } from './application/absence-flag.job';
import { AbsenceFlagScheduler } from './application/absence-flag.scheduler';
import { EmployeeDayContextService } from './application/employee-day-context.service';
import { DailyAttendanceLedgerService } from './application/daily-attendance-ledger.service';
import { AttendanceAlertService } from './application/attendance-alert.service';
import { AttendanceAlertNotifier } from './application/attendance-alert.notifier';
import { AttendanceAlertScheduler } from './application/attendance-alert.scheduler';
import { AttendanceCorrectionService } from './application/attendance-correction.service';
import { ShiftAssignmentService } from './application/shift-assignment.service';
import { EmployeeHourlyRateService } from './application/employee-hourly-rate.service';
import { MonthlyOffService } from './application/monthly-off.service';
import {
  ATTENDANCE_REPOSITORY, OVERTIME_REPOSITORY,
} from './domain/repositories/attendance.repository';
import { ABSENCE_REPOSITORY } from './domain/repositories/absence.repository';
import {
  PrismaAttendanceRepository, PrismaOvertimeRepository,
} from './infrastructure/persistence/attendance.prisma.repository';
import { PrismaAbsenceRepository } from './infrastructure/persistence/absence.prisma.repository';

@Module({
  imports: [WorkflowModule, SettingsModule, forwardRef(() => LeaveModule), forwardRef(() => EmployeeModule), forwardRef(() => TelegramModule), FormulaEngineModule],
  controllers: [AttendanceController, AbsenceController, ShiftAssignmentController],
  providers: [
    AttendanceService,
    AbsenceRecordService,
    AbsenceAutoWaiveService,
    AbsenceFlagJob,
    AbsenceFlagScheduler,
    EmployeeDayContextService,
    DailyAttendanceLedgerService,
    AttendanceAlertService,
    AttendanceAlertNotifier,
    AttendanceAlertScheduler,
    AttendanceCorrectionService,
    ShiftAssignmentService,
    EmployeeHourlyRateService,
    MonthlyOffService,
    { provide: ATTENDANCE_REPOSITORY, useClass: PrismaAttendanceRepository },
    { provide: OVERTIME_REPOSITORY, useClass: PrismaOvertimeRepository },
    { provide: ABSENCE_REPOSITORY, useClass: PrismaAbsenceRepository },
  ],
  exports: [AttendanceService, AbsenceRecordService, AbsenceAutoWaiveService, AttendanceAlertService, AttendanceCorrectionService, ShiftAssignmentService, MonthlyOffService, DailyAttendanceLedgerService],
})
export class AttendanceModule {}
