import { describe, expect, it } from 'vitest';
import {
  MANUAL_PAYROLL_DEDUCTION_OPTIONS,
  MANUAL_PAYROLL_EARNING_OPTIONS,
} from './manual-payroll-items';

describe('manual-payroll-items API constants', () => {
  it('exposes all required Thai earning labels', () => {
    const labels = MANUAL_PAYROLL_EARNING_OPTIONS.map((row) => row.labelTh);
    expect(labels).toContain('โบนัส');
    expect(labels).toContain('ค่าคอมมิชชั่น');
    expect(labels).toContain('OT');
    expect(labels).toContain('ค่าข้าว');
    expect(labels).toHaveLength(9);
  });

  it('exposes all required Thai deduction labels', () => {
    const labels = MANUAL_PAYROLL_DEDUCTION_OPTIONS.map((row) => row.labelTh);
    expect(labels).toContain('หักค่าไฟ');
    expect(labels).toContain('หักประกัน');
    expect(labels).toContain('เงินเบิก');
    expect(labels).toHaveLength(6);
  });
});
