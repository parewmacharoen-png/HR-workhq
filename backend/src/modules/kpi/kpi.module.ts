// ============================================================================
// modules/kpi/kpi.module.ts
// KPI-001 / KPI-002
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { TelegramModule } from '../telegram/telegram.module';
import { KpiController } from './interface/http/kpi.controller';
import { KpiAccessService } from './application/kpi-access.service';
import { KpiScoringService } from './application/kpi-scoring.service';
import { KpiDataSourceService } from './application/kpi-data-source.service';
import { KpiTemplateBuilderService } from './application/kpi-template-builder.service';
import { KpiTemplateService } from './application/kpi-template.service';
import { KpiCycleService } from './application/kpi-cycle.service';
import { KpiAssignmentService } from './application/kpi-assignment.service';
import { KpiDashboardService } from './application/kpi-dashboard.service';
import { KpiPositionRuleService } from './application/kpi-position-rule.service';
import { KpiTelegramNotifier } from '../telegram/application/kpi.notifier';

@Module({
  imports: [
    HierarchyModule,
    forwardRef(() => EmployeeModule),
    forwardRef(() => TelegramModule),
  ],
  controllers: [KpiController],
  providers: [
    KpiAccessService,
    KpiScoringService,
    KpiDataSourceService,
    KpiTemplateBuilderService,
    KpiTemplateService,
    KpiCycleService,
    KpiAssignmentService,
    KpiDashboardService,
    KpiPositionRuleService,
    KpiTelegramNotifier,
  ],
  exports: [
    KpiAssignmentService,
    KpiScoringService,
    KpiDataSourceService,
    KpiTemplateService,
    KpiPositionRuleService,
  ],
})
export class KpiModule {}
