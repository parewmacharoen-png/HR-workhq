import {
  bangkokTimeKey,
  mapCorrectionTypeToField,
  parseWorkDateIso,
} from './time-correction-field.util';

describe('time-correction-field.util', () => {
  it('maps correction types', () => {
    expect(mapCorrectionTypeToField('missed_out')).toBe('checkOutAt');
    expect(mapCorrectionTypeToField('break_return')).toBe('breakEndAt');
  });

  it('parses work date iso', () => {
    expect(parseWorkDateIso('2026-07-05')).toBe('2026-07-05');
    expect(parseWorkDateIso('bad')).toBeNull();
  });

  it('formats bangkok time key', () => {
    const iso = '2026-07-05T14:00:00.000Z'; // 21:00 Bangkok
    expect(bangkokTimeKey(iso)).toBe('21:00');
  });
});
