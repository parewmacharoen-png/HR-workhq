import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ALL_COMPANIES_ID, isAllCompanies, resolveCompanyIds, userHasGlobalCompanyScope } from '../constants/company';

export function useCompanyScope() {
  const { user, companies, companyId, selectCompany } = useAuth();

  const effectiveCompanyId = useMemo(() => {
    if (companyId) return companyId;
    if (user && userHasGlobalCompanyScope(user) && companies.length > 0) {
      return companies.length > 1 ? ALL_COMPANIES_ID : companies[0].id;
    }
    return '';
  }, [companyId, user, companies]);

  const scopedCompanyIds = useMemo(
    () => resolveCompanyIds(effectiveCompanyId, companies),
    [effectiveCompanyId, companies],
  );

  const hasCompanyScope = scopedCompanyIds.length > 0;
  const isAll = isAllCompanies(effectiveCompanyId);

  const companyLabel = useMemo(() => {
    if (isAll) return 'ทุกบริษัท';
    const match = companies.find((c) => c.id === effectiveCompanyId);
    return match ? `${match.name} (${match.code})` : '';
  }, [effectiveCompanyId, companies, isAll]);

  return {
    companies,
    companyId: effectiveCompanyId,
    selectCompany,
    isAllCompanies: isAll,
    scopedCompanyIds,
    hasCompanyScope,
    companyLabel,
  };
}
