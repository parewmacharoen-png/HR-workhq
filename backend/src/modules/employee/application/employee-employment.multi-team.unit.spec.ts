import { EmployeeEmploymentService } from './employee-employment.service';
import { EmployeeAssignment } from '../domain/entities/employee-assignment.entity';
import { allTeamIdsFor, extraTeamIdsFor } from '../domain/services/company-teams.util';

type Row = {
  id: string;
  employeeId: string;
  companyId: string;
  teamId: string | null;
  functionId: string | null;
  roleLevel: string;
  isPrimaryCompany: boolean;
  isPrimaryTeam: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  deletedAt: Date | null;
};

/** In-memory employee_assignments that enforces the two partial unique indexes on every write. */
function fakeAssignments(initial: Array<Partial<Row> & Pick<Row, 'id' | 'companyId'>>) {
  let seq = 0;
  const rows: Row[] = initial.map((r) => ({
    employeeId: 'emp-1',
    teamId: null,
    functionId: null,
    roleLevel: 'employee',
    isPrimaryCompany: false,
    isPrimaryTeam: false,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    deletedAt: null,
    ...r,
  }));
  const open = () => rows.filter((r) => r.effectiveTo === null && r.deletedAt === null);
  const checkUniques = () => {
    expect(open().filter((r) => r.isPrimaryCompany).length).toBeLessThanOrEqual(1);
    for (const companyId of new Set(open().map((r) => r.companyId))) {
      expect(open().filter((r) => r.companyId === companyId && r.isPrimaryTeam).length).toBeLessThanOrEqual(1);
    }
  };
  const prisma = {
    employeeAssignment: {
      findMany: jest.fn(async () => open().map((r) => ({ ...r }))
        .sort((a, b) => Number(b.isPrimaryTeam) - Number(a.isPrimaryTeam))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        const { updatedBy: _ignored, ...rest } = data as Partial<Row> & { updatedBy?: string };
        Object.assign(row, rest);
        checkUniques();
        return row;
      }),
    },
  };
  const repo = {
    save: jest.fn(async (entity: EmployeeAssignment) => {
      const p = entity.toPersistence();
      Object.assign(rows.find((r) => r.id === p.id)!, p);
      checkUniques();
    }),
  };
  const employeeService = {
    assign: jest.fn(async (_actor: unknown, employeeId: string, dto: { companyId: string; teamId?: string }) => {
      rows.push({
        id: `new-${++seq}`,
        employeeId,
        companyId: dto.companyId,
        teamId: dto.teamId ?? null,
        functionId: null,
        roleLevel: 'employee',
        isPrimaryCompany: false,
        isPrimaryTeam: false,
        effectiveFrom: new Date('2026-10-07'),
        effectiveTo: null,
        deletedAt: null,
      });
    }),
  };
  return { rows, open, prisma, repo, employeeService };
}

function buildService(fake: ReturnType<typeof fakeAssignments>) {
  return new EmployeeEmploymentService(
    fake.prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { ensureDefaultDayShiftIfUnassigned: jest.fn().mockResolvedValue(undefined) } as never,
    fake.repo as never,
    fake.employeeService as never,
    {} as never,
  );
}

const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'kw' };

async function sync(
  fake: ReturnType<typeof fakeAssignments>,
  rows: Array<{ companyId: string; teamId?: string | null; extraTeamIds?: string[] }>,
  primaryCompanyId = 'kw',
) {
  const service = buildService(fake) as unknown as {
    syncCompanyAssignments: (...args: unknown[]) => Promise<void>;
  };
  await service.syncCompanyAssignments(actor, 'emp-1', primaryCompanyId, rows, '2026-10-07');
}

const summary = (fake: ReturnType<typeof fakeAssignments>) => fake.open()
  .map((r) => `${r.companyId}:${r.teamId}${r.isPrimaryTeam ? '*' : ''}${r.isPrimaryCompany ? '!' : ''}`)
  .sort();

describe('company-teams util', () => {
  it('drops blanks, duplicates and the primary team from extras', () => {
    expect(extraTeamIdsFor({ teamId: 't1', extraTeamIds: ['t2', 't1', '', 't2', 't3'] })).toEqual(['t2', 't3']);
    expect(allTeamIdsFor({ teamId: 't1', extraTeamIds: ['t2'] })).toEqual(['t1', 't2']);
    expect(allTeamIdsFor({ teamId: null, extraTeamIds: [] })).toEqual([]);
  });
});

describe('EmployeeEmploymentService.syncCompanyAssignments — several teams per company', () => {
  it('adds extra teams in the same company without touching the primary row', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't1', extraTeamIds: ['t3'] }]);
    expect(summary(fake)).toEqual(['kw:t1*!', 'kw:t3']);
    expect(fake.employeeService.assign).toHaveBeenCalledTimes(1);
  });

  it('supports teams across companies, each company with its own primary team', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
    ]);
    await sync(fake, [
      { companyId: 'kw', teamId: 't1', extraTeamIds: ['t3'] },
      { companyId: 'sb', teamId: 's1', extraTeamIds: ['s2'] },
    ]);
    expect(summary(fake)).toEqual(['kw:t1*!', 'kw:t3', 'sb:s1*', 'sb:s2']);
  });

  it('removes an un-ticked extra team and keeps the rest', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
      { id: 'a2', companyId: 'kw', teamId: 't3' },
      { id: 'a3', companyId: 'kw', teamId: 't4' },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't1', extraTeamIds: ['t4'] }]);
    expect(summary(fake)).toEqual(['kw:t1*!', 'kw:t4']);
    expect(fake.rows.find((r) => r.id === 'a2')!.effectiveTo).not.toBeNull();
  });

  it('swaps the primary team to a current extra team, moving both flags', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
      { id: 'a2', companyId: 'kw', teamId: 't3' },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't3', extraTeamIds: ['t1'] }]);
    expect(summary(fake)).toEqual(['kw:t1', 'kw:t3*!']);
  });

  it('changing the only team updates the row in place (keeps history and role level)', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true, roleLevel: 'sub_leader' },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't2', extraTeamIds: [] }]);
    expect(summary(fake)).toEqual(['kw:t2*!']);
    expect(fake.open()[0]).toMatchObject({ id: 'a1', roleLevel: 'sub_leader' });
    expect(fake.employeeService.assign).not.toHaveBeenCalled();
  });

  it('keeps existing extra teams when the request omits extraTeamIds (older clients)', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
      { id: 'a2', companyId: 'kw', teamId: 't3' },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't1' }]);
    expect(summary(fake)).toEqual(['kw:t1*!', 'kw:t3']);
  });

  it('closes every team row of a company that was un-ticked', async () => {
    const fake = fakeAssignments([
      { id: 'a1', companyId: 'kw', teamId: 't1', isPrimaryCompany: true, isPrimaryTeam: true },
      { id: 'b1', companyId: 'sb', teamId: 's1', isPrimaryTeam: true },
      { id: 'b2', companyId: 'sb', teamId: 's2' },
    ]);
    await sync(fake, [{ companyId: 'kw', teamId: 't1', extraTeamIds: [] }]);
    expect(summary(fake)).toEqual(['kw:t1*!']);
  });
});
