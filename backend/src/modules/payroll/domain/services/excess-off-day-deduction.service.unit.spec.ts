import {
  calendarDaysBetween,
  computeExcessOffDayDeductions,
} from './excess-off-day-deduction.service';

describe('excess-off-day-deduction.service', () => {
  const params = {
    monthlyOffDays: 4,
    noticeDays: 7,
    advanceDailyMultiplier: 1,
    suddenDailyMultiplier: 2,
    dailyWage: 1000,
  };

  it('calendarDaysBetween counts whole days from submit to off date', () => {
    expect(calendarDaysBetween(new Date('2026-06-01T10:00:00.000Z'), '2026-06-08')).toBe(7);
    expect(calendarDaysBetween(new Date('2026-06-02T10:00:00.000Z'), '2026-06-08')).toBe(6);
  });

  it('does not deduct within monthly allowance when notice is enough', () => {
    const result = computeExcessOffDayDeductions(
      [
        { monthlyOffRequestId: 'r1', offDate: '2026-06-10', submittedAt: new Date('2026-06-01') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-11', submittedAt: new Date('2026-06-01') },
      ],
      params,
    );
    expect(result.totalDeduction).toBe(0);
  });

  it('deducts 2× within quota when short notice (<7 days)', () => {
    const result = computeExcessOffDayDeductions(
      [
        { monthlyOffRequestId: 'r1', offDate: '2026-07-06', submittedAt: new Date('2026-07-04') },
      ],
      params,
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sudden).toBe(true);
    expect(result.sources[0].amount).toBe(2000);
    expect(result.totalDeduction).toBe(2000);
  });

  it('deducts 1× daily wage for excess with 7+ days notice', () => {
    const result = computeExcessOffDayDeductions(
      [
        { monthlyOffRequestId: 'r1', offDate: '2026-06-05', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-06', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-07', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-08', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-15', submittedAt: new Date('2026-06-01') },
      ],
      params,
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sudden).toBe(false);
    expect(result.sources[0].amount).toBe(1000);
    expect(result.totalDeduction).toBe(1000);
  });

  it('deducts 2× daily wage for sudden excess (<7 days notice)', () => {
    const result = computeExcessOffDayDeductions(
      [
        { monthlyOffRequestId: 'r1', offDate: '2026-06-05', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-06', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-07', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-08', submittedAt: new Date('2026-05-20') },
        { monthlyOffRequestId: 'r1', offDate: '2026-06-15', submittedAt: new Date('2026-06-12') },
      ],
      params,
    );
    expect(result.sources[0].sudden).toBe(true);
    expect(result.sources[0].amount).toBe(2000);
  });
});
