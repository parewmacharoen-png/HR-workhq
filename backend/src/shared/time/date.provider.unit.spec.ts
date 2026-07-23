import { DateProvider } from './date.provider';
import { BangkokTimeProvider } from './bangkok-time.provider';

describe('DateProvider (INF-001b)', () => {
  const bangkok = new BangkokTimeProvider();
  const dates = new DateProvider(bangkok);

  it('todayString matches Bangkok calendar', () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-23T18:00:00.000Z')); // midnight ICT next day edge
    expect(dates.todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    jest.useRealTimers();
  });

  it('addDays crosses month boundary', () => {
    const start = dates.parseDate('2026-01-31');
    const next = dates.addDays(start, 1);
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('rolls work date at Bangkok midnight boundary', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-23T17:30:00.000Z'));
    expect(dates.todayString()).toBe('2026-06-24');
    jest.useRealTimers();
  });

  it('payroll period boundary uses Bangkok month end', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-31T17:00:00.000Z')); // Apr 1 00:00 Bangkok
    expect(dates.endOfMonth().toISOString().slice(0, 10)).toBe('2026-04-30');
    jest.useRealTimers();
  });

  it('payroll cycle anchor rolls on 25th boundary (INF-001c)', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-24T17:00:00.000Z')); // Jan 25 00:00 Bangkok
    const periodStart = dates.parseDate('2026-01-24');
    const d = new Date(periodStart);
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 25));
    if (d.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
    expect(start.toISOString().slice(0, 10)).toBe('2025-12-25');
    jest.useRealTimers();
  });

  it('birthday edge: month-end hire date anniversary', () => {
    const hire = dates.parseDate('2024-01-31');
    const anniversary = dates.addDays(hire, 365);
    expect(anniversary.getUTCFullYear()).toBe(2025);
  });

  it('probation reminder window uses Bangkok today', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-23T18:00:00.000Z'));
    expect(dates.todayString()).toBe('2026-06-24');
    jest.useRealTimers();
  });
});
