// ============================================================================
// modules/marketing/marketing.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { MarketingDailyReportController } from './interface/http/marketing-daily-report.controller';
import { MarketingKpiController } from './interface/http/marketing-kpi.controller';
import { MarketingReportsController } from './interface/http/marketing-reports.controller';
import { MarketingAuditController } from './interface/http/marketing-audit.controller';
import { MarketingCycleController } from './interface/http/marketing-cycle.controller';
import { MarketingExpenseController } from './interface/http/marketing-expense.controller';
import { MarketingTeamController } from './interface/http/marketing-team.controller';
import { MarketingInsightController } from './interface/http/marketing-insight.controller';
import { MarketingDailyReportService } from './application/marketing-daily-report.service';
import { MarketingKpiQueryService } from './application/marketing-kpi-query.service';
import { MarketingBackOfficeService } from './application/marketing-backoffice.service';
import { MarketingReportAuditService } from './application/marketing-report-audit.service';
import { MarketingCycleLockService } from './application/marketing-cycle-lock.service';
import { MarketingAccessService } from './application/marketing-access.service';
import { MarketingExpenseService } from './application/marketing-expense.service';
import { MarketingTeamService } from './application/marketing-team.service';
import { MarketingInsightService } from './application/marketing-insight.service';
import { MARKETING_DAILY_REPORT_REPOSITORY } from './domain/repositories/marketing-daily-report.repository';
import { MARKETING_REPORT_AUDIT_REPOSITORY } from './domain/repositories/marketing-report-audit.repository';
import { MARKETING_CYCLE_LOCK_REPOSITORY } from './domain/repositories/marketing-cycle-lock.repository';
import { MARKETING_EXPENSE_REPOSITORY } from './domain/repositories/marketing-expense.repository';
import { MARKETING_TEAM_REPOSITORY } from './domain/repositories/marketing-team.repository';
import { PrismaMarketingDailyReportRepository } from './infrastructure/persistence/marketing-daily-report.prisma.repository';
import { PrismaMarketingReportAuditRepository } from './infrastructure/persistence/marketing-report-audit.prisma.repository';
import { PrismaMarketingCycleLockRepository } from './infrastructure/persistence/marketing-cycle-lock.prisma.repository';
import { PrismaMarketingExpenseRepository } from './infrastructure/persistence/marketing-expense.prisma.repository';
import { PrismaMarketingTeamRepository } from './infrastructure/persistence/marketing-team.prisma.repository';

@Module({
  controllers: [
    MarketingDailyReportController,
    MarketingKpiController,
    MarketingReportsController,
    MarketingAuditController,
    MarketingCycleController,
    MarketingExpenseController,
    MarketingTeamController,
    MarketingInsightController,
  ],
  providers: [
    MarketingDailyReportService,
    MarketingKpiQueryService,
    MarketingBackOfficeService,
    MarketingReportAuditService,
    MarketingCycleLockService,
    MarketingCycleLockService,
    MarketingAccessService,
    MarketingExpenseService,
    MarketingTeamService,
    MarketingInsightService,
    {
      provide: MARKETING_DAILY_REPORT_REPOSITORY,
      useClass: PrismaMarketingDailyReportRepository,
    },
    {
      provide: MARKETING_REPORT_AUDIT_REPOSITORY,
      useClass: PrismaMarketingReportAuditRepository,
    },
    {
      provide: MARKETING_CYCLE_LOCK_REPOSITORY,
      useClass: PrismaMarketingCycleLockRepository,
    },
    {
      provide: MARKETING_EXPENSE_REPOSITORY,
      useClass: PrismaMarketingExpenseRepository,
    },
    {
      provide: MARKETING_TEAM_REPOSITORY,
      useClass: PrismaMarketingTeamRepository,
    },
  ],
  exports: [
    MarketingDailyReportService,
    MarketingKpiQueryService,
    MarketingBackOfficeService,
    MarketingExpenseService,
    MarketingTeamService,
    MarketingInsightService,
    MarketingCycleLockService,
    MARKETING_DAILY_REPORT_REPOSITORY,
    MARKETING_EXPENSE_REPOSITORY,
    MARKETING_TEAM_REPOSITORY,
  ],
})
export class MarketingModule {}
