// ============================================================================
// modules/salary-review/salary-review.module.ts
// SAL-001
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PositionFrameworkModule } from '../position-framework/position-framework.module';
import { CompensationReviewController } from './interface/http/compensation-review.controller';
import { SalaryReviewService } from './application/salary-review.service';
import { PromotionReviewService } from './application/promotion-review.service';
import { CompensationReviewAccessService } from './application/compensation-review-access.service';
import { CompensationApplyService } from './application/compensation-apply.service';
import { CompensationDashboardService } from './application/compensation-dashboard.service';
import { CompensationListService } from './application/compensation-list.service';
import { CompensationReviewTelegramNotifier } from '../telegram/application/compensation-review.notifier';
import { CompensationReviewScheduler } from '../telegram/application/compensation-review.scheduler';

@Module({
  imports: [
    forwardRef(() => EmployeeModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => PayrollModule),
    PositionFrameworkModule,
  ],
  controllers: [CompensationReviewController],
  providers: [
    SalaryReviewService,
    PromotionReviewService,
    CompensationReviewAccessService,
    CompensationApplyService,
    CompensationDashboardService,
    CompensationListService,
    CompensationReviewTelegramNotifier,
    CompensationReviewScheduler,
  ],
  exports: [SalaryReviewService, PromotionReviewService, CompensationApplyService],
})
export class SalaryReviewModule {}
