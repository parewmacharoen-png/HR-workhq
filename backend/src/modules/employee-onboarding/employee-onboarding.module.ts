// ============================================================================
// modules/employee-onboarding/employee-onboarding.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { SecurityModule } from '../security/security.module';
import { DocumentStorageModule } from '../../shared/storage/document-storage.module';
import { TelegramModule } from '../telegram/telegram.module';
import { RequestModule } from '../request/request.module';
import { PermissionModule } from '../permission/permission.module';
import { PerformanceModule } from '../performance/performance.module';
import { PayrollModule } from '../payroll/payroll.module';
import { EmployeeTelegramInviteService } from './application/employee-telegram-invite.service';
import { EmployeeSelfOnboardingService } from './application/employee-self-onboarding.service';
import { EmployeeOnboardingController } from './interface/http/employee-onboarding.controller';
import { TelegramSelfOnboardingHandler } from './application/telegram-self-onboarding.handler';
import { TelegramSelfOnboardingEmploymentWizard } from './application/telegram-self-onboarding-employment.wizard';
import { TelegramInviteLinkHandler } from './application/telegram-invite-link.handler';
import { EmployeeOnboardingDashboardService } from './application/employee-onboarding-dashboard.service';
import { TelegramSelfOnboardingHrHandler } from './application/telegram-self-onboarding-hr.handler';
import { EmployeeOnboardingTimelineService } from './application/employee-onboarding-timeline.service';
import { EmployeeOnboardingApprovalService } from './application/employee-onboarding-approval.service';
import { EMPLOYEE_ONBOARDING_APPROVAL } from './application/employee-onboarding-approval.token';
import { OnboardingInviteAccessService } from './application/onboarding-invite-access.service';

@Module({
  imports: [
    forwardRef(() => EmployeeModule),
    forwardRef(() => SecurityModule),
    DocumentStorageModule,
    forwardRef(() => TelegramModule),
    forwardRef(() => RequestModule),
    forwardRef(() => PermissionModule),
    forwardRef(() => PerformanceModule),
    forwardRef(() => PayrollModule),
  ],
  controllers: [EmployeeOnboardingController],
  providers: [
    EmployeeTelegramInviteService,
    EmployeeSelfOnboardingService,
    EmployeeOnboardingDashboardService,
    TelegramSelfOnboardingHandler,
    TelegramSelfOnboardingEmploymentWizard,
    TelegramInviteLinkHandler,
    TelegramSelfOnboardingHrHandler,
    EmployeeOnboardingTimelineService,
    EmployeeOnboardingApprovalService,
    {
      provide: EMPLOYEE_ONBOARDING_APPROVAL,
      useExisting: EmployeeOnboardingApprovalService,
    },
    OnboardingInviteAccessService,
  ],
  exports: [
    EmployeeTelegramInviteService,
    EmployeeSelfOnboardingService,
    EmployeeOnboardingDashboardService,
    TelegramSelfOnboardingHandler,
    TelegramInviteLinkHandler,
    TelegramSelfOnboardingHrHandler,
    EmployeeOnboardingTimelineService,
    EmployeeOnboardingApprovalService,
    EMPLOYEE_ONBOARDING_APPROVAL,
    OnboardingInviteAccessService,
  ],
})
export class EmployeeOnboardingModule {}
