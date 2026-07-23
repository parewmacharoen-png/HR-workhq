// ============================================================================
// modules/workflow/domain/approval-defaults.ts
// HR-15 default approval matrix configuration.
// ============================================================================

import { MatrixStepInput, WorkflowTypeKey } from './types/approval.types';

export const ANY_OWNER_STEP: MatrixStepInput = {
  stepOrder: 1,
  label: 'Any Owner',
  approverStrategy: 'any_owner',
};

export const SECRETARY_STEP: MatrixStepInput = {
  stepOrder: 1,
  label: 'Secretary',
  approverStrategy: 'secretary',
};

export const DEFAULT_MATRICES: Array<{
  workflowType: WorkflowTypeKey;
  name: string;
  minApprovalCount: number;
  steps: MatrixStepInput[];
}> = [
  {
    workflowType: 'leave_off_day',
    name: 'Off Day Request',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' }],
  },
  {
    workflowType: 'leave_sick',
    name: 'Sick Leave',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }],
  },
  {
    workflowType: 'leave_emergency',
    name: 'Emergency Leave',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }],
  },
  {
    workflowType: 'leave_unpaid',
    name: 'Unpaid Leave',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }],
  },
  {
    workflowType: 'leave_request',
    name: 'Leave Request',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' }],
  },
  {
    workflowType: 'ot_request',
    name: 'OT Request',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Direct Manager', approverStrategy: 'direct_manager' }],
  },
  {
    workflowType: 'monthly_off_request',
    name: 'Monthly Off Request',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }],
  },
  {
    workflowType: 'payroll_adjustment',
    name: 'Payroll Adjustment',
    minApprovalCount: 2,
    steps: [
      { stepOrder: 1, label: 'Secretary', approverStrategy: 'secretary' },
      { stepOrder: 2, label: 'Any Owner', approverStrategy: 'any_owner' },
    ],
  },
  {
    workflowType: 'salary_adjustment',
    name: 'Salary Adjustment',
    minApprovalCount: 2,
    steps: [
      { stepOrder: 1, label: 'Secretary', approverStrategy: 'secretary' },
      { stepOrder: 2, label: 'Any Owner', approverStrategy: 'any_owner' },
    ],
  },
  {
    workflowType: 'commission_adjustment',
    name: 'Commission Adjustment',
    minApprovalCount: 2,
    steps: [
      { stepOrder: 1, label: 'Secretary', approverStrategy: 'secretary' },
      { stepOrder: 2, label: 'Any Owner', approverStrategy: 'any_owner' },
    ],
  },
  {
    workflowType: 'advance_payment',
    name: 'Advance Payment',
    minApprovalCount: 2,
    steps: [
      { stepOrder: 1, label: 'Direct Manager', approverStrategy: 'direct_manager' },
      { stepOrder: 2, label: 'Any Owner', approverStrategy: 'any_owner' },
    ],
  },
  {
    workflowType: 'leave_reschedule',
    name: 'Leave Reschedule',
    minApprovalCount: 2,
    steps: [
      { stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' },
      { stepOrder: 2, label: 'Secretary', approverStrategy: 'secretary' },
    ],
  },
  {
    workflowType: 'leave_shift_swap',
    name: 'Shift Swap',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' }],
  },
  {
    workflowType: 'attendance_correction',
    name: 'Attendance Correction',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' }],
  },
  {
    workflowType: 'employee_data_change',
    name: 'Employee Data Change',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Secretary', approverStrategy: 'secretary' }],
  },
  {
    workflowType: 'document_request',
    name: 'Document Request',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Secretary', approverStrategy: 'secretary' }],
  },
  {
    workflowType: 'custom_workflow',
    name: 'Custom Workflow',
    minApprovalCount: 1,
    steps: [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }],
  },
];

/** Admin hierarchy requester overrides (Owner → Secretary → Admin Manager → Admin). */
export function resolveRequesterRoleOverride(
  requesterBusinessRole?: string | null,
): MatrixStepInput[] | null {
  switch (requesterBusinessRole) {
    case 'admin':
    case 'admin_manager':
      return [SECRETARY_STEP];
    case 'secretary':
      return [ANY_OWNER_STEP];
    default:
      return null;
  }
}
