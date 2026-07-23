import { useCallback, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import { extractReferenceCode } from '../../../lib/sanitize-api-error';
import type { PageState } from '../states/WorkHQPageState';

export interface UseWorkHQPageStateOptions {
  permissionDenied?: boolean;
  loading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
}

export interface UseWorkHQPageStateResult {
  pageState: PageState;
  referenceCode?: string;
  clearError: () => void;
  setError: (err: unknown) => void;
  setLoading: (v: boolean) => void;
}

export function useWorkHQPageState(options: UseWorkHQPageStateOptions = {}): UseWorkHQPageStateResult {
  const [error, setErrorState] = useState<unknown>(options.error);
  const [loading, setLoading] = useState(options.loading ?? false);

  const pageState = useMemo((): PageState => {
    if (options.permissionDenied) return 'permissionDenied';
    if (loading) return 'loading';
    if (error) return 'error';
    if (options.isEmpty) return 'empty';
    return 'success';
  }, [options.permissionDenied, loading, error, options.isEmpty]);

  const referenceCode = useMemo(() => {
    if (error instanceof ApiError) return error.requestId;
    return extractReferenceCode(error);
  }, [error]);

  const clearError = useCallback(() => setErrorState(undefined), []);
  const setError = useCallback((err: unknown) => setErrorState(err), []);

  return { pageState, referenceCode, clearError, setError, setLoading };
}
