// ============================================================================
// modules/ai/domain/self-service-tools.ts
// Employee self-service AI tools — always scoped to the authenticated user.
// ============================================================================

import { AiToolName } from './tool.types';

export const SELF_SERVICE_TOOL_NAMES: ReadonlySet<AiToolName> = new Set([
  'get_my_profile',
  'get_my_leave_balance',
  'get_my_leave_history',
  'get_my_attendance_summary',
  'get_my_late_statistics',
  'get_my_ot_summary',
  'get_my_latest_payslip',
  'get_my_payroll_summary',
  'get_my_commission',
  'get_my_commission_history',
  'get_my_referrals',
  'get_my_marketing_kpi',
  'get_my_latest_marketing_report',
  'get_my_marketing_expenses',
]);

export function isSelfServiceTool(toolName: string): toolName is AiToolName {
  return SELF_SERVICE_TOOL_NAMES.has(toolName as AiToolName);
}

/** Strip prompt-supplied identity overrides; self tools always use auth context. */
export function sanitizeSelfServiceInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const { employeeId: _employeeId, userId: _userId, ...rest } = input;
  return rest;
}

export function rejectCrossEmployeeOverride(
  input: Record<string, unknown>,
  authenticatedEmployeeId: string | null,
): string | null {
  if (typeof input.employeeId !== 'string') return null;
  if (!authenticatedEmployeeId) {
    return 'No employee profile linked to this user';
  }
  if (input.employeeId !== authenticatedEmployeeId) {
    return 'Self-service tools cannot query another employee';
  }
  return null;
}
