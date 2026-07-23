// ============================================================================
// shared/audit/audit-explorer.service.unit.spec.ts
// AUDIT-002 tests
// ============================================================================

import { AuditExplorerService } from './audit-explorer.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessPermissionRepository } from '../../modules/permission/domain/repositories/business-permission.repository';

describe('AuditExplorerService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  const findMany = jest.fn();
  const findUserAccess = jest.fn();
  let service: AuditExplorerService;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([
      {
        id: 1n,
        actorUserId: 'user-2',
        companyId: 'co-1',
        entityType: 'salary_review',
        entityId: 'sr-1',
        action: 'update',
        occurredAt: new Date(),
        before: { amount: 50000 },
        after: { amount: 55000 },
      },
    ]);
    findUserAccess.mockResolvedValue({ businessRole: 'employee' });
    service = new AuditExplorerService(
      { auditLog: { findMany } } as unknown as PrismaService,
      { findUserAccess } as unknown as BusinessPermissionRepository,
    );
  });

  it('redacts salary data for employee role', async () => {
    const rows = await service.search(actor, { companyId: 'co-1' });
    expect(rows[0]?.before).toEqual({ redacted: true, reason: 'salary_visibility' });
  });

  it('scopes employee to own actor when not HR', async () => {
    await service.search(actor, { companyId: 'co-1' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorUserId: 'user-1' }),
      }),
    );
  });

  it('allows owner to search company logs without actor filter', async () => {
    findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await service.search(actor, { companyId: 'co-1' });
    const call = findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty('actorUserId');
  });
});
