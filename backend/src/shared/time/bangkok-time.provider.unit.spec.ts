import { BangkokTimeProvider } from './bangkok-time.provider';

describe('BangkokTimeProvider (unit)', () => {
  const tp = new BangkokTimeProvider();

  it('returns Bangkok work date for UTC evening', () => {
    // 2026-06-24 02:00 UTC = 2026-06-24 09:00 Bangkok
    expect(tp.workDateString(new Date('2026-06-24T02:00:00.000Z'))).toBe('2026-06-24');
  });

  it('rolls work date at Bangkok midnight boundary', () => {
    // 2026-06-23 17:30 UTC = 2026-06-24 00:30 Bangkok
    expect(tp.workDateString(new Date('2026-06-23T17:30:00.000Z'))).toBe('2026-06-24');
  });

  it('computes minutes since midnight in Bangkok', () => {
    // 09:15 Bangkok = 02:15 UTC
    expect(tp.minutesSinceMidnight(new Date('2026-06-24T02:15:00.000Z'))).toBe(9 * 60 + 15);
  });
});
