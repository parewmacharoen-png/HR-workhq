import { SchedulerTimeProvider } from './scheduler-time.provider';
import { BangkokTimeProvider } from './bangkok-time.provider';

describe('SchedulerTimeProvider (unit)', () => {
  const provider = new SchedulerTimeProvider(new BangkokTimeProvider());

  it('uses Bangkok date key across UTC midnight', () => {
    // 2026-06-23 17:30 UTC = 2026-06-24 00:30 Bangkok
    expect(provider.dateKey(new Date('2026-06-23T17:30:00.000Z'))).toBe('2026-06-24');
  });

  it('schedules next Bangkok run after current instant', () => {
    const asOf = new Date('2026-06-24T02:00:00.000Z'); // 09:00 Bangkok
    const next = provider.nextBangkokRun(9, 0, asOf);
    expect(next.getTime()).toBeGreaterThan(asOf.getTime());
    expect(provider.dateKey(next)).toBe('2026-06-25');
  });

  it('minute key uses Bangkok local time', () => {
    const key = provider.minuteKey(new Date('2026-06-24T02:15:00.000Z'));
    expect(key).toBe('2026-06-24:09:15');
  });
});
