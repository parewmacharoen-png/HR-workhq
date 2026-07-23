import { apiGet } from './client';

export type EmployeeCommissionType = 'marketing' | 'admin';

export type EmployeeCommissionUiStatus =
  | 'eligible'
  | 'pending'
  | 'carry_forward'
  | 'paid'
  | 'rejected'
  | 'neutral';

export interface EmployeeCommissionSummary {
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

export interface EmployeeCommissionAssignment {
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

export interface EmployeeCommissionHistoryItem {
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

export interface EmployeeCommissionResponse {
  summary: EmployeeCommissionSummary;
  assignment: EmployeeCommissionAssignment | null;
  history: EmployeeCommissionHistoryItem[];
}

export function fetchEmployeeCommission(employeeId: string, companyId: string) {
  return apiGet<EmployeeCommissionResponse>(
    `/employees/${employeeId}/commission?companyId=${encodeURIComponent(companyId)}`,
  );
}
