// ============================================================================
// Unit tests — manual payroll item category mapping
// ============================================================================

import {
  getManualPayrollCategoryMeta,
  isDefinitionEffectiveForPeriod,
  manualPayrollItemNote,
  signedAmountForCategory,
} from './manual-payroll-item.constants';

describe('manual-payroll-item.constants', () => {
  it('maps Thai earning categories to payroll item types', () => {
    expect(getManualPayrollCategoryMeta('bonus').itemType).toBe('bonus');
    expect(getManualPayrollCategoryMeta('commission').itemType).toBe('commission');
    expect(getManualPayrollCategoryMeta('phone_allowance').itemType).toBe('manual_adjustment');
    expect(getManualPayrollCategoryMeta('phone_allowance').labelTh).toBe('ค่าโทรศัพท์');
  });

  it('signs deduction amounts as negative', () => {
    expect(signedAmountForCategory('utility_deduction', 500)).toBe(-500);
    expect(signedAmountForCategory('bonus', 1000)).toBe(1000);
    expect(signedAmountForCategory('deposit_deduction', 200)).toBe(-200);
  });

  it('builds traceable payroll item notes', () => {
    const note = manualPayrollItemNote('abc-123', 'bonus', 'Q1 performance');
    expect(note).toContain('manual_item:abc-123');
    expect(note).toContain('โบนัส');
    expect(note).toContain('Q1 performance');
  });

  it('checks effective date windows against cycle period', () => {
    const periodStart = new Date('2026-01-25');
    const periodEnd = new Date('2026-02-23');
    expect(isDefinitionEffectiveForPeriod(
      new Date('2026-02-01'),
      null,
      periodStart,
      periodEnd,
    )).toBe(true);
    expect(isDefinitionEffectiveForPeriod(
      new Date('2026-03-01'),
      null,
      periodStart,
      periodEnd,
    )).toBe(false);
    expect(isDefinitionEffectiveForPeriod(
      new Date('2026-01-01'),
      new Date('2026-01-20'),
      periodStart,
      periodEnd,
    )).toBe(false);
  });
});
