import { apiPost } from './client';

export interface CreateCommissionAdjustmentInput {
  companyId: string;
  earnCycleId: string;
  type: 'marketing' | 'admin' | 'referral' | 'recruitment';
  teamId?: string;
  employeeId: string;
  sourceResultId?: string;
  reason: string;
  adjustmentAmount: number;
  direction: 'increase' | 'decrease';
}

export function createCommissionAdjustment(body: CreateCommissionAdjustmentInput) {
  return apiPost<{ id: string }>('/commission/adjustments', body);
}
