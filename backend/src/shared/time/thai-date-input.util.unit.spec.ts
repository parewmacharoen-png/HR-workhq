import {
  formatIsoDateAsDdMmYyyy,
  formatYearMonthIsoAsMmYyyy,
  parseThaiDateInput,
  parseThaiDateListInput,
  parseThaiMultiDateInput,
} from './thai-date-input.util';

describe('thai-date-input.util', () => {
  it('parses DD/MM/YYYY to ISO', () => {
    expect(parseThaiDateInput('05/06/2026')).toBe('2026-06-05');
    expect(parseThaiDateInput('5/6/2026')).toBe('2026-06-05');
  });

  it('formats ISO as DD/MM/YYYY', () => {
    expect(formatIsoDateAsDdMmYyyy('2026-06-05')).toBe('05/06/2026');
  });

  it('formats month as MM/YYYY', () => {
    expect(formatYearMonthIsoAsMmYyyy('2026-06')).toBe('06/2026');
  });

  it('parses comma-separated dates', () => {
    expect(parseThaiDateListInput('05/06/2026, 12/06/2026')).toEqual([
      '2026-06-05',
      '2026-06-12',
    ]);
  });

  it('parses day ranges within a month', () => {
    expect(parseThaiMultiDateInput('22-23/07/2026')).toEqual([
      '2026-07-22',
      '2026-07-23',
    ]);
  });

  it('parses mixed comma and range input', () => {
    expect(parseThaiMultiDateInput('16/07/2026,19/07/2026,22-23/07/2026')).toEqual([
      '2026-07-16',
      '2026-07-19',
      '2026-07-22',
      '2026-07-23',
    ]);
  });

  it('parses full-date ranges', () => {
    expect(parseThaiMultiDateInput('22/07/2026-23/07/2026')).toEqual([
      '2026-07-22',
      '2026-07-23',
    ]);
  });
});
