/** Sentinel stored in localStorage when viewing all accessible companies. */
export const ALL_COMPANIES_ID = '__all__';

export function isAllCompanies(companyId: string | null | undefined): boolean {
  return companyId === ALL_COMPANIES_ID;
}

export function userHasGlobalCompanyScope(me: {
  scopes: Array<{ scopeType: string }>;
  businessRole?: string | null;
  roles?: string[];
}): boolean {
  return me.scopes.some((s) => s.scopeType === 'all')
    || me.businessRole === 'owner'
    || me.businessRole === 'secretary'
    || (me.roles?.includes('owner') ?? false)
    || (me.roles?.includes('super_admin') ?? false);
}

export function resolveCompanyIds(
  companyId: string,
  companies: Array<{ id: string }>,
): string[] {
  if (isAllCompanies(companyId)) return companies.map((c) => c.id);
  if (!companyId) return [];
  return [companyId];
}

/** Pick a sensible default company scope after login / session restore. */
export function resolveDefaultCompanyId(
  me: {
    companyId: string | null;
    businessRole?: string | null;
    roles?: string[];
    scopes: Array<{ scopeType: string; companyId: string | null }>;
  },
  companies: Array<{ id: string }>,
  storedCompanyId: string,
): string {
  const stored = storedCompanyId.trim();
  if (
    stored
    && (stored === ALL_COMPANIES_ID || companies.some((c) => c.id === stored))
  ) {
    return stored;
  }

  const hasAllScope = userHasGlobalCompanyScope(me);
  if (hasAllScope && companies.length > 0) {
    return companies.length > 1 ? ALL_COMPANIES_ID : companies[0].id;
  }

  const scopedCompanyIds = me.scopes
    .filter((s) => s.scopeType === 'company' && s.companyId)
    .map((s) => s.companyId as string);
  if (scopedCompanyIds.length === 1) {
    return scopedCompanyIds[0];
  }
  if (scopedCompanyIds.length > 1) {
    const visible = scopedCompanyIds.filter((id) => companies.some((c) => c.id === id));
    if (visible.length === 1) return visible[0];
    if (visible.length > 1) return ALL_COMPANIES_ID;
  }

  if (me.companyId && companies.some((c) => c.id === me.companyId)) {
    return me.companyId;
  }
  if (companies.length === 1) return companies[0].id;
  return '';
}
