// ============================================================================
// modules/finance/finance.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { FinanceController } from './interface/http/finance.controller';
import { FinanceService } from './application/finance.service';
import {
  COST_CENTER_REPOSITORY, BUDGET_REPOSITORY, FINANCIAL_TXN_REPOSITORY,
  LEDGER_REPOSITORY, ADVANCE_REQUEST_REPOSITORY, DEPOSIT_REFUND_REPOSITORY,
} from './domain/repositories/finance.repository';
import {
  PrismaCostCenterRepository, PrismaBudgetRepository,
  PrismaFinancialTransactionRepository, PrismaLedgerRepository,
  PrismaAdvanceRequestRepository, PrismaDepositRefundRepository,
} from './infrastructure/persistence/finance.prisma.repository';

@Module({
  imports: [WorkflowModule],
  controllers: [FinanceController],
  providers: [
    FinanceService,
    { provide: COST_CENTER_REPOSITORY,      useClass: PrismaCostCenterRepository },
    { provide: BUDGET_REPOSITORY,           useClass: PrismaBudgetRepository },
    { provide: FINANCIAL_TXN_REPOSITORY,    useClass: PrismaFinancialTransactionRepository },
    { provide: LEDGER_REPOSITORY,           useClass: PrismaLedgerRepository },
    { provide: ADVANCE_REQUEST_REPOSITORY,  useClass: PrismaAdvanceRequestRepository },
    { provide: DEPOSIT_REFUND_REPOSITORY,   useClass: PrismaDepositRefundRepository },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
