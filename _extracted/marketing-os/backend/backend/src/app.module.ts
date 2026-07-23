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
import { AttendanceModule } from './modules/attendance/attendance.module';
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

@Module({
  imports: [
    // Infrastructure & cross-cutting (order preserved)
    AppConfigModule,
    SentryModule.forRoot(),
    RequestContextModule,
    MonitoringModule,
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 120,
    }]),
    PrismaModule,
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
    AttendanceModule,
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
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD,       useClass: ThrottlerGuard },           // 0. rate limit
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
