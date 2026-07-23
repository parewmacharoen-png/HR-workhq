// ============================================================================
// common/outbox/workflow-resolved.handler.ts
// Subscribes to workflow.approved / workflow.rejected / workflow.cancelled
// events and notifies the owning domain service based on entity type.
// Services are optionally injected to avoid hard circular module dependencies.
// ============================================================================

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { OutboxEventHandler } from './outbox-dispatcher.service';
import { LeaveService } from '../../modules/leave/application/leave.service';
import { FinanceService } from '../../modules/finance/application/finance.service';
import { PerformanceService } from '../../modules/performance/application/performance.service';
import { AttendanceService } from '../../modules/attendance/application/attendance.service';
import { MonthlyOffService } from '../../modules/attendance/application/monthly-off.service';
import { PayrollService } from '../../modules/payroll/application/payroll.service';
import { CommissionService } from '../../modules/commission/application/commission.service';
import { DocumentRequestService } from '../../modules/document-request/application/document-request.service';

interface WorkflowResolvedPayload {
  entityType: string;
  entityId: string;
  status: 'approved' | 'rejected' | 'cancelled';
  companyId: string | null;
}

@Injectable()
export class WorkflowResolvedHandler implements OutboxEventHandler, OnModuleInit {
  readonly handles = ['workflow.approved', 'workflow.rejected', 'workflow.cancelled'];
  private readonly logger = new Logger(WorkflowResolvedHandler.name);

  constructor(
    @Optional() private readonly leaveService?: LeaveService,
    @Optional() private readonly financeService?: FinanceService,
    @Optional() private readonly performanceService?: PerformanceService,
    @Optional() private readonly attendanceService?: AttendanceService,
    @Optional() private readonly monthlyOffService?: MonthlyOffService,
    @Optional() private readonly payrollService?: PayrollService,
    @Optional() private readonly commissionService?: CommissionService,
    @Optional() private readonly documentRequestService?: DocumentRequestService,
  ) {}

  onModuleInit(): void {
    const missing: string[] = [];
    if (!this.leaveService) missing.push('LeaveService');
    if (!this.financeService) missing.push('FinanceService');
    if (!this.performanceService) missing.push('PerformanceService');
    if (!this.attendanceService) missing.push('AttendanceService');
    if (!this.monthlyOffService) missing.push('MonthlyOffService');
    if (!this.payrollService) missing.push('PayrollService');
    if (!this.commissionService) missing.push('CommissionService');
    if (!this.documentRequestService) missing.push('DocumentRequestService');
    if (missing.length > 0) {
      this.logger.error(
        `Workflow outbox missing domain handlers: ${missing.join(', ')} — legacy approvals may not update data`,
      );
    }
  }

  async handle(_eventType: string, rawPayload: unknown): Promise<void> {
    const payload = rawPayload as WorkflowResolvedPayload;
    const status = payload.status;

    switch (payload.entityType) {
      case 'leave':
        if (this.leaveService) {
          await this.leaveService.onWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'leave_reschedule':
        if (this.leaveService) {
          await this.leaveService.onRescheduleWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'leave_shift_swap':
        if (this.leaveService) {
          await this.leaveService.onShiftSwapWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'advance':
        if (this.financeService) {
          await this.financeService.onAdvanceWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'deposit_refund':
        if (this.financeService) {
          await this.financeService.onDepositRefundWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'payroll_adjustment':
        // Finance revenue/expense transactions reuse this workflow type.
        if (this.financeService) {
          await this.financeService.onTransactionWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'performance_review':
        if (this.performanceService) {
          await this.performanceService.onWorkflowResolved(payload.entityId, status);
        }
        break;

      case 'overtime':
        if (this.attendanceService) {
          await this.attendanceService.onOvertimeWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn('overtime workflow resolved but AttendanceService not injected');
        }
        break;

      case 'monthly_off':
        if (this.monthlyOffService) {
          await this.monthlyOffService.onWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn('monthly_off workflow resolved but MonthlyOffService not injected');
        }
        break;

      // ── Previously unhandled entity types ──────────────────────────────────

      case 'attendance_correction':
        if (this.attendanceService) {
          await this.attendanceService.onCorrectionWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn(`attendance_correction workflow resolved but AttendanceService not injected`);
        }
        break;

      case 'bonus':
        if (this.payrollService) {
          await this.payrollService.onBonusWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn(`bonus workflow resolved but PayrollService not injected`);
        }
        break;

      case 'commission_adjustment':
        if (this.commissionService) {
          await this.commissionService.onCommissionAdjustmentWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn(`commission_adjustment workflow resolved but CommissionService not injected`);
        }
        break;

      case 'document_request':
        if (this.documentRequestService) {
          await this.documentRequestService.onWorkflowResolved(payload.entityId, status);
        } else {
          this.logger.warn(`document_request workflow resolved but DocumentRequestService not injected`);
        }
        break;

      default:
        this.logger.warn(`Unhandled workflow resolution entityType: ${payload.entityType}`);
    }
  }
}
