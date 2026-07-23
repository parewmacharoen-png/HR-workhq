// ============================================================================
// modules/workday/application/workday-scope.service.unit.spec.ts
// ============================================================================

import { WorkDayScopeService } from './workday-scope.service';
import { TeamCalendarScopeService } from '../../calendar/application/team-calendar-scope.service';

describe('WorkDayScopeService', () => {
  it('returns scoped employee ids for big leader team', async () => {
    const calendarScope = {
      resolve: jest.fn().mockResolvedValue({
        role: 'big_leader',
        companyId: 'co-1',
        employeeIds: ['emp-a', 'emp-b'],
      }),
    } as unknown as TeamCalendarScopeService;
    const prisma = { employee: { findMany: jest.fn() } };
    const service = new WorkDayScopeService(calendarScope, prisma as never);
    const ids = await service.resolveEmployeeIds(
      { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' },
      'co-1',
    );
    expect(ids).toEqual(['emp-a', 'emp-b']);
  });

  it('returns all company employees when secretary has null employeeIds', async () => {
    const calendarScope = {
      resolve: jest.fn().mockResolvedValue({
        role: 'secretary',
        companyId: 'co-1',
        employeeIds: null,
      }),
    } as unknown as TeamCalendarScopeService;
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }]),
      },
    };
    const service = new WorkDayScopeService(calendarScope, prisma as never);
    const ids = await service.resolveEmployeeIds(
      { userId: 'u-2', impersonatorUserId: null, companyId: 'co-1' },
      'co-1',
    );
    expect(ids).toEqual(['emp-1', 'emp-2']);
  });
});
