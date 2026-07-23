import {
  combineBangkokWorkDateAndTime,
  formatTimeAsThaiDot,
  normalizeThaiTimeInput,
  parseThaiTimeInput,
  repairUtcHoursStoredAsBangkok,
} from './thai-time-input.util';

describe('thai-time-input.util', () => {
  it('parses dot and colon formats', () => {
    expect(parseThaiTimeInput('21.00')).toEqual({ hours: 21, minutes: 0 });
    expect(parseThaiTimeInput('21:00')).toEqual({ hours: 21, minutes: 0 });
    expect(parseThaiTimeInput('9.30')).toEqual({ hours: 9, minutes: 30 });
  });

  it('rejects invalid times', () => {
    expect(parseThaiTimeInput('25.00')).toBeNull();
    expect(parseThaiTimeInput('21.99')).toBeNull();
    expect(parseThaiTimeInput('2100')).toBeNull();
  });

  it('normalizes to HH:mm', () => {
    expect(normalizeThaiTimeInput('21.00')).toBe('21:00');
    expect(normalizeThaiTimeInput('9.5')).toBeNull();
    expect(normalizeThaiTimeInput('09:30')).toBe('09:30');
  });

  it('formats for display with dot', () => {
    expect(formatTimeAsThaiDot('21:00')).toBe('21.00');
    expect(formatTimeAsThaiDot('9.30')).toBe('09.30');
  });

  it('combines Bangkok work date with local time (+07:00)', () => {
    const at = combineBangkokWorkDateAndTime('2026-07-05', '21:00');
    expect(at?.toISOString()).toBe('2026-07-05T14:00:00.000Z');
    expect(combineBangkokWorkDateAndTime('2026-07-05', '09:15')?.toISOString()).toBe(
      '2026-07-05T02:15:00.000Z',
    );
  });

  it('repairs legacy UTC-as-Bangkok correction timestamps', () => {
    const wrong = '2026-07-05T21:00:00.000Z';
    const fixed = repairUtcHoursStoredAsBangkok(wrong, '2026-07-05');
    expect(fixed?.toISOString()).toBe('2026-07-05T14:00:00.000Z');
    // Real check-in instant (not on work-date anchor) must not be altered.
    expect(repairUtcHoursStoredAsBangkok('2026-07-05T02:15:00.000Z', '2026-07-05')).toBeNull();
  });
});
