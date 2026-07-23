import {
  formatPayrollPeriodRangeTh,
  groupDatesByPayrollPeriod,
  monthlyOffReportingWindow,
  payrollAttendanceWindowOf,
  payrollPeriodEndOf,
  payrollPeriodStartOf,
  payrollPeriodWindowOf,
} from './payroll-period.util';

describe('payroll-period.util', () => {
  it('anchors period on the 25th (cutoff through the 23rd)', () => {
    expect(payrollPeriodStartOf('2026-06-23')).toBe('2026-05-25');
    expect(payrollPeriodStartOf('2026-06-24')).toBe('2026-06-25');
    expect(payrollPeriodStartOf('2026-06-25')).toBe('2026-06-25');
    expect(payrollPeriodStartOf('2026-06-30')).toBe('2026-06-25');
    expect(payrollPeriodStartOf('2026-07-06')).toBe('2026-06-25');
    expect(payrollPeriodStartOf('2026-07-23')).toBe('2026-06-25');
    expect(payrollPeriodStartOf('2026-07-24')).toBe('2026-07-25');
  });

  it('ends period on the 23rd of the next month', () => {
    expect(payrollPeriodEndOf('2026-06-25')).toBe('2026-07-23');
    expect(payrollPeriodWindowOf('2026-06-30')).toEqual({
      periodStart: '2026-06-25',
      periodEnd: '2026-07-23',
    });
  });

  it('rolls the 24th into the next cycle attendance window', () => {
    const window = payrollAttendanceWindowOf('2026-07-25', '2026-08-23');
    expect(window).toEqual({
      periodStart: '2026-07-24',
      periodEnd: '2026-08-23',
    });
    expect('2026-07-24' >= window.periodStart && '2026-07-24' <= window.periodEnd).toBe(true);
    expect('2026-07-23' >= window.periodStart).toBe(false);
  });

  it('allows monthly off dates across calendar months in the same payroll period', () => {
    const window = payrollPeriodWindowOf('2026-06-30');
    expect('2026-06-28' >= window.periodStart && '2026-06-28' <= window.periodEnd).toBe(true);
    expect('2026-07-06' >= window.periodStart && '2026-07-06' <= window.periodEnd).toBe(true);
  });

  it('includes the next payroll period for advance reporting', () => {
    const reporting = monthlyOffReportingWindow('2026-06-30');
    expect(reporting.currentPeriod.periodStart).toBe('2026-06-25');
    expect(reporting.nextPeriod.periodStart).toBe('2026-07-25');
    expect(reporting.validEnd).toBe('2026-08-23');
    expect('2026-07-06' >= reporting.validStart && '2026-07-06' <= reporting.validEnd).toBe(true);
    expect('2026-08-10' >= reporting.validStart && '2026-08-10' <= reporting.validEnd).toBe(true);
  });

  it('groups mixed dates into payroll periods', () => {
    const grouped = groupDatesByPayrollPeriod(['2026-06-28', '2026-07-06', '2026-07-24', '2026-07-26']);
    expect(grouped.get('2026-06-25')).toEqual(['2026-06-28', '2026-07-06']);
    expect(grouped.get('2026-07-25')).toEqual(['2026-07-24', '2026-07-26']);
  });

  it('formats payroll period range for Thai UI', () => {
    expect(formatPayrollPeriodRangeTh('2026-06-25', '2026-07-23')).toBe('25/06 – 23/07');
  });
});
