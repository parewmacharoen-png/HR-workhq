// ============================================================================
// modules/performance/performance.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { EmployeeModule } from '../employee/employee.module';
import { ExitModule } from '../exit/exit.module';
import { TelegramModule } from '../telegram/telegram.module';
import { RequestModule } from '../request/request.module';
import { PerformanceController } from './interface/http/performance.controller';
import { PerformanceService } from './application/performance.service';
import {
  PERFORMANCE_CYCLE_REPOSITORY, EVALUATION_REPOSITORY,
  EVALUATION_SCORE_REPOSITORY, EVALUATION_WEIGHT_REPOSITORY,
  PROBATION_REVIEW_REPOSITORY, FORMULA_VERSION_REPOSITORY,
  EMPLOYEE_CONTEXT_REPOSITORY, EMPLOYEE_STATUS_REPOSITORY,
} from './domain/repositories/performance.repository';
import {
  PrismaPerformanceCycleRepository, PrismaEvaluationRepository,
  PrismaEvaluationScoreRepository, PrismaEvaluationWeightRepository,
  PrismaProbationReviewRepository, PrismaFormulaVersionRepository,
  PrismaEmployeeContextRepository, PrismaEmployeeStatusRepository,
} from './infrastructure/persistence/performance.prisma.repository';

@Module({
  imports: [WorkflowModule, forwardRef(() => EmployeeModule), forwardRef(() => ExitModule), forwardRef(() => TelegramModule), forwardRef(() => RequestModule)],
  controllers: [PerformanceController],
  providers: [
    PerformanceService,
    { provide: PERFORMANCE_CYCLE_REPOSITORY,  useClass: PrismaPerformanceCycleRepository },
    { provide: EVALUATION_REPOSITORY,         useClass: PrismaEvaluationRepository },
    { provide: EVALUATION_SCORE_REPOSITORY,   useClass: PrismaEvaluationScoreRepository },
    { provide: EVALUATION_WEIGHT_REPOSITORY,  useClass: PrismaEvaluationWeightRepository },
    { provide: PROBATION_REVIEW_REPOSITORY,   useClass: PrismaProbationReviewRepository },
    { provide: FORMULA_VERSION_REPOSITORY,    useClass: PrismaFormulaVersionRepository },
    { provide: EMPLOYEE_CONTEXT_REPOSITORY,   useClass: PrismaEmployeeContextRepository },
    { provide: EMPLOYEE_STATUS_REPOSITORY,    useClass: PrismaEmployeeStatusRepository },
  ],
  exports: [PerformanceService],
})
export class PerformanceModule {}
