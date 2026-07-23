import { formatLateDeductionNote, summarizeLateDeductions } from './late-deduction.service';

describe('LateDeductionService', () => {
  it('sums stored attendance late deductions', () => {
    const summary = summarizeLateDeductions([
      { id: 'a1', workDate: new Date('2026-06-01'), amount: 50 },
      { id: 'a2', workDate: new Date('2026-06-02'), amount: 75.5 },
    ]);
    expect(summary.totalDeduction).toBe(125.5);
    expect(summary.sources).toHaveLength(2);
    expect(formatLateDeductionNote(summary)).toContain('หักเข้างานสาย');
    expect(formatLateDeductionNote(summary)).toContain('2026-06-01');
  });
});
