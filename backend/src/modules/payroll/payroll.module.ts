// ============================================================================
// modules/payroll/payroll.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { EmployeeModule } from '../employee/employee.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PayrollController } from './interface/http/payroll.controller';
import { SharedPayrollController } from './interface/http/shared-payroll.controller';
import { ManualCommissionController } from './interface/http/manual-commission.controller';
import { PayrollExportController } from './interface/http/payroll-export.controller';
import { PayrollOverviewController } from './interface/http/payroll-overview.controller';
import { ManualPayrollItemController } from './interface/http/manual-payroll-item.controller';
import { PayrollPdfController } from './interface/http/payroll-pdf.controller';
import { PayrollService } from './application/payroll.service';
import { PayrollBuilderService } from './application/payroll-builder.service';
import { SharedPayrollService } from './application/shared-payroll.service';
import { ManualCommissionService } from './application/manual-commission.service';
import { UsedOffDaysService } from './application/used-off-days.service';
import { LateDeductionAggregatorService } from './application/late-deduction-aggregator.service';
import { AbsenceDeductionAggregatorService } from './application/absence-deduction-aggregator.service';
import { BreakDeductionAggregatorService } from './application/break-deduction-aggregator.service';
import { ConsecutiveLeavePenaltyAggregatorService } from './application/consecutive-leave-penalty-aggregator.service';
import { ExcessOffDayAggregatorService } from './application/excess-off-day-aggregator.service';
import { ShortNoticeLeaveAggregatorService } from './application/short-notice-leave-aggregator.service';
import { MealEligibleDaysService } from './application/meal-eligible-days.service';
import { PayrollExportService } from './application/payroll-export.service';
import { PayrollExportAccessService } from './application/payroll-export-access.service';
import { PayrollExportValidatorService } from './application/payroll-export-validator.service';
import { PayrollExportSheetGenerator } from './application/payroll-export-sheet.generator';
import { PayrollOverviewService } from './application/payroll-overview.service';
import { PayrollOverviewAccessService } from './application/payroll-overview-access.service';
import { PayrollOverviewAssemblerService } from './application/payroll-overview-assembler.service';
import { ManualPayrollItemService } from './application/manual-payroll-item.service';
import { PayrollPdfService } from './application/payroll-pdf.service';
import {
  PAYROLL_CYCLE_REPOSITORY, PAYROLL_ITEM_REPOSITORY,
  PAYSLIP_REPOSITORY, SALARY_REPOSITORY, DEPOSIT_REPOSITORY,
} from './domain/repositories/payroll.repository';
import {
  PrismaPayrollCycleRepository, PrismaPayrollItemRepository,
  PrismaPayslipRepository, PrismaSalaryRepository, PrismaDepositRepository,
} from './infrastructure/persistence/payroll.prisma.repository';

@Module({
  imports: [SettingsModule, forwardRef(() => EmployeeModule), forwardRef(() => TelegramModule)],
  controllers: [
    PayrollController,
    SharedPayrollController,
    ManualCommissionController,
    PayrollExportController,
    PayrollOverviewController,
    ManualPayrollItemController,
    PayrollPdfController,
  ],
  providers: [
    PayrollService,
    PayrollBuilderService,
    SharedPayrollService,
    ManualCommissionService,
    UsedOffDaysService,
    LateDeductionAggregatorService,
    AbsenceDeductionAggregatorService,
    ExcessOffDayAggregatorService,
    ShortNoticeLeaveAggregatorService,
    BreakDeductionAggregatorService,
    ConsecutiveLeavePenaltyAggregatorService,
    MealEligibleDaysService,
    PayrollExportService,
    PayrollExportAccessService,
    PayrollExportValidatorService,
    PayrollExportSheetGenerator,
    PayrollOverviewService,
    PayrollOverviewAccessService,
    PayrollOverviewAssemblerService,
    ManualPayrollItemService,
    PayrollPdfService,
    { provide: PAYROLL_CYCLE_REPOSITORY, useClass: PrismaPayrollCycleRepository },
    { provide: PAYROLL_ITEM_REPOSITORY,  useClass: PrismaPayrollItemRepository },
    { provide: PAYSLIP_REPOSITORY,       useClass: PrismaPayslipRepository },
    { provide: SALARY_REPOSITORY,        useClass: PrismaSalaryRepository },
    { provide: DEPOSIT_REPOSITORY,       useClass: PrismaDepositRepository },
  ],
  exports: [
    PayrollService,
    PayrollBuilderService,
    SharedPayrollService,
    PayrollPdfService,
    ManualCommissionService,
    LateDeductionAggregatorService,
    AbsenceDeductionAggregatorService,
    DEPOSIT_REPOSITORY,
  ],
})
export class PayrollModule {}
