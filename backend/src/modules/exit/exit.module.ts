// ============================================================================
// modules/exit/exit.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { PayrollModule } from '../payroll/payroll.module';
import { PermissionModule } from '../permission/permission.module';
import { AssetModule } from '../asset/asset.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SettingsModule } from '../settings/settings.module';
import { ExitCaseService } from './application/exit-case.service';
import { ExitChecklistService } from './application/exit-checklist.service';
import { ExitAccessService } from './application/exit-access.service';
import { DepositReadService } from './application/deposit-read.service';
import { EmployeeDepositSettingsService } from './application/employee-deposit-settings.service';
import { DepositLossClaimService } from './application/deposit-loss-claim.service';
import { ExitAssetGateService } from './application/exit-asset-gate.service';
import { FinalSettlementService } from './application/final-settlement.service';
import { FinalSettlementAccessService } from './application/final-settlement-access.service';
import { FinalSettlementCalculatorService } from './domain/services/final-settlement-calculator.service';
import { ExitCaseController, EmployeeExitController } from './interface/http/exit-case.controller';
import { FinalSettlementController } from './interface/http/final-settlement.controller';
import { EXIT_CASE_REPOSITORY } from './domain/repositories/exit-case.repository';
import { PrismaExitCaseRepository } from './infrastructure/persistence/exit-case.prisma.repository';

@Module({
  imports: [
    forwardRef(() => EmployeeModule),
    forwardRef(() => PayrollModule),
    SettingsModule,
    PermissionModule,
    AssetModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [ExitCaseController, EmployeeExitController, FinalSettlementController],
  providers: [
    ExitCaseService,
    ExitChecklistService,
    ExitAccessService,
    DepositReadService,
    EmployeeDepositSettingsService,
    DepositLossClaimService,
    ExitAssetGateService,
    FinalSettlementService,
    FinalSettlementAccessService,
    FinalSettlementCalculatorService,
    { provide: EXIT_CASE_REPOSITORY, useClass: PrismaExitCaseRepository },
  ],
  exports: [ExitCaseService, DepositReadService, FinalSettlementService],
})
export class ExitModule {}
