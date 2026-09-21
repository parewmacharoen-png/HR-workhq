// ============================================================================
// modules/commission/commission.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { CommissionController } from './interface/http/commission.controller';
import { MarketingCommissionController } from './interface/http/marketing-commission.controller';
import { AdminCommissionController } from './interface/http/admin-commission.controller';
import { CommissionFinalizationController } from './interface/http/commission-finalization.controller';
import { CommissionAdjustmentController } from './interface/http/commission-adjustment.controller';
import { CommissionDeclarationController } from './interface/http/commission-declaration.controller';
import { CommissionService } from './application/commission.service';
import { MarketingCommissionService } from './application/marketing-commission.service';
import { MarketingCommissionQueryService } from './application/marketing-commission-query.service';
import { AdminCommissionService } from './application/admin-commission.service';
import { AdminCommissionQueryService } from './application/admin-commission-query.service';
import { CommissionFinalizationService } from './application/commission-finalization.service';
import { COMMISSION_FINALIZATION_SERVICE } from './application/commission-finalization.service.token';
import { CommissionAdjustmentService } from './application/commission-adjustment.service';
import { CommissionDeclarationService } from './application/commission-declaration.service';
import {
  COMMISSION_REPOSITORY, BIG_LEADER_LEDGER_REPOSITORY,
} from './domain/repositories/commission.repository';
import { MARKETING_COMMISSION_REPOSITORY } from './domain/repositories/marketing-commission.repository';
import { ADMIN_COMMISSION_REPOSITORY } from './domain/repositories/admin-commission.repository';
import { COMMISSION_FINALIZATION_REPOSITORY } from './domain/repositories/commission-finalization.repository';
import { COMMISSION_ADJUSTMENT_REPOSITORY } from './domain/repositories/commission-adjustment.repository';
import {
  PrismaCommissionRepository, PrismaBigLeaderLedgerRepository,
} from './infrastructure/persistence/commission.prisma.repository';
import { PrismaMarketingCommissionRepository } from './infrastructure/persistence/marketing-commission.prisma.repository';
import { PrismaAdminCommissionRepository } from './infrastructure/persistence/admin-commission.prisma.repository';
import { PrismaCommissionFinalizationRepository } from './infrastructure/persistence/commission-finalization.prisma.repository';
import { PrismaCommissionAdjustmentRepository } from './infrastructure/persistence/commission-adjustment.prisma.repository';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { MarketingModule } from '../marketing/marketing.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { SettingsModule } from '../settings/settings.module';
import { FormulaEngineModule } from '../formula-engine/formula-engine.module';
import { COMMISSION_DECLARATION_SIDE_EFFECTS } from './application/commission-declaration-side-effects.port';
import { CommissionDeclarationTelegramNotifier } from './infrastructure/notifications/commission-declaration-telegram.notifier';
import { EmployeeCommissionViewService } from './application/employee-commission-view.service';
import { EmployeeModule } from '../employee/employee.module';

@Module({
  imports: [
    RecruitmentModule,
    MarketingModule,
    WorkflowModule,
    SettingsModule,
    FormulaEngineModule,
    forwardRef(() => EmployeeModule),
  ],
  controllers: [
    CommissionController,
    MarketingCommissionController,
    AdminCommissionController,
    CommissionFinalizationController,
    CommissionAdjustmentController,
    CommissionDeclarationController,
  ],
  providers: [
    CommissionService,
    MarketingCommissionService,
    MarketingCommissionQueryService,
    AdminCommissionService,
    AdminCommissionQueryService,
    CommissionFinalizationService,
    { provide: COMMISSION_FINALIZATION_SERVICE, useExisting: CommissionFinalizationService },
    CommissionAdjustmentService,
    CommissionDeclarationService,
    CommissionDeclarationTelegramNotifier,
    EmployeeCommissionViewService,
    { provide: COMMISSION_DECLARATION_SIDE_EFFECTS, useExisting: CommissionDeclarationTelegramNotifier },
    { provide: COMMISSION_REPOSITORY,         useClass: PrismaCommissionRepository },
    { provide: BIG_LEADER_LEDGER_REPOSITORY,  useClass: PrismaBigLeaderLedgerRepository },
    { provide: MARKETING_COMMISSION_REPOSITORY, useClass: PrismaMarketingCommissionRepository },
    { provide: ADMIN_COMMISSION_REPOSITORY, useClass: PrismaAdminCommissionRepository },
    { provide: COMMISSION_FINALIZATION_REPOSITORY, useClass: PrismaCommissionFinalizationRepository },
    { provide: COMMISSION_ADJUSTMENT_REPOSITORY, useClass: PrismaCommissionAdjustmentRepository },
  ],
  exports: [
    CommissionService,
    MarketingCommissionService,
    MarketingCommissionQueryService,
    AdminCommissionService,
    AdminCommissionQueryService,
    CommissionFinalizationService,
    CommissionAdjustmentService,
    CommissionDeclarationService,
    EmployeeCommissionViewService,
  ],
})
export class CommissionModule {}
