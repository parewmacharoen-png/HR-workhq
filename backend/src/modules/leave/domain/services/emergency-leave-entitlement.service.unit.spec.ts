import {
  computeEmergencyLeaveEntitlement,
  halfYearPeriodContaining,
  hasPassedProbation,
} from './emergency-leave-entitlement.service';
import { DEFAULT_LEAVE_RULES } from '../../../settings/domain/leave-settings.types';

describe('EmergencyLeaveEntitlementService', () => {
  it('returns full half-year entitlement for established employees', () => {
    const result = computeEmergencyLeaveEntitlement({
      hireDate: new Date('2020-01-01'),
      requestDate: new Date('2026-03-10'),
      employmentStatus: 'active',
      probationEndDate: new Date('2020-04-01'),
      rules: DEFAULT_LEAVE_RULES,
    });
    expect(result.eligible).toBe(true);
    expect(result.entitled).toBe(4);
    expect(result.period.periodStart.toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('rejects employees still on probation', () => {
    const result = computeEmergencyLeaveEntitlement({
      hireDate: new Date('2026-01-01'),
      requestDate: new Date('2026-03-10'),
      employmentStatus: 'probation',
      probationEndDate: new Date('2026-06-01'),
      rules: DEFAULT_LEAVE_RULES,
    });
    expect(result.eligible).toBe(false);
    expect(result.entitled).toBe(0);
  });

  it('prorates new hires with less than 3 months remaining in half-year', () => {
    const result = computeEmergencyLeaveEntitlement({
      hireDate: new Date('2026-05-01'),
      requestDate: new Date('2026-05-15'),
      employmentStatus: 'active',
      probationEndDate: new Date('2026-04-01'),
      rules: DEFAULT_LEAVE_RULES,
    });
    expect(result.eligible).toBe(true);
    expect(result.entitled).toBe(1);
  });

  it('uses higher new-hire allocation when enough months remain', () => {
    const result = computeEmergencyLeaveEntitlement({
      hireDate: new Date('2026-01-15'),
      requestDate: new Date('2026-02-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2026-01-01'),
      rules: DEFAULT_LEAVE_RULES,
    });
    expect(result.entitled).toBe(2);
  });

  it('detects probation passed via probation end date', () => {
    expect(hasPassedProbation('probation', new Date('2026-01-01'), new Date('2026-02-01'))).toBe(true);
    expect(halfYearPeriodContaining(new Date('2026-08-01')).periodStart.getUTCMonth()).toBe(6);
  });
});
