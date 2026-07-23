// ============================================================================
// commission-declaration.types unit tests
// ============================================================================

import {
  isAssignmentComplete,
  splitPercentMismatch,
  validateAssignmentInputs,
} from './commission-declaration.types';

describe('commission-declaration.types', () => {
  const base = {
    companyId: 'c1',
    teamId: 't1',
    assignmentType: 'primary' as const,
  };

  it('requires split percents for BIG_LEADER_SPLIT', () => {
    expect(isAssignmentComplete({ commissionMethod: 'team_pool' })).toBe(true);
    expect(isAssignmentComplete({ commissionMethod: 'big_leader_split' })).toBe(false);
    expect(isAssignmentComplete({
      commissionMethod: 'big_leader_split',
      bigLeaderPercent: 5,
      employeePercent: 95,
    })).toBe(true);
  });

  it('validates primary count and split total', () => {
    expect(validateAssignmentInputs([])).toMatch(/At least one/);
    expect(validateAssignmentInputs([
      { ...base, commissionMethod: 'team_pool' },
      { ...base, assignmentType: 'primary', commissionMethod: 'none' },
    ])).toMatch(/Exactly one PRIMARY/);
    expect(validateAssignmentInputs([
      { ...base, commissionMethod: 'big_leader_split', bigLeaderPercent: 10, employeePercent: 80 },
    ])).toMatch(/total 100/);
    expect(validateAssignmentInputs([
      { ...base, commissionMethod: 'big_leader_split', bigLeaderPercent: 5, employeePercent: 95 },
    ])).toBeNull();
  });

  it('detects split mismatch', () => {
    expect(splitPercentMismatch(5, 95)).toBe(false);
    expect(splitPercentMismatch(5, 90)).toBe(true);
  });
});
