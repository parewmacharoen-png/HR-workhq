import { describe, expect, it } from 'vitest';
import { humanizePayrollNote, payrollItemTypeLabel } from './payroll-item-display';

describe('payroll-item-display', () => {
  it('maps item types to Thai labels', () => {
    expect(payrollItemTypeLabel('salary')).toBe('เงินเดือน');
    expect(payrollItemTypeLabel('excess_off_deduction')).toContain('วันหยุด');
  });

  it('humanizes salary and meal notes', () => {
    expect(humanizePayrollNote('payroll_builder | Prorated salary (29 days)')).toBe(
      'คิดตามจำนวนวันในรอบนี้ (29 วัน)',
    );
    expect(
      humanizePayrollNote('payroll_builder | Meal allowance (6 days x ฿100) | office 2 / wfh 0'),
    ).toContain('ค่าอาหาร 6 วัน');
  });

  it('formats excess off deduction as readable lines', () => {
    const note = humanizePayrollNote(
      'payroll_builder | หักวันหยุดประจำเดือน (7 วัน) | 2026-07-01:฿733(แจ้งไม่ครบ7วัน,2x) | 2026-07-11:฿367(เกินโควต้า,1x)',
    );
    expect(note).toContain('หักวันหยุดประจำเดือน (7 วัน)');
    expect(note).toContain('• 2026-07-01 — 733 บาท');
    expect(note).toContain('แจ้งไม่ครบ 7 วัน');
    expect(note).toContain('คิด 2 เท่า');
  });

  it('strips technical ids from late notes', () => {
    const note = humanizePayrollNote(
      'payroll_builder | Late deduction (1 days) | 2026-07-04:฿91.66[17dc38dd-ad4b-40af-b0c0-fc511d383338]',
    );
    expect(note).not.toContain('17dc38dd');
    expect(note).toContain('หักมาสาย 1 วัน');
    expect(note).toContain('2026-07-04');
  });
});
