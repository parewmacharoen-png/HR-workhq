// ============================================================================
// modules/telegram/telegram.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { EmployeeModule } from '../employee/employee.module';
import { DisciplinaryModule } from '../disciplinary/disciplinary.module';
import { RequestModule } from '../request/request.module';
import { DocumentCenterModule } from '../document-center/document-center.module';
import { AnnouncementModule } from '../announcement/announcement.module';
import { EmployeeOnboardingModule } from '../employee-onboarding/employee-onboarding.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkdayModule } from '../workday/workday.module';
import { WorkforceRiskModule } from '../workforce-risk/workforce-risk.module';
import { LeaveModule } from '../leave/leave.module';
import { ReportingModule } from '../reporting/reporting.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CommissionModule } from '../commission/commission.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { ExitModule } from '../exit/exit.module';
import { CalendarModule } from '../calendar/calendar.module';
import { TrainingModule } from '../training/training.module';
import { HrAnalyticsModule } from '../hr-analytics/hr-analytics.module';
import { CompetencyModule } from '../competency/competency.module';
import { SuccessionModule } from '../succession/succession.module';
import { TelegramController } from './interface/telegram.controller';
import { TelegramBotService } from './application/telegram-bot.service';
import { BriefService } from './application/brief.service';
import { PerformanceModule } from '../performance/performance.module';
import { SalaryReviewModule } from '../salary-review/salary-review.module';
import { EmployeeRecognitionNotifier } from './application/employee-recognition.notifier';
import { EmployeeRecognitionScheduler } from './application/employee-recognition.scheduler';
import { ProbationReviewTelegramNotifier } from './application/probation-review.notifier';
import { ProbationReviewScheduler } from './application/probation-review.scheduler';
import { ExitCaseTelegramNotifier } from './application/exit-case.notifier';
import { ExitCaseScheduler } from './application/exit-case.scheduler';
import { FinalSettlementTelegramNotifier } from './application/final-settlement.notifier';
import { PayrollExportTelegramNotifier } from './application/payroll-export.notifier';
import { CompanyCodeCacheService } from './application/company-code-cache.service';
import { TelegramMessageLogService } from './application/telegram-message-log.service';
import { TelegramOnboardingService } from './application/telegram-onboarding.service';
import { TelegramDeclarationCorrectionService } from './application/telegram-declaration-correction.service';
import { TelegramVerificationService } from './application/telegram-verification.service';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';
import { ApprovalRequestContextService } from './application/approval-request-context.service';
import { TelegramApprovalNotifier } from './application/telegram-approval.notifier';
import { UnifiedApprovalInboxService } from './application/unified-approval-inbox.service';
import { UnifiedApprovalInboxHandler } from './application/unified-approval-inbox.handler';
import { TrainingTelegramHandler } from '../training/application/training.handler';
import { HrSummaryTelegramHandler } from '../hr-analytics/application/hr-summary.handler';
import { Phase2TelegramHandler } from './application/phase2-telegram.handler';
import { AiMorningBriefDeliveryScheduler } from './application/ai-morning-brief-delivery.scheduler';
import { SelfOnboardingTelegramNotifier } from './application/self-onboarding.notifier';
import { LeaveTeamTelegramNotifier } from './application/leave-team.notifier';
import { TelegramOperatorLinkHandler } from './application/telegram-operator-link.handler';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  imports: [
    AuthModule,
    SecurityModule,
    HierarchyModule,
    forwardRef(() => AttendanceModule),
    forwardRef(() => WorkdayModule),
    forwardRef(() => WorkforceRiskModule),
    forwardRef(() => EmployeeModule),
    forwardRef(() => EmployeeOnboardingModule),
    forwardRef(() => PerformanceModule),
    forwardRef(() => LeaveModule),
    forwardRef(() => ReportingModule),
    forwardRef(() => WorkflowModule),
    forwardRef(() => MarketingModule),
    forwardRef(() => CommissionModule),
    forwardRef(() => AiModule),
    forwardRef(() => DisciplinaryModule),
    forwardRef(() => SalaryReviewModule),
    forwardRef(() => RequestModule),
    forwardRef(() => DocumentCenterModule),
    forwardRef(() => AnnouncementModule),
    forwardRef(() => CalendarModule),
    forwardRef(() => ExitModule),
    forwardRef(() => TrainingModule),
    forwardRef(() => HrAnalyticsModule),
    forwardRef(() => CompetencyModule),
    forwardRef(() => SuccessionModule),
    forwardRef(() => PayrollModule),
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    BriefService,
    EmployeeRecognitionNotifier,
    EmployeeRecognitionScheduler,
    ProbationReviewTelegramNotifier,
    ProbationReviewScheduler,
    ExitCaseTelegramNotifier,
    ExitCaseScheduler,
    FinalSettlementTelegramNotifier,
    PayrollExportTelegramNotifier,
    CompanyCodeCacheService,
    TelegramMessageLogService,
    TelegramOnboardingService,
    TelegramVerificationService,
    TelegramDeclarationCorrectionService,
    TelegramGatewayService,
    ApprovalRequestContextService,
    TelegramApprovalNotifier,
    UnifiedApprovalInboxService,
    UnifiedApprovalInboxHandler,
    TrainingTelegramHandler,
    HrSummaryTelegramHandler,
    Phase2TelegramHandler,
    AiMorningBriefDeliveryScheduler,
    SelfOnboardingTelegramNotifier,
    LeaveTeamTelegramNotifier,
    TelegramOperatorLinkHandler,
  ],
  exports: [TelegramGatewayService, TelegramBotService, EmployeeRecognitionNotifier, ProbationReviewTelegramNotifier, ExitCaseTelegramNotifier, FinalSettlementTelegramNotifier, PayrollExportTelegramNotifier, TelegramApprovalNotifier, ApprovalRequestContextService, UnifiedApprovalInboxHandler, SelfOnboardingTelegramNotifier, LeaveTeamTelegramNotifier, TelegramOperatorLinkHandler],
})
export class TelegramModule {}
