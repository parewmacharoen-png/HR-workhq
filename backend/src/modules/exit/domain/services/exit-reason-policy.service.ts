// ============================================================================
// modules/exit/domain/services/exit-reason-policy.service.ts
// PAY-004d/e/f · RS-003–005 · DISC-001/002
// ============================================================================

export type ExitReason =
  | 'proper_resignation'
  | 'absconding'
  | 'gross_misconduct'
  | 'performance_failure'
  | 'constructive_resignation';

export type SettlementOutcome = 'full_refund' | 'partial_refund' | 'forfeit';

export interface SettlementComputation {
  outcome: SettlementOutcome;
  refundAmount: number;
  forfeitAmount: number;
  legalReviewRequired: boolean;
  policyRules: string[];
}

export function isMarketingDepartment(department: string | null | undefined): boolean {
  return (department ?? '').toLowerCase().includes('marketing');
}

export function resolveDepartmentRoute(department: string | null | undefined): 'marketing' | 'admin' {
  return isMarketingDepartment(department) ? 'marketing' : 'admin';
}

export function computeDepositSettlement(input: {
  exitReason: ExitReason;
  depositBalance: number;
  approvedClaimsTotal: number;
}): SettlementComputation {
  const balance = roundMoney(Math.max(0, input.depositBalance));
  const claims = roundMoney(Math.max(0, input.approvedClaimsTotal));

  if (input.exitReason === 'absconding' || input.exitReason === 'constructive_resignation') {
    return {
      outcome: 'forfeit',
      refundAmount: 0,
      forfeitAmount: balance,
      legalReviewRequired: false,
      policyRules: ['PAY-004e', 'RS-004'],
    };
  }

  if (input.exitReason === 'gross_misconduct') {
    return {
      outcome: 'forfeit',
      refundAmount: 0,
      forfeitAmount: balance,
      legalReviewRequired: true,
      policyRules: ['PAY-004f', 'RS-005', 'DISC-002', 'DISC-002d'],
    };
  }

  const refundAmount = roundMoney(Math.max(0, balance - claims));
  const forfeitAmount = roundMoney(Math.max(0, balance - refundAmount));
  const outcome: SettlementOutcome = refundAmount <= 0
    ? 'forfeit'
    : claims > 0
      ? 'partial_refund'
      : 'full_refund';

  const policyRules = input.exitReason === 'performance_failure'
    ? ['PAY-004d', 'DISC-001d', 'RS-007']
    : ['PAY-004d', 'RS-003'];

  return {
    outcome,
    refundAmount,
    forfeitAmount,
    legalReviewRequired: false,
    policyRules,
  };
}

export function allocateRefundByCollector(
  refundTotal: number,
  collectors: Array<{ companyId: string; collectedAmount: number }>,
): Array<{ companyId: string; refundAmount: number }> {
  if (refundTotal <= 0 || !collectors.length) return [];
  const totalCollected = collectors.reduce((s, c) => s + c.collectedAmount, 0);
  if (totalCollected <= 0) return [];

  let remaining = refundTotal;
  const allocations = collectors.map((c, index) => {
    if (index === collectors.length - 1) {
      return { companyId: c.companyId, refundAmount: roundMoney(remaining) };
    }
    const share = roundMoney((c.collectedAmount / totalCollected) * refundTotal);
    remaining = roundMoney(remaining - share);
    return { companyId: c.companyId, refundAmount: share };
  });
  return allocations;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
