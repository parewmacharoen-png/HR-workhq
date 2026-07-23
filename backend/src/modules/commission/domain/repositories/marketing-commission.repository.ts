// ============================================================================
// modules/commission/domain/repositories/marketing-commission.repository.ts
// ============================================================================

export const MARKETING_COMMISSION_REPOSITORY = Symbol('MARKETING_COMMISSION_REPOSITORY');

export interface MarketingFinancialRow {
  grossProfit: number;
  employeeSalaryExpense: number;
  marketingExpense: number;
  lineExpense: number;
  telesalesExpense: number;
  promotionExpense: number;
}

export interface MarketingTeamContext {
  teamId: string;
  companyId: string;
  bigLeaderEmployeeId: string | null;
  earnCycleId: string;
  payCycleId: string | null;
  cyclePeriodEnd: Date;
}

export interface MarketingTeamMemberRow {
  employeeId: string;
  roleLevel: 'employee' | 'sub_leader' | 'big_leader';
  hireDate: Date;
  achievedCandidates: number;
  rampOverridePercent: number | null;
  includeInTeamPool: boolean;
  kpiExempt: boolean;
  /** From approved commission declaration, when present */
  declarationMethod?: 'team_pool' | 'big_leader_split' | 'none' | 'unsure';
  declarationBigLeaderPercent?: number | null;
  declarationEmployeePercent?: number | null;
}

export interface PendingCarryRow {
  id: string;
  employeeId: string;
  amount: number;
  sourceCycleId: string;
}

export interface PersistMarketingCycleInput {
  context: MarketingTeamContext;
  financial: MarketingFinancialRow;
  calculation: import('../services/marketing-commission-calculation.service').MarketingCommissionCalculationResult;
}

export interface MarketingCycleSummaryRow {
  id: string;
  companyId: string;
  teamId: string;
  earnCycleId: string;
  payCycleId: string | null;
  status: string;
  teamCommissionPool: number;
  bigLeaderCommission: number;
  bigLeaderEmployeeId: string | null;
  netProfit: number;
  finalizedAt: Date | null;
}

export interface MarketingCompanySummary {
  totalTeamPool: number;
  paidAmount: number;
  holdAmount: number;
  carryForwardAmount: number;
  redistributedAmount: number;
  bigLeaderCommission: number;
}

export interface MarketingCommissionRepository {
  findCycle(companyId: string, teamId: string, earnCycleId: string): Promise<{ id: string; status: string } | null>;
  loadTeamContext(companyId: string, teamId: string, earnCycleId: string): Promise<MarketingTeamContext>;
  loadTeamMembers(teamId: string, companyId: string, earnCycleId: string, bigLeaderEmployeeId: string | null): Promise<MarketingTeamMemberRow[]>;
  loadPendingCarries(teamId: string, companyId: string): Promise<PendingCarryRow[]>;
  resolvePayCycleId(companyId: string, earnCycleId: string): Promise<string | null>;
  persistCalculation(input: PersistMarketingCycleInput, actorUserId: string): Promise<string>;
  findCycleById(id: string): Promise<MarketingCycleSummaryRow | null>;
  listMemberResults(cycleId: string): Promise<Array<{
    id: string;
    employeeId: string;
    finalPayout: number;
    status: string;
    payrollItemId: string | null;
  }>>;
  markMemberPaid(memberResultId: string, payrollItemId: string, actorUserId: string): Promise<void>;
  markBigLeaderPaid(cycleId: string, payrollItemId: string, actorUserId: string): Promise<void>;
  finalizeCycle(cycleId: string, actorUserId: string): Promise<void>;
  createPayrollItem(input: {
    payCycleId: string;
    employeeId: string;
    companyId: string;
    amount: number;
    sourceRefId: string;
    note: string;
    actorUserId: string;
  }): Promise<string>;
  findPayrollItemBySource(sourceRefId: string): Promise<string | null>;
  companySummary(companyId: string, earnCycleId?: string): Promise<MarketingCompanySummary>;
  markCarriesRecovered(cycleId: string, employeeIds: string[], recoveredMemberResultIdByEmployee: Map<string, string>, actorUserId: string): Promise<void>;
  markCarriesExpired(cycleId: string, employeeIds: string[], actorUserId: string): Promise<void>;
}
