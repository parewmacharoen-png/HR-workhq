// ============================================================================
// modules/exit/domain/services/deposit-profile.util.ts
// Legacy pre-system deposits + collector merge for exit refunds.
// ============================================================================

export interface DepositProfileFields {
  depositDeductionExempt: boolean;
  legacyDepositAmount: number;
  legacyDepositCompanyId: string | null;
  legacyDepositCompanyCode: string | null;
  legacyDepositCompanyName: string | null;
}

export interface CollectorBreakdownRow {
  companyId: string;
  companyCode: string | null;
  companyName: string | null;
  collectedAmount: number;
  isLegacy?: boolean;
}

export function resolveDepositProfile(employee: {
  depositDeductionExempt: boolean;
  legacyDepositAmount: { toString(): string } | number | null;
  legacyDepositCompanyId: string | null;
  legacyDepositCompany?: { code: string; name: string } | null;
}): DepositProfileFields {
  const legacyDepositAmount = employee.legacyDepositAmount != null
    ? Number(employee.legacyDepositAmount)
    : 0;

  return {
    depositDeductionExempt: employee.depositDeductionExempt,
    legacyDepositAmount: roundMoney(legacyDepositAmount),
    legacyDepositCompanyId: employee.legacyDepositCompanyId,
    legacyDepositCompanyCode: employee.legacyDepositCompany?.code ?? null,
    legacyDepositCompanyName: employee.legacyDepositCompany?.name ?? null,
  };
}

export function mergeLegacyCollectorBreakdown(
  collectors: CollectorBreakdownRow[],
  profile: DepositProfileFields,
): CollectorBreakdownRow[] {
  if (profile.legacyDepositAmount <= 0 || !profile.legacyDepositCompanyId) {
    return collectors;
  }

  const existing = collectors.find((row) => row.companyId === profile.legacyDepositCompanyId);
  if (existing) {
    return collectors.map((row) => (
      row.companyId === profile.legacyDepositCompanyId
        ? {
          ...row,
          collectedAmount: roundMoney(row.collectedAmount + profile.legacyDepositAmount),
          // Mixed payroll + profile legacy is no longer "legacy only".
          isLegacy: row.isLegacy === true,
        }
        : row
    ));
  }

  return [
    ...collectors,
    {
      companyId: profile.legacyDepositCompanyId,
      companyCode: profile.legacyDepositCompanyCode,
      companyName: profile.legacyDepositCompanyName,
      collectedAmount: profile.legacyDepositAmount,
      isLegacy: true,
    },
  ];
}

export function totalDepositBalance(ledgerBalance: number, profile: DepositProfileFields): number {
  return roundMoney(Math.max(0, ledgerBalance) + Math.max(0, profile.legacyDepositAmount));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
