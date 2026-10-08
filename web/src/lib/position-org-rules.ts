/**
 * What the employment form asks for, depending on the position picked first.
 * - `teams`: 'none' (no team), 'single' (one team per company), 'multi' (several teams per
 *   company), 'all' (covers every team in the company, nothing to pick).
 * - `allCompanies`: works for every company, so no company is picked.
 * - `department`: filled in automatically; null = HR picks it.
 * - `businessRole`: login role that matches the position.
 */
export interface PositionOrgRule {
  teams: 'none' | 'single' | 'multi' | 'all';
  allCompanies: boolean;
  department: string | null;
  businessRole: string | null;
}

const RULES: Record<string, PositionOrgRule> = {
  หัวหน้าทีมใหญ่: { teams: 'all', allCompanies: false, department: 'Marketing', businessRole: 'big_leader' },
  หัวหน้าทีมย่อย: { teams: 'single', allCompanies: false, department: 'Marketing', businessRole: 'sub_leader' },
  พนักงาน: { teams: 'multi', allCompanies: false, department: 'Marketing', businessRole: 'employee' },
  แอดมิน: { teams: 'none', allCompanies: false, department: 'Admin', businessRole: 'admin' },
  เลขา: { teams: 'none', allCompanies: true, department: 'เลขา', businessRole: 'secretary' },
  ออดิท: { teams: 'none', allCompanies: true, department: 'ออดิท', businessRole: null },
};

/** Before a position is picked, keep the old free form (pick department and teams). */
const DEFAULT_RULE: PositionOrgRule = { teams: 'multi', allCompanies: false, department: null, businessRole: null };

export function positionOrgRule(position: string | null | undefined): PositionOrgRule {
  return (position && RULES[position]) || DEFAULT_RULE;
}

interface OrgSelection {
  department: string;
  teamId: string;
  extraTeamIds?: string[];
}

/** Rows after the position changes: department from the position, teams the position can't have cleared. */
export function applyPositionToOrg<T extends OrgSelection>(
  rule: PositionOrgRule,
  companyIds: string[],
  prev: Record<string, T>,
): Record<string, OrgSelection> {
  const out: Record<string, OrgSelection> = { ...prev };
  for (const cid of companyIds) {
    const cur: OrgSelection = prev[cid] ?? { department: '', teamId: '', extraTeamIds: [] };
    const department = rule.department ?? cur.department;
    const keepTeams = (rule.teams === 'single' || rule.teams === 'multi') && department === cur.department;
    out[cid] = {
      department,
      teamId: keepTeams ? cur.teamId : '',
      extraTeamIds: keepTeams && rule.teams === 'multi' ? (cur.extraTeamIds ?? []) : [],
    };
  }
  return out;
}

/**
 * Teams to save per company. หัวหน้าทีมใหญ่ ('all') gets every team in the company, fetched
 * with `listTeams`; 'none' saves no team; 'single' drops extra teams.
 */
export async function resolveTeamsForSave<T extends OrgSelection>(
  rule: PositionOrgRule,
  companyIds: string[],
  orgById: Record<string, T>,
  listTeams: (companyId: string, department?: string) => Promise<Array<{ id: string }>>,
): Promise<Record<string, OrgSelection>> {
  const out: Record<string, OrgSelection> = {};
  await Promise.all(companyIds.map(async (cid) => {
    const org: OrgSelection = orgById[cid] ?? { department: '', teamId: '' };
    if (rule.teams === 'none') {
      out[cid] = { ...org, teamId: '', extraTeamIds: [] };
    } else if (rule.teams === 'all') {
      const all = (await listTeams(cid, rule.department ?? undefined)).map((t) => t.id);
      out[cid] = { ...org, teamId: all[0] ?? '', extraTeamIds: all.slice(1) };
    } else if (rule.teams === 'single') {
      out[cid] = { ...org, extraTeamIds: [] };
    } else {
      out[cid] = org;
    }
  }));
  return out;
}
