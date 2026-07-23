// ============================================================================
// modules/payroll/domain/services/deposit-deferral.service.unit.spec.ts
// ============================================================================

import {
  shouldDeferDeposit,
  DEPOSIT_DEFERRAL_WARNING_TH,
} from './deposit-deferral.service';

describe('deposit-deferral.service', () => {
  it('defers when net pay after deposit would fall below minimum', () => {
    const result = shouldDeferDeposit({
      netPayBeforeDeposit: 8000,
      depositAmount: 500,
      minimumNetPayAfterDeposit: 8000,
    });
    expect(result.defer).toBe(true);
    expect(result.reason).toBe(DEPOSIT_DEFERRAL_WARNING_TH);
  });

  it('does not defer when net pay remains above minimum', () => {
    const result = shouldDeferDeposit({
      netPayBeforeDeposit: 15000,
      depositAmount: 500,
      minimumNetPayAfterDeposit: 8000,
    });
    expect(result.defer).toBe(false);
  });

  it('does not defer when minimum is zero (disabled)', () => {
    const result = shouldDeferDeposit({
      netPayBeforeDeposit: 1000,
      depositAmount: 500,
      minimumNetPayAfterDeposit: 0,
    });
    expect(result.defer).toBe(false);
  });

  it('does not defer when deposit amount is zero', () => {
    const result = shouldDeferDeposit({
      netPayBeforeDeposit: 1000,
      depositAmount: 0,
      minimumNetPayAfterDeposit: 8000,
    });
    expect(result.defer).toBe(false);
  });
});
