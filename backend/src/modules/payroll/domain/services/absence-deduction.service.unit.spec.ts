import { summarizeAbsenceDeductions, formatAbsenceDeductionNote } from './absence-deduction.service';

describe('absence-deduction.service', () => {
  it('summarizes approved absence sources', () => {
    const summary = summarizeAbsenceDeductions([
      { id: 'a1', workDate: new Date('2026-06-02'), amount: 1000, roleLevel: 'employee' },
      { id: 'a2', workDate: new Date('2026-06-05'), amount: 2000, roleLevel: 'sub_leader' },
    ]);
    expect(summary.totalDeduction).toBe(3000);
    expect(summary.sources).toHaveLength(2);
    expect(formatAbsenceDeductionNote(summary)).toContain('หักขาดงาน');
    expect(formatAbsenceDeductionNote(summary)).toContain('2026-06-02');
  });

  it('excludes zero-amount rows', () => {
    const summary = summarizeAbsenceDeductions([
      { id: 'a1', workDate: new Date('2026-06-02'), amount: 0, roleLevel: 'employee' },
    ]);
    expect(summary.totalDeduction).toBe(0);
    expect(summary.sources).toHaveLength(0);
  });
});
