import {
  buildAssignmentUpdateFromPreset,
  buildEmployeeUpdateFromPreset,
  mapBusinessRoleToRoleLevel,
  mapWorkLocationToCategory,
  resolveInitialEmploymentFromType,
} from './employment-preset.util';

describe('employment-preset.util', () => {
  const preset = {
    companyId: 'c1',
    businessRole: 'sub_leader',
    employmentType: 'full_time',
    startDate: '2026-07-01',
    teamId: 't1',
    position: 'Sales',
    workLocation: 'office',
    departmentId: 'd1',
  };

  it('maps business role to assignment role level', () => {
    expect(mapBusinessRoleToRoleLevel('sub_leader')).toBe('sub_leader');
    expect(mapBusinessRoleToRoleLevel('employee')).toBe('employee');
  });

  it('maps work location to work category', () => {
    expect(mapWorkLocationToCategory('wfh')).toBe('wfh');
    expect(mapWorkLocationToCategory('invalid')).toBeUndefined();
  });

  it('builds employee update from preset', () => {
    const update = buildEmployeeUpdateFromPreset(preset, 'Marketing');
    expect(update.employmentType).toBe('full_time');
    expect(update.position).toBe('Sales');
    expect(update.department).toBe('Marketing');
    expect(update.workCategory).toBe('office');
  });

  it('builds assignment update from preset', () => {
    const update = buildAssignmentUpdateFromPreset(preset, 'd1');
    expect(update.teamId).toBe('t1');
    expect(update.roleLevel).toBe('sub_leader');
    expect(update.functionId).toBe('d1');
    expect(update.isPrimaryTeam).toBe(true);
  });

  it('maps full_time to active employment status', () => {
    expect(resolveInitialEmploymentFromType('full_time')).toEqual({
      employmentType: 'full_time',
      employmentStatus: 'active',
    });
  });

  it('maps probation type to probation status', () => {
    expect(resolveInitialEmploymentFromType('probation')).toEqual({
      employmentType: 'probation',
      employmentStatus: 'probation',
    });
  });
});
