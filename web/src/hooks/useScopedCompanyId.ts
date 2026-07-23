import { useMemo, useState } from 'react';
import { useCompanyScope } from './useCompanyScope';

/**
 * Resolves a concrete company id for API calls and forms.
 * When global scope is "all companies", picks the first accessible company
 * unless the user selects one via the local picker.
 */
export function useScopedCompanyId() {
  const scope = useCompanyScope();
  const [localCompanyId, setLocalCompanyId] = useState('');

  const companyId = useMemo(() => {
    if (!scope.hasCompanyScope) return '';
    if (scope.isAllCompanies) {
      if (localCompanyId && scope.scopedCompanyIds.includes(localCompanyId)) {
        return localCompanyId;
      }
      return scope.scopedCompanyIds[0] ?? '';
    }
    return scope.scopedCompanyIds[0] ?? '';
  }, [
    scope.hasCompanyScope,
    scope.isAllCompanies,
    scope.scopedCompanyIds,
    localCompanyId,
  ]);

  const needsLocalPicker = scope.isAllCompanies && scope.scopedCompanyIds.length > 1;

  return {
    ...scope,
    companyId,
    localCompanyId: needsLocalPicker ? companyId : scope.companyId,
    setLocalCompanyId,
    needsLocalPicker,
  };
}
