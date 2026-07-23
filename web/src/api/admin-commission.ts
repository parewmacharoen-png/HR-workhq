import { apiGet, apiPost } from './client';

export interface AdminCommissionMemberResult {
  employeeId: string;
  employeeName?: string;
  globalId?: string;
  finalPayout: number;
  status: string;
  officeType: string;
  penaltyDeduction: number;
  redistributionBonus: number;
}

export interface AdminCommissionCalculateResult {
  cycleId: string;
  netProfit: number;
  adminPool: number;
  poolA: number;
  poolB: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
  memberCount: number;
  status: string;
  members: AdminCommissionMemberResult[];
}

export interface AdminCommissionSummary {
  companyId: string;
  earnCycleId: string | null;
  totalAdminPool: number;
  poolATotal: number;
  poolBTotal: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
}

export function calculateAdminCommission(body: {
  companyId: string;
  earnCycleId: string;
  netProfit: number;
}): Promise<AdminCommissionCalculateResult> {
  return apiPost<AdminCommissionCalculateResult>('/commission/admin/calculate', body);
}

export function finalizeAdminCommission(cycleId: string): Promise<{ cycleId: string; payrollItemsCreated: number }> {
  return apiPost(`/commission/admin/${cycleId}/finalize`, {});
}

export function fetchAdminCommissionSummary(
  companyId: string,
  earnCycleId?: string,
): Promise<AdminCommissionSummary> {
  return apiGet<AdminCommissionSummary>('/commission/admin/summary', {
    companyId,
    ...(earnCycleId ? { earnCycleId } : {}),
  });
}
