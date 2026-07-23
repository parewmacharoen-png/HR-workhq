// ============================================================================
// modules/workforce-risk/workforce-risk.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { WorkdayModule } from '../workday/workday.module';
import { WorkforceRiskService } from './application/workforce-risk.service';
import { WorkforceStaffingRuleService } from './application/workforce-staffing-rule.service';
import { WorkforceRiskController } from './interface/http/workforce-risk.controller';

@Module({
  imports: [forwardRef(() => WorkdayModule)],
  controllers: [WorkforceRiskController],
  providers: [WorkforceRiskService, WorkforceStaffingRuleService],
  exports: [WorkforceRiskService, WorkforceStaffingRuleService],
})
export class WorkforceRiskModule {}
