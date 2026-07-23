// ============================================================================
// Commission declaration domain helpers
// ============================================================================

export const COMMISSION_SPLIT_EXPECTED_TOTAL = 100;

export type DeclarationMethodKey = 'team_pool' | 'big_leader_split' | 'none' | 'unsure';
export type DeclarationAssignmentTypeKey = 'primary' | 'secondary';

export interface DeclarationAssignmentInput {
  companyId: string;
  teamId: string;
  assignmentType: DeclarationAssignmentTypeKey;
  commissionMethod: DeclarationMethodKey;
  bigLeaderPercent?: number | null;
  employeePercent?: number | null;
}

export function isAssignmentComplete(input: {
  commissionMethod: DeclarationMethodKey;
  bigLeaderPercent?: number | null;
  employeePercent?: number | null;
}): boolean {
  if (input.commissionMethod === 'big_leader_split') {
    return input.bigLeaderPercent != null
      && input.employeePercent != null
      && !Number.isNaN(input.bigLeaderPercent)
      && !Number.isNaN(input.employeePercent);
  }
  return !!input.commissionMethod;
}

export function splitPercentMismatch(
  bigLeaderPercent?: number | null,
  employeePercent?: number | null,
  expectedTotal = COMMISSION_SPLIT_EXPECTED_TOTAL,
): boolean {
  if (bigLeaderPercent == null || employeePercent == null) return false;
  return Math.round((bigLeaderPercent + employeePercent) * 100) / 100 !== expectedTotal;
}

export function validateAssignmentInputs(assignments: DeclarationAssignmentInput[]): string | null {
  if (assignments.length === 0) return 'At least one assignment is required';
  const primaryCount = assignments.filter((a) => a.assignmentType === 'primary').length;
  if (primaryCount !== 1) return 'Exactly one PRIMARY assignment is required';
  for (const a of assignments) {
    if (!isAssignmentComplete(a)) return 'Incomplete commission method on one or more assignments';
    if (a.commissionMethod === 'big_leader_split' && splitPercentMismatch(a.bigLeaderPercent, a.employeePercent)) {
      return 'BIG_LEADER_SPLIT percentages must total 100';
    }
  }
  return null;
}
