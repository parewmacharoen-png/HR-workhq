// ============================================================================
// modules/marketing/application/dto/marketing-kpi.dto.ts
// ============================================================================

import type { MarketingKpiRiskLevel } from '../../domain/services/marketing-kpi-aggregation.service';

export interface EmployeeMarketingKpiResponse {
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  targetCount: number;
  remainingCount: number;
  qualified: boolean;
  kpiExempt: boolean;
  conversionRatePercent: number;
  riskLevel: MarketingKpiRiskLevel;
  carryForwardAmount: number;
  estimatedCommission: number;
  earnCycleId: string | null;
  cycleLabel: string | null;
}

export interface TeamMemberMarketingKpiResponse {
  employeeId: string;
  employeeName: string;
  startedWorkCount: number;
  targetCount: number;
  qualified: boolean;
  kpiExempt: boolean;
  riskLevel: MarketingKpiRiskLevel;
}

export interface TeamMarketingKpiResponse {
  earnCycleId: string | null;
  cycleLabel: string | null;
  members: TeamMemberMarketingKpiResponse[];
  qualifiedCount: number;
  atRiskCount: number;
  highRiskCount: number;
}

export interface CompanyMarketingKpiResponse {
  companyId: string;
  earnCycleId: string | null;
  cycleLabel: string | null;
  totalEmployees: number;
  passedKpi: number;
  failedKpi: number;
  successRatePercent: number;
  totals: {
    contactedCount: number;
    newMemberCount: number;
    depositAmount: number;
    startedWorkCount: number;
  };
  teamBreakdown: Array<{
    teamId: string;
    teamCode: string;
    teamName: string;
    totalEmployees: number;
    passedKpi: number;
    failedKpi: number;
  }>;
}
