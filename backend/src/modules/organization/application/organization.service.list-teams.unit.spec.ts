import { OrganizationService } from './organization.service';
import { ensureMarketingTeamsForCompany } from './marketing-teams.bootstrap';

jest.mock('./marketing-teams.bootstrap', () => ({
  ensureMarketingTeamsForCompany: jest.fn().mockResolvedValue(undefined),
  isMarketingDepartment: (d?: string | null) => (d ?? '').trim().toLowerCase() === 'marketing',
}));

function team(id: string, name: string) {
  return { toPersistence: () => ({ id, companyId: 'kw', name, parentTeamId: null }) };
}

describe('OrganizationService.listTeams', () => {
  const ensure = ensureMarketingTeamsForCompany as jest.Mock;

  beforeEach(() => ensure.mockClear());

  function build(listByCompany: jest.Mock) {
    return new OrganizationService({} as never, { listByCompany } as never, {} as never, {} as never);
  }

  it('creates the default teams when a company has none, so the team picker is not empty', async () => {
    const listByCompany = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([team('t1', 'Team 1'), team('t2', 'Team 2')]);

    const result = await build(listByCompany).listTeams('kw');

    expect(ensure).toHaveBeenCalledWith(expect.anything(), 'kw');
    expect(result.map((t) => t.name)).toEqual(['Team 1', 'Team 2']);
  });

  it('leaves existing teams alone for non-Marketing departments', async () => {
    const listByCompany = jest.fn().mockResolvedValue([team('t1', 'Team 1'), team('a1', 'Admin')]);

    const result = await build(listByCompany).listTeams('kw', 'Admin');

    expect(ensure).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});
