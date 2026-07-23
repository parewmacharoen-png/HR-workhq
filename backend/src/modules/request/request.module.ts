import { Module, forwardRef } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { EmployeeModule } from '../employee/employee.module';
import { ReferralModule } from '../referral/referral.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CalendarModule } from '../calendar/calendar.module';
import { FormulaEngineModule } from '../formula-engine/formula-engine.module';
import { SecurityModule } from '../security/security.module';
import { EmployeeOnboardingModule } from '../employee-onboarding/employee-onboarding.module';
import { SettingsModule } from '../settings/settings.module';
import { LeaveModule } from '../leave/leave.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { DocumentRequestModule } from '../document-request/document-request.module';
import { RequestController } from './interface/http/request.controller';
import { WorkflowBuilderController } from './interface/http/workflow-builder.controller';
import { ApprovalFlowBuilderController } from './interface/http/approval-flow-builder.controller';
import { RequestAccessService } from './application/request-access.service';
import { RequestTypeService } from './application/request-type.service';
import { RequestFormFieldService } from './application/request-form-field.service';
import { RequestApprovalFlowService } from './application/request-approval-flow.service';
import { RequestInstanceService } from './application/request-instance.service';
import { RequestApprovalService } from './application/request-approval.service';
import { RequestIntegrationService } from './application/request-integration.service';
import { RequestDashboardService } from './application/request-dashboard.service';
import { RequestApproverResolverService } from './application/request-approver-resolver.service';
import { WorkflowBuilderService } from './application/workflow-builder.service';
import { ApprovalFlowBuilderService } from './application/approval-flow-builder.service';
import {
  EmployeeReferralService, ReferralProgramService,
} from './application/employee-referral.service';
import { RequestTelegramNotifier } from '../telegram/application/request.notifier';
import { EmployeeReferralTelegramNotifier } from '../telegram/application/employee-referral.notifier';
import { RequestPlatformTelegramHandler } from '../telegram/application/request-platform.handler';
import { EmployeeReferralTelegramHandler } from '../telegram/application/employee-referral.handler';
import { TelegramFormUxService } from '../telegram/application/telegram-form-ux.service';
import { FormUxAuditService } from '../telegram/application/form-ux-audit.service';
import { TelegramRegistrationRequestBridgeService } from './application/telegram-registration-request-bridge.service';
import { TELEGRAM_REGISTRATION_REQUEST_BRIDGE } from './application/telegram-registration-request-bridge.token';
import { RequestDraftExpiryService } from './application/request-draft-expiry.service';
import { RequestDraftExpiryScheduler } from './application/request-draft-expiry.scheduler';
import { RequestAttendanceGuardService } from './application/request-attendance-guard.service';

@Module({
  imports: [
    HierarchyModule,
    forwardRef(() => LeaveModule),
    ReferralModule,
    SettingsModule,
    forwardRef(() => CalendarModule),
    FormulaEngineModule,
    forwardRef(() => EmployeeModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => SecurityModule),
    forwardRef(() => EmployeeOnboardingModule),
    forwardRef(() => AttendanceModule),
    DocumentRequestModule,
  ],
  controllers: [RequestController, WorkflowBuilderController, ApprovalFlowBuilderController],
  providers: [
    RequestAccessService,
    RequestTypeService,
    RequestFormFieldService,
    RequestApprovalFlowService,
    RequestInstanceService,
    RequestApprovalService,
    RequestIntegrationService,
    RequestDashboardService,
    RequestApproverResolverService,
    WorkflowBuilderService,
    ApprovalFlowBuilderService,
    EmployeeReferralService,
    ReferralProgramService,
    RequestTelegramNotifier,
    EmployeeReferralTelegramNotifier,
    RequestPlatformTelegramHandler,
    EmployeeReferralTelegramHandler,
    TelegramFormUxService,
    FormUxAuditService,
    TelegramRegistrationRequestBridgeService,
    {
      provide: TELEGRAM_REGISTRATION_REQUEST_BRIDGE,
      useExisting: TelegramRegistrationRequestBridgeService,
    },
    RequestDraftExpiryService,
    RequestDraftExpiryScheduler,
    RequestAttendanceGuardService,
  ],
  exports: [
    RequestTypeService,
    RequestInstanceService,
    RequestApprovalService,
    RequestIntegrationService,
    EmployeeReferralService,
    RequestPlatformTelegramHandler,
    EmployeeReferralTelegramHandler,
    WorkflowBuilderService,
    ApprovalFlowBuilderService,
    TelegramRegistrationRequestBridgeService,
    TELEGRAM_REGISTRATION_REQUEST_BRIDGE,
  ],
})
export class RequestModule {}
