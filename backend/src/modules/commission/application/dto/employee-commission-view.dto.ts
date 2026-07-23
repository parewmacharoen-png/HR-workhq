export type EmployeeCommissionType = 'marketing' | 'admin';

export type EmployeeCommissionUiStatus =
  | 'eligible'
  | 'pending'
  | 'carry_forward'
  | 'paid'
  | 'rejected'
  | 'neutral';

export interface EmployeeCommissionSummaryDto {
  currentCycleLabel: string | null;
  estimatedCommission: number | null;
  lastPaidCommission: number | null;
  currentTeamName: string | null;
  commissionMethod: string | null;
  eligibleStatus: string | null;
  carryForwardStatus: string | null;
  targetProgress: string | null;
  commissionStatus: string | null;
}

export interface EmployeeCommissionAssignmentDto {
  companyId: string;
  companyName: string;
  teamId: string | null;
  teamName: string | null;
  businessRole: string | null;
  commissionMethod: string | null;
  rampPercent: number | null;
  eligibilityPercent: number | null;
  bigLeaderPercent: number | null;
  employeePercent: number | null;
  target: number | null;
  carryForward: number | null;
  engine: EmployeeCommissionType | 'none';
}

export interface EmployeeCommissionHistoryItemDto {
  id: string;
  sourceCycleId: string;
  finalizationCycleId: string | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  companyId: string;
  companyName: string;
  teamId: string | null;
  teamName: string | null;
  commissionType: EmployeeCommissionType;
  method: string;
  target: number | null;
  achieved: number | null;
  commission: number;
  bonus: number;
  carryForward: number;
  status: string;
  uiStatus: EmployeeCommissionUiStatus;
}

export interface EmployeeCommissionViewDto {
  summary: EmployeeCommissionSummaryDto;
  assignment: EmployeeCommissionAssignmentDto | null;
  history: EmployeeCommissionHistoryItemDto[];
}
