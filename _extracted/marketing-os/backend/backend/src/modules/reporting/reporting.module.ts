// ============================================================================
// modules/reporting/reporting.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { ReportingController } from './interface/http/reporting.controller';
import { ExecutiveController } from './interface/http/executive.controller';
import { ReportingService } from './application/reporting.service';
import { CommissionExecutiveDashboardService } from './application/commission-executive-dashboard.service';
import { ExecutiveInsightService } from './application/executive-insight.service';
import { ExecutiveDailyBriefService } from './application/executive-daily-brief.service';
import { MarketingModule } from '../marketing/marketing.module';
import {
  SNAPSHOT_REPOSITORY, KPI_REPOSITORY, METRIC_QUERY_REPOSITORY,
} from './domain/repositories/reporting.repository';
import { COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY } from './domain/repositories/commission-executive-dashboard.repository';
import { PrismaSnapshotRepository, PrismaKpiRepository } from './infrastructure/persistence/snapshot.prisma.repository';
import { PrismaMetricQueryRepository } from './infrastructure/persistence/metric-query.prisma.repository';
import { PrismaCommissionExecutiveDashboardRepository } from './infrastructure/persistence/commission-executive-dashboard.prisma.repository';

@Module({
  imports: [MarketingModule],
  controllers: [ReportingController, ExecutiveController],
  providers: [
    ReportingService,
    CommissionExecutiveDashboardService,
    ExecutiveInsightService,
    ExecutiveDailyBriefService,
    { provide: SNAPSHOT_REPOSITORY,      useClass: PrismaSnapshotRepository },
    { provide: KPI_REPOSITORY,           useClass: PrismaKpiRepository },
    { provide: METRIC_QUERY_REPOSITORY,  useClass: PrismaMetricQueryRepository },
    {
      provide: COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY,
      useClass: PrismaCommissionExecutiveDashboardRepository,
    },
  ],
  exports: [
    ReportingService,
    CommissionExecutiveDashboardService,
    ExecutiveInsightService,
    ExecutiveDailyBriefService,
  ],
})
export class ReportingModule {}
