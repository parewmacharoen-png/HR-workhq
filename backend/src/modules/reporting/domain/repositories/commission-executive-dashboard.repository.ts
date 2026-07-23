// ============================================================================
// Commission Executive Dashboard repository port
// ============================================================================

import { RawCompanyCommissionMetrics } from '../entities/commission-executive-dashboard.types';

export const COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY = Symbol('COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY');

export interface CommissionExecutiveDashboardRepository {
  listActiveCompanies(): Promise<Array<{ id: string; name: string }>>;
  listGrantedCompanyIds(userId: string): Promise<string[]>;
  fetchCompanyMetrics(
    companyId: string,
    companyName: string,
    from: Date,
    to: Date,
    earnCycleId?: string,
  ): Promise<RawCompanyCommissionMetrics>;
}
