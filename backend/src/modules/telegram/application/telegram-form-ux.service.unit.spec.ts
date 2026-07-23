// UX-001 tests
import { TelegramFormUxService } from './telegram-form-ux.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('TelegramFormUxService', () => {
  const dates = new DateProvider(new BangkokTimeProvider());
  const svc = new TelegramFormUxService(dates);

  it('builds option rows with encoded values', () => {
    const rows = svc.buildOptionRows('req:pick', [
      { label: 'ลาป่วย', value: 'sick' },
    ]);
    expect(rows[0]?.[0]?.callback_data).toBe('req:pick:sick');
  });

  it('validates Thai phone', () => {
    expect(svc.validatePhone('0812345678')).toBeNull();
    expect(svc.validatePhone('123')).not.toBeNull();
  });

  it('validates date and time', () => {
    expect(svc.validateDate('05/06/2026')).toBeNull();
    expect(svc.validateDate('2026-06-24')).toBeNull();
    expect(svc.validateTime('09.30')).toBeNull();
    expect(svc.validateTime('25.00')).not.toBeNull();
  });

  it('resolves quick date presets', () => {
    expect(svc.resolveQuickDate('today')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(svc.resolveQuickDate('tomorrow')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('labels option values for summary', () => {
    expect(svc.labelForValue('button_select', 'full', [
      { label: 'เต็มวัน', value: 'full' },
    ])).toBe('เต็มวัน');
  });

  it('builds OT time slots from shift end only', () => {
    const slots = svc.resolveQuickTimeSlots({ notBeforeMinutes: 21 * 60 });
    expect(slots[0]).toBe('21:00');
    expect(slots).not.toContain('13:00');
    expect(slots).toContain('22:00');
  });

  it('builds OT end slots after start time', () => {
    const slots = svc.resolveQuickTimeSlots({
      notBeforeMinutes: 21 * 60,
      afterTime: '21:00',
    });
    expect(slots[0]).toBe('22:00');
    expect(slots).not.toContain('21:00');
  });
});
