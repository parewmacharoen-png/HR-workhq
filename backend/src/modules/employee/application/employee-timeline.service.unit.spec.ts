import { EmployeeTimelineService } from './employee-timeline.service';

describe('EmployeeTimelineService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  function buildService(overrides: {
    changes?: Array<Record<string, unknown>>;
    audits?: Array<Record<string, unknown>>;
    permissions?: string[];
  }) {
    const prisma = {
      employeeChangeHistory: {
        findMany: jest.fn().mockResolvedValue(overrides.changes ?? []),
      },
      auditLog: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { entityType?: string } }) => {
          if (where.entityType === 'Employee') return Promise.resolve(overrides.audits ?? []);
          return Promise.resolve([]);
        }),
      },
      employeeDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'u-1',
          username: 'sec',
          employee: { firstName: 'Sec', lastName: 'Retary', nickname: null },
          businessRoleAssignments: [{ role: 'secretary' }],
        }]),
      },
    };

    const permissions = {
      getEffectivePermissions: jest.fn().mockResolvedValue(overrides.permissions ?? ['employee:read']),
    };

    const service = new EmployeeTimelineService(
      prisma as never,
      { assertEmployeeReadable: jest.fn() } as never,
      permissions as never,
    );

    return { service, prisma };
  }

  it('merges change history and audit items sorted newest first', async () => {
    const { service } = buildService({
      changes: [{
        id: 'c1',
        changeType: 'profile',
        fieldName: 'phone',
        beforeValueJson: '0811111111',
        afterValueJson: '0822222222',
        changedAt: new Date('2026-06-24T10:00:00.000Z'),
        changedBy: 'u-1',
        source: 'web',
      }],
      audits: [{
        id: BigInt(9),
        action: 'employee_education_created',
        occurredAt: new Date('2026-06-25T10:00:00.000Z'),
        actorUserId: 'u-1',
        before: null,
        after: { institution: 'Chula' },
      }],
    });

    const result = await service.getTimeline(actor, 'emp-1');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe('au-9');
    expect(result.items[0].eventKey).toBe('education_added');
    expect(result.items[1].id).toBe('ch-c1');
    expect(result.items[1].eventKey).toBe('personal_updated');
  });

  it('masks sensitive values without employee:sensitive:read', async () => {
    const { service } = buildService({
      changes: [{
        id: 'c2',
        changeType: 'profile',
        fieldName: 'nationalId',
        beforeValueJson: null,
        afterValueJson: '1234567890123',
        changedAt: new Date('2026-06-24T10:00:00.000Z'),
        changedBy: 'u-1',
        source: 'web',
      }],
      permissions: ['employee:read'],
    });

    const result = await service.getTimeline(actor, 'emp-1');
    expect(result.items[0].description).toContain('****');
    expect(result.items[0].description).not.toContain('1234567890123');
  });

  it('skips wrapper audit actions duplicated by change history', async () => {
    const { service } = buildService({
      audits: [{
        id: BigInt(1),
        action: 'employee_personal_updated',
        occurredAt: new Date('2026-06-24T10:00:00.000Z'),
        actorUserId: 'u-1',
        before: null,
        after: {},
      }],
    });

    const result = await service.getTimeline(actor, 'emp-1');
    expect(result.items).toHaveLength(0);
  });

  it('maps change history fields to stable event keys', async () => {
    const { service } = buildService({
      changes: [
        {
          id: 'c-phone',
          changeType: 'profile',
          fieldName: 'phone',
          beforeValueJson: '0811111111',
          afterValueJson: '0822222222',
          changedAt: new Date('2026-06-24T10:00:00.000Z'),
          changedBy: 'u-1',
          source: 'web',
        },
        {
          id: 'c-nid',
          changeType: 'profile',
          fieldName: 'nationalId',
          beforeValueJson: null,
          afterValueJson: '1234567890123',
          changedAt: new Date('2026-06-24T09:00:00.000Z'),
          changedBy: 'u-1',
          source: 'web',
        },
        {
          id: 'c-dept',
          changeType: 'employment',
          fieldName: 'department',
          beforeValueJson: 'HR',
          afterValueJson: 'Ops',
          changedAt: new Date('2026-06-24T08:00:00.000Z'),
          changedBy: 'u-1',
          source: 'web',
        },
      ],
    });

    const result = await service.getTimeline(actor, 'emp-1');
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item.eventKey]));
    expect(byId['ch-c-phone']).toBe('personal_updated');
    expect(byId['ch-c-nid']).toBe('government_info_updated');
    expect(byId['ch-c-dept']).toBe('department_changed');
  });

  it('maps audit education events and unknown actions', async () => {
    const { service } = buildService({
      audits: [
        {
          id: BigInt(10),
          action: 'employee_education_created',
          occurredAt: new Date('2026-06-25T10:00:00.000Z'),
          actorUserId: 'u-1',
          before: null,
          after: { institution: 'Chula' },
        },
        {
          id: BigInt(11),
          action: 'custom_unknown_action',
          occurredAt: new Date('2026-06-24T10:00:00.000Z'),
          actorUserId: 'u-1',
          before: null,
          after: {},
        },
      ],
    });

    const result = await service.getTimeline(actor, 'emp-1');
    expect(result.items[0].eventKey).toBe('education_added');
    expect(result.items[1].eventKey).toBe('other');
  });
});
