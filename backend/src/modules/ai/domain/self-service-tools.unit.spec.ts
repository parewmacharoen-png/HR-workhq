// ============================================================================
// modules/ai/domain/self-service-tools.unit.spec.ts
// ============================================================================

import {
  isSelfServiceTool,
  rejectCrossEmployeeOverride,
  sanitizeSelfServiceInput,
  SELF_SERVICE_TOOL_NAMES,
} from './self-service-tools';

describe('Self-service AI tools', () => {
  it('includes all get_my_* tools', () => {
    expect(SELF_SERVICE_TOOL_NAMES.has('get_my_leave_balance')).toBe(true);
    expect(SELF_SERVICE_TOOL_NAMES.has('get_my_commission')).toBe(true);
    expect(SELF_SERVICE_TOOL_NAMES.has('get_my_profile')).toBe(true);
    expect(SELF_SERVICE_TOOL_NAMES.has('get_leave_balance')).toBe(false);
  });

  it('strips employeeId and userId from tool input', () => {
    expect(sanitizeSelfServiceInput({
      employeeId: 'other-emp',
      userId: 'other-user',
      query: 'test',
    })).toEqual({ query: 'test' });
  });

  it('rejects cross-employee override attempts', () => {
    expect(rejectCrossEmployeeOverride({ employeeId: 'emp-2' }, 'emp-1'))
      .toBe('Self-service tools cannot query another employee');
    expect(rejectCrossEmployeeOverride({}, 'emp-1')).toBeNull();
    expect(rejectCrossEmployeeOverride({ employeeId: 'emp-1' }, 'emp-1')).toBeNull();
  });

  it('identifies self-service tool names', () => {
    expect(isSelfServiceTool('get_my_late_statistics')).toBe(true);
    expect(isSelfServiceTool('get_team_attendance')).toBe(false);
  });
});
