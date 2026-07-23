import { apiDeleteWithBody, apiGet, apiPatch, apiPost } from './client';

export interface EmployeeDepositLegacyEntry {
  id: string | null;
  companyId: string;
  companyCode: string | null;
  companyName: string | null;
  amount: number;
  source: 'profile' | 'ledger';
}

export interface EmployeeDepositBalance {
  employeeId: string;
  balance: number;
  ledgerBalance: number;
  refundableEstimate: number;
  depositDeductionExempt: boolean;
  legacyDepositAmount: number;
  legacyDepositCompanyId: string | null;
  legacyDepositCompanyCode: string | null;
  legacyDepositCompanyName: string | null;
  legacyEntries: EmployeeDepositLegacyEntry[];
  collectorBreakdown: Array<{
    companyId: string;
    companyCode: string | null;
    companyName: string | null;
    collectedAmount: number;
    isLegacy?: boolean;
  }>;
}

export interface DepositLedgerEntry {
  id: string;
  owningCompanyCode: string | null;
  owningCompanyName: string | null;
  amount: number;
  runningTotal: number;
  createdAt: string;
  isLegacy?: boolean;
  payrollCycleId?: string | null;
}

export function fetchEmployeeDepositBalance(employeeId: string) {
  return apiGet<EmployeeDepositBalance>(`/employees/${employeeId}/deposit/balance`);
}

export function fetchEmployeeDepositLedger(employeeId: string) {
  return apiGet<{ employeeId: string; entries: DepositLedgerEntry[] }>(
    `/employees/${employeeId}/deposit/ledger`,
  );
}

export interface UpdateEmployeeDepositSettingsBody {
  depositDeductionExempt?: boolean;
  legacyDepositAmount?: number | null;
  legacyDepositCompanyId?: string | null;
  reason: string;
}

export function updateEmployeeDepositSettings(employeeId: string, body: UpdateEmployeeDepositSettingsBody) {
  return apiPatch(`/employees/${employeeId}/deposit/settings`, body);
}

export interface AddLegacyDepositBody {
  companyId: string;
  amount: number;
  reason: string;
}

export function addLegacyDeposit(employeeId: string, body: AddLegacyDepositBody) {
  return apiPost<{
    id: string;
    employeeId: string;
    companyId: string;
    companyCode: string;
    companyName: string;
    amount: number;
    isLegacy: boolean;
  }>(`/employees/${employeeId}/deposit/legacy`, body);
}

export function updateDepositLedgerEntry(
  employeeId: string,
  depositId: string,
  body: { amount: number; reason: string },
) {
  return apiPatch<DepositLedgerEntry>(
    `/employees/${employeeId}/deposit/ledger/${depositId}`,
    body,
  );
}

export function deleteDepositLedgerEntry(
  employeeId: string,
  depositId: string,
  reason: string,
) {
  return apiDeleteWithBody<{ id: string; deleted: boolean }>(
    `/employees/${employeeId}/deposit/ledger/${depositId}`,
    { reason },
  );
}
