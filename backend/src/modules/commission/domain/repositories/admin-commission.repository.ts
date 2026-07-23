// ============================================================================
// modules/commission/domain/repositories/admin-commission.repository.ts
// ============================================================================

import {
  AdminMemberInput,
  AdminOfficeType,
  AdminShiftType,
} from '../services/admin-commission-calculation.service';

export const ADMIN_COMMISSION_REPOSITORY = Symbol('ADMIN_COMMISSION_REPOSITORY');

export interface AdminCycleContext {
  companyId: string;
  earnCycleId: string;
  payCycleId: string | null;
  cyclePeriodStart: Date;
  cyclePeriodEnd: Date;
  cyclePayDate: Date;
  cycleDays: number;
}

export interface PersistAdminCycleInput {
  context: AdminCycleContext;
  netProfit: number;
  calculation: import('../services/admin-commission-calculation.service').AdminCommissionCalculationResult;
}

export interface AdminCycleSummaryRow {
  id: string;
  companyId: string;
  earnCycleId: string;
  payCycleId: string | null;
  status: string;
  netProfit: number;
  adminPool: number;
  poolA: number;
  poolB: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
  finalizedAt: Date | null;
}

export interface AdminCompanySummary {
  totalAdminPool: number;
  poolATotal: number;
  poolBTotal: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
}

export interface AdminCommissionRepository {
  findCycle(companyId: string, earnCycleId: string): Promise<{ id: string; status: string } | null>;
  loadCycleContext(companyId: string, earnCycleId: string): Promise<AdminCycleContext>;
  loadMembers(companyId: string, context: AdminCycleContext): Promise<AdminMemberInput[]>;
  resolvePayCycleId(companyId: string, earnCycleId: string): Promise<string | null>;
  persistCalculation(input: PersistAdminCycleInput, actorUserId: string): Promise<string>;
  findCycleById(id: string): Promise<AdminCycleSummaryRow | null>;
  listMemberResults(cycleId: string): Promise<Array<{
    id: string;
    employeeId: string;
    finalPayout: number;
    status: string;
    payrollItemId: string | null;
  }>>;
  markMemberPaid(memberResultId: string, payrollItemId: string, actorUserId: string): Promise<void>;
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
  companySummary(companyId: string, earnCycleId?: string): Promise<AdminCompanySummary>;
}

export type { AdminOfficeType, AdminShiftType };
