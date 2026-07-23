// ============================================================================
// modules/employee/employee.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { OrganizationModule } from '../organization/organization.module';
import { PerformanceModule } from '../performance/performance.module';
import { PositionFrameworkModule } from '../position-framework/position-framework.module';
import { AssetModule } from '../asset/asset.module';
import { SecurityModule } from '../security/security.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PermissionModule } from '../permission/permission.module';
import { LeaveModule } from '../leave/leave.module';
import { SettingsModule } from '../settings/settings.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PerformanceReviewModule } from '../performance-review/performance-review.module';
import { CommissionModule } from '../commission/commission.module';
import { EmployeeController } from './interface/http/employee.controller';
import { EmployeeProfileController } from './interface/http/employee-profile.controller';
import { EmployeeService } from './application/employee.service';
import { EmployeeProfileService } from './application/employee-profile.service';
import { EmployeeProfileAccessService } from './application/employee-profile-access.service';
import { EmployeeEventsService } from './application/employee-events.service';
import { EmployeeAccessService } from './application/employee-access.service';
import { EmployeeRecognitionAccessService } from './application/employee-recognition-access.service';
import { EmployeeRecognitionService } from './application/employee-recognition.service';
import { EmployeeHomeService } from './application/employee-home.service';
import { EmployeeOverviewService } from './application/employee-overview.service';
import { EmployeeAttendanceService } from './application/employee-attendance.service';
import { EmployeeEmploymentService } from './application/employee-employment.service';
import { EmployeeBusinessRoleService } from './application/employee-business-role.service';
import { EmployeeTimelineService } from './application/employee-timeline.service';
import { EmployeeLeaveService } from './application/employee-leave.service';
import { EmployeePayrollService } from './application/employee-payroll.service';
import { EmployeePerformanceService } from './application/employee-performance.service';
import { EmployeeCommissionService } from './application/employee-commission.service';
import { EmployeePersonalService } from './application/employee-personal.service';
import { EmployeeEducationService } from './application/employee-education.service';
import { EmployeeWorkExperienceService } from './application/employee-work-experience.service';
import {
  EMPLOYEE_REPOSITORY, ASSIGNMENT_REPOSITORY,
} from './domain/repositories/employee.repository';
import { GLOBAL_ID_SEQUENCE } from './domain/services/global-id.service';
import {
  PrismaEmployeeRepository, PrismaAssignmentRepository, PrismaGlobalIdSequence,
} from './infrastructure/persistence/employee.prisma.repository';

@Module({
  imports: [
    AssetModule,
    OrganizationModule,
    forwardRef(() => SecurityModule),
    HierarchyModule,
    PositionFrameworkModule,
    PermissionModule,
    forwardRef(() => LeaveModule),
    SettingsModule,
    forwardRef(() => AttendanceModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => PerformanceReviewModule),
    forwardRef(() => CommissionModule),
    forwardRef(() => PerformanceModule),
    forwardRef(() => TelegramModule),
  ],
  controllers: [EmployeeController, EmployeeProfileController],
  providers: [
    EmployeeService,
    EmployeeProfileService,
    EmployeeProfileAccessService,
    EmployeeEventsService,
    EmployeeAccessService,
    EmployeeRecognitionAccessService,
    EmployeeRecognitionService,
    EmployeeHomeService,
    EmployeeOverviewService,
    EmployeeAttendanceService,
    EmployeeEmploymentService,
    EmployeeBusinessRoleService,
    EmployeeTimelineService,
    EmployeeLeaveService,
    EmployeePayrollService,
    EmployeePerformanceService,
    EmployeeCommissionService,
    EmployeePersonalService,
    EmployeeEducationService,
    EmployeeWorkExperienceService,
    { provide: EMPLOYEE_REPOSITORY, useClass: PrismaEmployeeRepository },
    { provide: ASSIGNMENT_REPOSITORY, useClass: PrismaAssignmentRepository },
    { provide: GLOBAL_ID_SEQUENCE, useClass: PrismaGlobalIdSequence },
  ],
  exports: [
    EmployeeService,
    EmployeeEventsService,
    EmployeeAccessService,
    EmployeeRecognitionAccessService,
    EmployeeRecognitionService,
    EmployeeHomeService,
    EmployeeOverviewService,
    EmployeeProfileService,
    EmployeeProfileAccessService,
    GLOBAL_ID_SEQUENCE,
    EMPLOYEE_REPOSITORY,
    ASSIGNMENT_REPOSITORY,
  ],
})
export class EmployeeModule {}
