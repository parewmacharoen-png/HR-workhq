// ============================================================================
// modules/employee/domain/services/company-teams.util.ts
// An employee can work in several teams of the same company. Requests carry
// the primary team as `teamId` and the rest as `extraTeamIds`; these helpers
// normalise that into a de-duplicated list.
// ============================================================================

export interface CompanyTeamsInput {
  teamId?: string | null;
  extraTeamIds?: string[] | null;
}

/** Extra teams minus blanks, duplicates and the primary team itself. */
export function extraTeamIdsFor(row: CompanyTeamsInput): string[] {
  const primary = row.teamId || null;
  return [...new Set((row.extraTeamIds ?? []).filter((id) => id && id !== primary))];
}

/** Every team in the company, primary first. */
export function allTeamIdsFor(row: CompanyTeamsInput): string[] {
  const primary = row.teamId || null;
  return primary ? [primary, ...extraTeamIdsFor(row)] : extraTeamIdsFor(row);
}
