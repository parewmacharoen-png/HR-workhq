// ============================================================================
// modules/performance-review/performance-review.module.ts
// KPI-003
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { KpiModule } from '../kpi/kpi.module';
import { PerformanceModule } from '../performance/performance.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PerformanceReviewController } from './interface/http/performance-review.controller';
import { PerformanceReviewAccessService } from './application/performance-review-access.service';
import { PerformanceScoreService } from './application/performance-score.service';
import { PerformanceWeightProfileService } from './application/performance-weight-profile.service';
import { PerformanceReviewCycleService } from './application/performance-review-cycle.service';
import { PerformanceReviewService } from './application/performance-review.service';
import { PerformanceDashboardService } from './application/performance-dashboard.service';
import { EmployeePerformanceViewService } from './application/employee-performance-view.service';
import { PerformanceReviewTelegramNotifier } from '../telegram/application/performance-review.notifier';
import { FormulaEngineModule } from '../formula-engine/formula-engine.module';

@Module({
  imports: [
    HierarchyModule,
    forwardRef(() => EmployeeModule),
    forwardRef(() => KpiModule),
    forwardRef(() => PerformanceModule),
    forwardRef(() => TelegramModule),
    FormulaEngineModule,
  ],
  controllers: [PerformanceReviewController],
  providers: [
    PerformanceReviewAccessService,
    PerformanceScoreService,
    PerformanceWeightProfileService,
    PerformanceReviewCycleService,
    PerformanceReviewService,
    PerformanceDashboardService,
    EmployeePerformanceViewService,
    PerformanceReviewTelegramNotifier,
  ],
  exports: [PerformanceReviewService, PerformanceScoreService, EmployeePerformanceViewService],
})
export class PerformanceReviewModule {}
