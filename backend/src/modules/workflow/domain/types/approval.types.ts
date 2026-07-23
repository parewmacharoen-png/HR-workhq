// ============================================================================
// modules/workflow/domain/types/approval.types.ts
// HR-15 Approval Authority Matrix types
// ============================================================================

export type WorkflowTypeKey =
  | 'leave_request'
  | 'leave_off_day'
  | 'leave_sick'
  | 'leave_emergency'
  | 'leave_unpaid'
  | 'leave_reschedule'
  | 'leave_shift_swap'
  | 'ot_request'
  | 'monthly_off_request'
  | 'attendance_correction'
  | 'payroll_adjustment'
  | 'salary_adjustment'
  | 'commission_adjustment'
  | 'advance_payment'
  | 'employee_data_change'
  | 'document_request'
  | 'custom_workflow';

export type ApproverStrategyType =
  | 'direct_manager'
  | 'big_leader'
  | 'owner'
  | 'secretary'
  | 'any_owner'
  | 'fixed_user'
  | 'fixed_role'
  | 'workflow_override';

export interface ApprovalContext {
  employeeId: string;
  companyId?: string | null;
  leaveTypeCode?: string;
  requesterRoleLevel?: string | null;
  requesterBusinessRole?: string | null;
}

export interface ResolvedApprover {
  employeeId: string | null;
  userId: string | null;
  name: string;
  strategy: ApproverStrategyType;
  stepOrder: number;
  stepLabel: string;
}

export interface ApprovalChainStep {
  stepOrder: number;
  label: string;
  approverStrategy: ApproverStrategyType;
  fixedUserId?: string | null;
  fixedRoleId?: string | null;
  approvers: ResolvedApprover[];
}

export interface ApprovalPreviewResult {
  workflowType: string;
  approvalMode: 'sequential' | 'parallel';
  minApprovalCount: number;
  approvers: ResolvedApprover[];
  steps: ApprovalChainStep[];
  requiresOwner: boolean;
}

export interface MatrixStepInput {
  stepOrder: number;
  label: string;
  approverStrategy: ApproverStrategyType;
  fixedUserId?: string | null;
  fixedRoleId?: string | null;
}

export const OWNER_REQUIRED_WORKFLOW_TYPES = new Set<WorkflowTypeKey>([
  'salary_adjustment',
  'commission_adjustment',
]);

export const WORKFLOW_TYPE_ENTITY_MAP: Record<WorkflowTypeKey, string> = {
  leave_request: 'leave',
  leave_off_day: 'leave',
  leave_sick: 'leave',
  leave_emergency: 'leave',
  leave_unpaid: 'leave',
  leave_reschedule: 'leave_reschedule',
  leave_shift_swap: 'leave_shift_swap',
  ot_request: 'overtime',
  monthly_off_request: 'monthly_off',
  attendance_correction: 'attendance_correction',
  payroll_adjustment: 'payroll_adjustment',
  salary_adjustment: 'payroll_adjustment',
  commission_adjustment: 'commission_adjustment',
  advance_payment: 'advance',
  employee_data_change: 'performance_review',
  document_request: 'document_request',
  custom_workflow: 'performance_review',
};

export function resolveLeaveWorkflowType(leaveTypeCode: string): WorkflowTypeKey {
  const code = leaveTypeCode.toLowerCase();
  if (code.includes('sick')) return 'leave_sick';
  if (code.includes('emergency')) return 'leave_emergency';
  if (code.includes('unpaid')) return 'leave_unpaid';
  if (code.includes('off') || code === 'annual' || code.includes('personal')) return 'leave_off_day';
  return 'leave_request';
}
