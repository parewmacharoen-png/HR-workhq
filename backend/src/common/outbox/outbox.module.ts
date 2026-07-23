// ============================================================================
// common/outbox/outbox.module.ts
// ============================================================================

import { Global, Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { WorkflowResolvedHandler } from './workflow-resolved.handler';
import { AttendanceModule } from '../../modules/attendance/attendance.module';
import { PayrollModule } from '../../modules/payroll/payroll.module';
import { CommissionModule } from '../../modules/commission/commission.module';
import { DocumentRequestModule } from '../../modules/document-request/document-request.module';
import { LeaveModule } from '../../modules/leave/leave.module';
import { FinanceModule } from '../../modules/finance/finance.module';
import { PerformanceModule } from '../../modules/performance/performance.module';

@Global()
@Module({
  imports: [
    forwardRef(() => AttendanceModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => LeaveModule),
    FinanceModule,
    forwardRef(() => PerformanceModule),
    CommissionModule,
    DocumentRequestModule,
  ],
  providers: [OutboxDispatcherService, WorkflowResolvedHandler],
  exports: [OutboxDispatcherService],
})
export class OutboxModule implements OnModuleInit {
  constructor(
    private readonly dispatcher: OutboxDispatcherService,
    private readonly workflowHandler: WorkflowResolvedHandler,
  ) {}

  onModuleInit(): void {
    this.dispatcher.registerHandler(this.workflowHandler);
  }
}
