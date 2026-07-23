// ============================================================================
// modules/exit/domain/services/exit-reason-policy.service.unit.spec.ts
// ============================================================================

import {
  computeDepositSettlement,
  allocateRefundByCollector,
  resolveDepartmentRoute,
} from './exit-reason-policy.service';

describe('exit-reason-policy.service', () => {
  it('proper resignation refunds balance minus claims', () => {
    const result = computeDepositSettlement({
      exitReason: 'proper_resignation',
      depositBalance: 3000,
      approvedClaimsTotal: 500,
    });
    expect(result.refundAmount).toBe(2500);
    expect(result.forfeitAmount).toBe(500);
    expect(result.outcome).toBe('partial_refund');
  });

  it('performance failure refunds full balance', () => {
    const result = computeDepositSettlement({
      exitReason: 'performance_failure',
      depositBalance: 3000,
      approvedClaimsTotal: 0,
    });
    expect(result.refundAmount).toBe(3000);
    expect(result.outcome).toBe('full_refund');
  });

  it('absconding forfeits entire balance', () => {
    const result = computeDepositSettlement({
      exitReason: 'absconding',
      depositBalance: 2500,
      approvedClaimsTotal: 0,
    });
    expect(result.refundAmount).toBe(0);
    expect(result.forfeitAmount).toBe(2500);
    expect(result.legalReviewRequired).toBe(false);
  });

  it('gross misconduct forfeits with LEGAL_REVIEW_REQUIRED', () => {
    const result = computeDepositSettlement({
      exitReason: 'gross_misconduct',
      depositBalance: 3000,
      approvedClaimsTotal: 0,
    });
    expect(result.refundAmount).toBe(0);
    expect(result.legalReviewRequired).toBe(true);
    expect(result.policyRules).toContain('DISC-002d');
  });

  it('allocates refund proportionally by collector', () => {
    const allocations = allocateRefundByCollector(1500, [
      { companyId: 'a', collectedAmount: 2000 },
      { companyId: 'b', collectedAmount: 1000 },
    ]);
    expect(allocations).toHaveLength(2);
    expect(allocations.reduce((s, r) => s + r.refundAmount, 0)).toBe(1500);
  });

  it('routes marketing department to marketing path', () => {
    expect(resolveDepartmentRoute('Marketing Team')).toBe('marketing');
    expect(resolveDepartmentRoute('HR Admin')).toBe('admin');
  });
});
