// ============================================================================
// modules/attendance/domain/services/absence-penalty.service.unit.spec.ts
// ============================================================================

import { DEFAULT_LEAVE_RULES } from '../../../settings/domain/leave-settings.types';
import { resolveAbsencePenalty, validateContactNotes, isOwnerPosition } from './absence-penalty.service';

const penalties = DEFAULT_LEAVE_RULES.absencePenalties;

describe('absence-penalty.service', () => {
  it('maps employee roleLevel to ฿1,000', () => {
    const result = resolveAbsencePenalty({
      position: 'Employee',
      roleLevel: 'employee',
      penalties,
    });
    expect(result.amount).toBe(1000);
    expect(result.exempt).toBe(false);
  });

  it('maps sub_leader to ฿2,000', () => {
    const result = resolveAbsencePenalty({
      position: null,
      roleLevel: 'sub_leader',
      penalties,
    });
    expect(result.amount).toBe(2000);
  });

  it('maps big_leader to ฿3,000', () => {
    const result = resolveAbsencePenalty({
      position: null,
      roleLevel: 'big_leader',
      penalties,
    });
    expect(result.amount).toBe(3000);
  });

  it('ABS-009: Secretary uses secretary rate not roleLevel fallback', () => {
    const result = resolveAbsencePenalty({
      position: 'Secretary',
      roleLevel: 'employee',
      penalties,
    });
    expect(result.amount).toBe(3000);
    expect(result.tier).toBe('secretary');
  });

  it('ABS-009a: Owner is exempt with ฿0', () => {
    const result = resolveAbsencePenalty({
      position: 'Owner',
      roleLevel: 'big_leader',
      penalties,
    });
    expect(result.amount).toBe(0);
    expect(result.exempt).toBe(true);
    expect(result.tier).toBe('owner_exempt');
  });

  it('isOwnerPosition detects owner case-insensitively', () => {
    expect(isOwnerPosition('Owner')).toBe(true);
    expect(isOwnerPosition('owner')).toBe(true);
    expect(isOwnerPosition('Employee')).toBe(false);
  });

  it('validates contact notes length', () => {
    expect(validateContactNotes('short')).toBe(false);
    expect(validateContactNotes('โทร 3 ครั้ง ไม่รับสาย')).toBe(true);
  });
});
