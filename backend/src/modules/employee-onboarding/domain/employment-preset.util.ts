import { EmployeeWorkCategory, EmploymentStatus, RoleLevel } from '@prisma/client';
import { InvitationEmploymentPreset, InviteCompanyAssignment } from './self-onboarding.types';
import { isMarketingDepartment } from '../../organization/application/marketing-teams.bootstrap';

export const DEFAULT_PROBATION_PERIOD_DAYS = 90;

/** Maps invite / preset employment type to initial HR status. */
export function resolveInitialEmploymentFromType(employmentType?: string | null): {
  employmentType: string;
  employmentStatus: EmploymentStatus;
} {
  const type = (employmentType ?? 'full_time').trim();
  if (type === 'probation') {
    return { employmentType: 'probation', employmentStatus: 'probation' };
  }
  return { employmentType: type, employmentStatus: 'active' };
}

export function defaultProbationEndDate(hireDate: Date): Date {
  const end = new Date(hireDate);
  end.setUTCDate(end.getUTCDate() + DEFAULT_PROBATION_PERIOD_DAYS);
  return end;
}

export function mapBusinessRoleToRoleLevel(businessRole?: string): RoleLevel {
  if (businessRole === 'sub_leader') return 'sub_leader';
  if (businessRole === 'big_leader') return 'big_leader';
  return 'employee';
}

export function mapWorkLocationToCategory(workLocation?: string): EmployeeWorkCategory | undefined {
  if (workLocation === 'office' || workLocation === 'wfh') return workLocation;
  return undefined;
}

export function buildEmployeeUpdateFromPreset(
  preset: InvitationEmploymentPreset,
  departmentName?: string | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (preset.employmentType) update.employmentType = preset.employmentType;
  if (preset.position) update.position = preset.position;
  if (preset.startDate) update.hireDate = new Date(preset.startDate);
  if (departmentName) update.department = departmentName;
  const workCategory = mapWorkLocationToCategory(preset.workLocation);
  if (workCategory) update.workCategory = workCategory;
  return update;
}

export function buildAssignmentUpdateFromPreset(
  preset: InvitationEmploymentPreset,
  functionId?: string | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (preset.teamId) update.teamId = preset.teamId;
  if (preset.startDate) update.effectiveFrom = new Date(preset.startDate);
  if (functionId) update.functionId = functionId;
  update.roleLevel = mapBusinessRoleToRoleLevel(preset.businessRole);
  if (preset.teamId) update.isPrimaryTeam = true;
  return update;
}

/** Dedupe company ids — first wins as primary. */
export function normalizeInviteCompanyIds(
  companyId: string,
  additionalCompanyIds?: string[],
): { primaryCompanyId: string; additionalCompanyIds: string[] } {
  const ordered = [companyId, ...(additionalCompanyIds ?? [])].filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return {
    primaryCompanyId: unique[0] ?? companyId,
    additionalCompanyIds: unique.slice(1),
  };
}

export function allPresetCompanyIds(preset: InvitationEmploymentPreset): string[] {
  if (preset.companyAssignments?.length) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of preset.companyAssignments) {
      if (!row.companyId || seen.has(row.companyId)) continue;
      seen.add(row.companyId);
      ordered.push(row.companyId);
    }
    if (ordered.length > 0) return ordered;
  }
  const { primaryCompanyId, additionalCompanyIds } = normalizeInviteCompanyIds(
    preset.companyId,
    preset.additionalCompanyIds,
  );
  return [primaryCompanyId, ...additionalCompanyIds];
}

export function presetAssignmentForCompany(
  preset: InvitationEmploymentPreset,
  companyId: string,
): InviteCompanyAssignment {
  const fromList = preset.companyAssignments?.find((row) => row.companyId === companyId);
  if (fromList) return fromList;

  const ids = allPresetCompanyIds(preset);
  if (ids[0] === companyId) {
    return {
      companyId,
      department: preset.department,
      departmentId: preset.departmentId,
      teamId: preset.teamId,
    };
  }

  return { companyId };
}

export function buildAssignmentUpdateFromCompanyAssignment(
  preset: InvitationEmploymentPreset,
  assignment: InviteCompanyAssignment,
  functionId?: string | null,
  isPrimary = false,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (assignment.teamId) update.teamId = assignment.teamId;
  if (preset.startDate) update.effectiveFrom = new Date(preset.startDate);
  if (functionId) update.functionId = functionId;
  update.roleLevel = mapBusinessRoleToRoleLevel(preset.businessRole);
  if (assignment.teamId) update.isPrimaryTeam = isPrimary;
  return update;
}

type FunctionLookup = {
  function: {
    findFirst(args: {
      where: { id: string; deletedAt: null } | { code: string; deletedAt: null };
      select: { id: true; name: true };
    }): Promise<{ id: string; name: string } | null>;
  };
};

/** Resolve employee.department label + assignment.functionId for one company row. */
export async function resolveCompanyOrgContext(
  prisma: FunctionLookup,
  assignment: Pick<InviteCompanyAssignment, 'department' | 'departmentId'>,
): Promise<{ departmentName: string | null; functionId: string | null }> {
  if (assignment.departmentId) {
    const fn = await prisma.function.findFirst({
      where: { id: assignment.departmentId, deletedAt: null },
      select: { id: true, name: true },
    });
    return {
      departmentName: fn?.name ?? null,
      functionId: fn?.id ?? assignment.departmentId,
    };
  }

  const department = assignment.department?.trim() || null;
  if (!department) return { departmentName: null, functionId: null };

  if (isMarketingDepartment(department)) {
    const fn = await prisma.function.findFirst({
      where: { code: 'marketing', deletedAt: null },
      select: { id: true, name: true },
    });
    return { departmentName: department, functionId: fn?.id ?? null };
  }

  return { departmentName: department, functionId: null };
}

/** Resolve org context for the primary company on a preset (legacy helper). */
export async function resolvePresetOrgContext(
  prisma: FunctionLookup,
  preset: InvitationEmploymentPreset,
): Promise<{ departmentName: string | null; functionId: string | null }> {
  const primaryCompanyId = allPresetCompanyIds(preset)[0];
  if (!primaryCompanyId) {
    return resolveCompanyOrgContext(prisma, preset);
  }
  return resolveCompanyOrgContext(prisma, presetAssignmentForCompany(preset, primaryCompanyId));
}
