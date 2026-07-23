// ============================================================================
// modules/commission/domain/services/commission-adjustment.workflow.ts
// Architecture placeholder — Commission Adjustment Workflow (future sprint).
// Direct edits to finalized commission data are rejected; corrections flow here.
// ============================================================================

export interface CommissionAdjustmentRequest {
  commissionCycleId: string;
  employeeId: string;
  adjustmentAmount: number;
  reason: string;
}

export interface CommissionAdjustmentWorkflow {
  submit(request: CommissionAdjustmentRequest, actorUserId: string): Promise<{ workflowInstanceId: string }>;
}

export const COMMISSION_ADJUSTMENT_WORKFLOW = Symbol('COMMISSION_ADJUSTMENT_WORKFLOW');
