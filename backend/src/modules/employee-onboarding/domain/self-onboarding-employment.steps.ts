// Employment org fields — employee declares via Telegram buttons; HR approves before apply.

export interface DeclaredCompanyTeam {
  companyId: string;
  companyName: string;
  teamId?: string;
  teamName?: string;
  teamSkipped?: boolean;
}

export interface EmploymentDeclaration {
  declaredDepartment?: string;
  declaredPosition?: string;
  declaredWorkLocation?: 'office' | 'wfh';
  declaredOfficeType?: 'front_office' | 'back_office';
  /** Team per company — primary + extras the employee works for. */
  companyTeams?: DeclaredCompanyTeam[];
  /** Loop: ask after each batch of company teams whether to add another company. */
  addAnotherCompany?: 'yes' | 'no';
  /** @deprecated legacy single-company fields */
  declaredTeamId?: string;
  declaredTeamName?: string;
  hasAdditionalTeam?: 'yes' | 'no';
  declaredAdditionalTeamId?: string;
  declaredAdditionalTeamName?: string;
}

export interface EmploymentWizardContext {
  primaryCompanyId: string;
  seededCompanyIds: string[];
  companyNameById: Map<string, string>;
  availableCompanyIds: string[];
}

export const TELEGRAM_DEPARTMENT_OPTIONS = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'HR', label: 'HR / เลขา' },
  { value: 'Finance', label: 'Finance' },
  { value: 'IT', label: 'IT' },
  { value: 'Operations', label: 'Operations' },
] as const;

export const TELEGRAM_POSITION_OPTIONS = [
  { value: 'employee', label: 'พนักงาน' },
  { value: 'admin', label: 'แอดมิน' },
  { value: 'telesales', label: 'เทเลเซล' },
  { value: 'supervisor', label: 'หัวหน้างาน' },
] as const;

export type EmploymentStepType =
  | 'department_picker'
  | 'position_picker'
  | 'team_picker'
  | 'company_picker'
  | 'boolean'
  | 'work_location_picker'
  | 'office_type_picker';

export interface EmploymentWizardStep {
  stepKey: string;
  label: string;
  type: EmploymentStepType;
  companyId?: string;
  skippable?: boolean;
}

function isMarketingDepartment(department?: string): boolean {
  return (department ?? '').toLowerCase() === 'marketing';
}

function isAdminDepartment(department?: string): boolean {
  return (department ?? '').toLowerCase() === 'admin';
}

function companyTeamRow(
  data: EmploymentDeclaration,
  companyId: string,
): DeclaredCompanyTeam | undefined {
  return data.companyTeams?.find((row) => row.companyId === companyId);
}

function companyTeamComplete(
  data: EmploymentDeclaration,
  companyId: string,
): boolean {
  const row = companyTeamRow(data, companyId);
  return Boolean(row?.teamId || row?.teamSkipped);
}

function seededCompaniesComplete(data: EmploymentDeclaration, ctx: EmploymentWizardContext): boolean {
  return ctx.seededCompanyIds.every((id) => companyTeamComplete(data, id));
}

function extraCompaniesComplete(data: EmploymentDeclaration, ctx: EmploymentWizardContext): boolean {
  const extras = (data.companyTeams ?? []).filter(
    (row) => !ctx.seededCompanyIds.includes(row.companyId),
  );
  return extras.every((row) => Boolean(row.teamId || row.teamSkipped));
}

function undeclaredCompanyIds(data: EmploymentDeclaration, ctx: EmploymentWizardContext): string[] {
  const declared = new Set((data.companyTeams ?? []).map((row) => row.companyId));
  return ctx.availableCompanyIds.filter((id) => !declared.has(id));
}

export function buildEmploymentWizardSteps(
  data: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): EmploymentWizardStep[] {
  const steps: EmploymentWizardStep[] = [];
  const marketing = isMarketingDepartment(data.declaredDepartment);

  if (!data.declaredDepartment) {
    return [{ stepKey: 'dept', label: 'แผนกที่สังกัด', type: 'department_picker' }];
  }
  if (!data.declaredPosition) {
    return [{ stepKey: 'pos', label: 'ตำแหน่ง', type: 'position_picker' }];
  }

  for (const companyId of ctx.seededCompanyIds) {
    if (!companyTeamComplete(data, companyId)) {
      const name = ctx.companyNameById.get(companyId) ?? companyId;
      steps.push({
        stepKey: `team:${companyId}`,
        label: `ทีมที่ ${name}`,
        type: 'team_picker',
        companyId,
        skippable: !marketing,
      });
    }
  }

  for (const row of data.companyTeams ?? []) {
    if (ctx.seededCompanyIds.includes(row.companyId)) continue;
    if (!row.teamId && !row.teamSkipped) {
      steps.push({
        stepKey: `team:${row.companyId}`,
        label: `ทีมที่ ${row.companyName}`,
        type: 'team_picker',
        companyId: row.companyId,
        skippable: !marketing,
      });
    }
  }

  const seededDone = seededCompaniesComplete(data, ctx);
  const extrasDone = extraCompaniesComplete(data, ctx);
  const remaining = undeclaredCompanyIds(data, ctx);

  if (seededDone && extrasDone && remaining.length > 0) {
    if (data.addAnotherCompany !== 'yes' && data.addAnotherCompany !== 'no') {
      steps.push({
        stepKey: 'addAnother',
        label: 'ทำงานบริษัทอื่นด้วยไหม?',
        type: 'boolean',
      });
    } else if (data.addAnotherCompany === 'yes') {
      const pendingPick = (data.companyTeams ?? []).some(
        (row) => !ctx.seededCompanyIds.includes(row.companyId) && !row.teamId && !row.teamSkipped,
      );
      if (!pendingPick) {
        steps.push({
          stepKey: 'pickCompany',
          label: 'เลือกบริษัทเพิ่ม',
          type: 'company_picker',
        });
      }
    }
  }

  const orgComplete = seededDone && extrasDone
    && (data.addAnotherCompany === 'no' || remaining.length === 0);

  if (orgComplete) {
    if (!data.declaredWorkLocation) {
      steps.push({ stepKey: 'loc', label: 'ทำงานที่', type: 'work_location_picker' });
    }
    if (isAdminDepartment(data.declaredDepartment) && !data.declaredOfficeType) {
      steps.push({
        stepKey: 'office',
        label: 'ค่าคอมแอดมิน (Front/Back)',
        type: 'office_type_picker',
      });
    }
  }

  return steps;
}

export function employmentStepComplete(
  step: EmploymentWizardStep,
  data: EmploymentDeclaration,
): boolean {
  switch (step.type) {
    case 'department_picker':
      return Boolean(data.declaredDepartment);
    case 'position_picker':
      return Boolean(data.declaredPosition);
    case 'team_picker':
      return step.companyId ? companyTeamComplete(data, step.companyId) : false;
    case 'boolean':
      return data.addAnotherCompany === 'yes' || data.addAnotherCompany === 'no';
    case 'company_picker':
      return (data.companyTeams ?? []).some(
        (row) => !row.teamId && !row.teamSkipped,
      );
    case 'work_location_picker':
      return Boolean(data.declaredWorkLocation);
    case 'office_type_picker':
      return Boolean(data.declaredOfficeType);
    default:
      return false;
  }
}

export function activeEmploymentSteps(
  data: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): EmploymentWizardStep[] {
  return buildEmploymentWizardSteps(data, ctx);
}

export function computeEmploymentStepIndex(
  data: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): number {
  const steps = buildEmploymentWizardSteps(data, ctx);
  for (let i = 0; i < steps.length; i += 1) {
    if (!employmentStepComplete(steps[i], data)) return i;
  }
  return steps.length;
}

export function isEmploymentDeclarationComplete(
  data: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): boolean {
  const steps = buildEmploymentWizardSteps(data, ctx);
  return steps.length > 0 && steps.every((step) => employmentStepComplete(step, data));
}

/** Migrate legacy single-team declarations into companyTeams. */
export function normalizeEmploymentDeclaration(
  data: EmploymentDeclaration,
  ctx: EmploymentWizardContext,
): EmploymentDeclaration {
  const out: EmploymentDeclaration = { ...data, companyTeams: [...(data.companyTeams ?? [])] };
  const primaryId = ctx.seededCompanyIds[0] ?? ctx.primaryCompanyId;
  const primaryName = ctx.companyNameById.get(primaryId) ?? primaryId;

  if (data.declaredTeamId && !out.companyTeams?.some((r) => r.companyId === primaryId)) {
    out.companyTeams = [
      ...(out.companyTeams ?? []),
      {
        companyId: primaryId,
        companyName: primaryName,
        teamId: data.declaredTeamId,
        teamName: data.declaredTeamName,
      },
    ];
  }

  if (
    data.hasAdditionalTeam === 'yes'
    && data.declaredAdditionalTeamId
    && !out.companyTeams?.some((r) => r.teamId === data.declaredAdditionalTeamId)
  ) {
    out.companyTeams = [
      ...(out.companyTeams ?? []),
      {
        companyId: primaryId,
        companyName: primaryName,
        teamId: data.declaredAdditionalTeamId,
        teamName: data.declaredAdditionalTeamName,
      },
    ];
  }

  return out;
}
