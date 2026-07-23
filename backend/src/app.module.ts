// ============================================================================
// app.module.ts  — final wiring including all feature modules
// ============================================================================

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';

import { AppConfigModule } from './config/config.module';
import { RequestContextModule } from './common/context/request-context.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MonitoringModule } from './common/monitoring/monitoring.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { HealthController } from './common/health.controller';

import { TimeModule } from './shared/time/time.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuditModule } from './shared/audit/audit.module';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './auth/guards/must-change-password.guard';

import { PermissionModule } from './modules/permission/permission.module';
import { PermissionGuard } from './modules/permission/interface/http/permission.guard';

// Feature modules (order matters only for cross-module imports; NestJS resolves DI)
import { WorkflowModule } from './modules/workflow/workflow.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { EmployeeOnboardingModule } from './modules/employee-onboarding/employee-onboarding.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { WorkdayModule } from './modules/workday/workday.module';
import { WorkforceRiskModule } from './modules/workforce-risk/workforce-risk.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { CommissionModule } from './modules/commission/commission.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { ReferralModule } from './modules/referral/referral.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AiModule } from './modules/ai/ai.module';
import { AssetModule } from './modules/asset/asset.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SecurityModule } from './modules/security/security.module';
import { HierarchyModule } from './modules/hierarchy/hierarchy.module';
import { ExitModule } from './modules/exit/exit.module';
import { DisciplinaryModule } from './modules/disciplinary/disciplinary.module';
import { SalaryReviewModule } from './modules/salary-review/salary-review.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { PerformanceReviewModule } from './modules/performance-review/performance-review.module';
import { PositionFrameworkModule } from './modules/position-framework/position-framework.module';
import { RequestModule } from './modules/request/request.module';
import { DocumentRequestModule } from './modules/document-request/document-request.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { DocumentCenterModule } from './modules/document-center/document-center.module';
import { AnnouncementModule } from './modules/announcement/announcement.module';
import { FormulaEngineModule } from './modules/formula-engine/formula-engine.module';
import { CompetencyModule } from './modules/competency/competency.module';
import { SuccessionModule } from './modules/succession/succession.module';
import { TrainingModule } from './modules/training/training.module';
import { HrAnalyticsModule } from './modules/hr-analytics/hr-analytics.module';
import { OpsModule } from './modules/ops/ops.module';
import { QaModule } from './modules/qa/qa.module';
import { DataExchangeModule } from './modules/data-exchange/data-exchange.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    // Infrastructure & cross-cutting (order preserved)
    AppConfigModule,
    SentryModule.forRoot(),
    RequestContextModule,
    MonitoringModule,
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: process.env.NODE_ENV === 'production' ? 120 : 600,
    }]),
    PrismaModule,
    TimeModule,
    AuditModule,
    OutboxModule,

    // Auth
    AuthModule,
    PermissionModule,

    // Shared kernel consumed by features
    WorkflowModule,

    // Feature modules
    OrganizationModule,
    EmployeeModule,
    EmployeeOnboardingModule,
    AttendanceModule,
    WorkdayModule,
    WorkforceRiskModule,
    LeaveModule,
    PayrollModule,
    CommissionModule,
    FinanceModule,
    ReportingModule,
    PerformanceModule,
    RecruitmentModule,
    ReferralModule,
    MarketingModule,
    AssetModule,
    KnowledgeModule,
    AiModule,
    TelegramModule,
    SettingsModule,
    SecurityModule,
    HierarchyModule,
    ExitModule,
    DisciplinaryModule,
    SalaryReviewModule,
    KpiModule,
    PerformanceReviewModule,
    PositionFrameworkModule,
    RequestModule,
    DocumentRequestModule,
    CalendarModule,
    DocumentCenterModule,
    AnnouncementModule,
    FormulaEngineModule,
    CompetencyModule,
    SuccessionModule,
    TrainingModule,
    HrAnalyticsModule,
    OpsModule,
    QaModule,
    DataExchangeModule,
    SystemModule,
  ],
  controllers: [HealthController],
  providers: [
    ...(process.env.NODE_ENV === 'production'
      ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
      : []),
    { provide: APP_GUARD,       useClass: JwtAuthGuard },             // 1. authenticate
    { provide: APP_GUARD,       useClass: MustChangePasswordGuard },  // 2. temp password gate
    { provide: APP_GUARD,       useClass: PermissionGuard },          // 3. authorize
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER,      useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
