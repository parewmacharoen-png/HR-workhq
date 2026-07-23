import type { PayrollCycle } from '../api/payroll';

export function findPayrollCycleForCompany(
  cycles: PayrollCycle[],
  periodStart: string,
  periodEnd: string,
): PayrollCycle | undefined {
  return cycles.find(
    (row) => row.periodStart === periodStart && row.periodEnd === periodEnd,
  );
}

export function payrollCycleCompanyLabel(
  companies: Array<{ id: string; name: string; code: string }>,
  companyId: string,
): string {
  const match = companies.find((c) => c.id === companyId);
  return match ? `${match.name} (${match.code})` : companyId;
}
