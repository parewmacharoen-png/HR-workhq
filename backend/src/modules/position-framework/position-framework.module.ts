// ============================================================================
// modules/position-framework/position-framework.module.ts
// KPI-004
// ============================================================================

import { Module } from '@nestjs/common';
import { PositionFrameworkController } from './interface/http/position-framework.controller';
import { PositionFrameworkAccessService } from './application/position-framework-access.service';
import { PositionFamilyService } from './application/position-family.service';
import { PositionLevelService } from './application/position-level.service';
import { PositionDefinitionService } from './application/position-definition.service';
import { CareerPathService } from './application/career-path.service';
import { PromotionPathService } from './application/promotion-path.service';
import { EmployeePositionService } from './application/employee-position.service';
import { PromotionPathValidationService } from './application/promotion-path-validation.service';

@Module({
  controllers: [PositionFrameworkController],
  providers: [
    PositionFrameworkAccessService,
    PositionFamilyService,
    PositionLevelService,
    PositionDefinitionService,
    CareerPathService,
    PromotionPathService,
    EmployeePositionService,
    PromotionPathValidationService,
  ],
  exports: [
    PositionFamilyService,
    PositionLevelService,
    PositionDefinitionService,
    CareerPathService,
    PromotionPathService,
    EmployeePositionService,
    PromotionPathValidationService,
  ],
})
export class PositionFrameworkModule {}
