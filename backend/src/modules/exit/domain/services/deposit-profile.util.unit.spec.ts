import {
  mergeLegacyCollectorBreakdown,
  resolveDepositProfile,
  totalDepositBalance,
} from './deposit-profile.util';

describe('deposit-profile.util', () => {
  it('merges legacy collector when company is new', () => {
    const profile = resolveDepositProfile({
      depositDeductionExempt: true,
      legacyDepositAmount: 3000,
      legacyDepositCompanyId: 'co-legacy',
      legacyDepositCompany: { code: 'LEG', name: 'Legacy Co' },
    });

    const merged = mergeLegacyCollectorBreakdown([
      { companyId: 'co-a', companyCode: 'A', companyName: 'A Co', collectedAmount: 500 },
    ], profile);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      companyId: 'co-legacy',
      collectedAmount: 3000,
    });
    expect(totalDepositBalance(500, profile)).toBe(3500);
  });

  it('adds legacy amount to existing collector company', () => {
    const profile = resolveDepositProfile({
      depositDeductionExempt: false,
      legacyDepositAmount: 2500,
      legacyDepositCompanyId: 'co-a',
      legacyDepositCompany: { code: 'A', name: 'A Co' },
    });

    const merged = mergeLegacyCollectorBreakdown([
      { companyId: 'co-a', companyCode: 'A', companyName: 'A Co', collectedAmount: 500 },
    ], profile);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.collectedAmount).toBe(3000);
  });
});
