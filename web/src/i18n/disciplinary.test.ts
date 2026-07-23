import { describe, expect, it } from 'vitest';
import { disciplinaryActionTypeLabel } from '../i18n/th-labels';

describe('disciplinary labels', () => {
  it('labels verbal warning', () => {
    expect(disciplinaryActionTypeLabel('verbal_warning')).toBe('ตักเตือนด้วยวาจา');
  });

  it('labels warning levels', () => {
    expect(disciplinaryActionTypeLabel('warning_1')).toBe('Warning 1');
    expect(disciplinaryActionTypeLabel('warning_2')).toBe('Warning 2');
  });

  it('labels termination', () => {
    expect(disciplinaryActionTypeLabel('termination')).toBe('เลิกจ้าง');
  });

  it('falls back for unknown types', () => {
    expect(disciplinaryActionTypeLabel('unknown')).toBe('unknown');
  });
});
