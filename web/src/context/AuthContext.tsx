import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  clearToken,
  fetchCompanies,
  fetchMe,
  getCompanyId,
  login as apiLogin,
  setCompanyId,
  setToken,
  type CompanyOption,
  type MeResponse,
} from '../api/client';
import { ALL_COMPANIES_ID, resolveDefaultCompanyId, userHasGlobalCompanyScope } from '../constants/company';

interface AuthContextValue {
  user: MeResponse | null;
  companies: CompanyOption[];
  companyId: string;
  loading: boolean;
  error: string;
  /** True when the logged-in user has a linked employee profile (workforce member). */
  isWorkforceMember: boolean;
  /** True for super_admin / scope:all operators without an employee record. */
  isPlatformOperator: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  selectCompany: (id: string) => void;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyIdState] = useState(getCompanyId());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const me = await fetchMe();
      setUser(me);
      const hasAllScope = userHasGlobalCompanyScope(me);
      let list: CompanyOption[] = [];
      if (hasAllScope || me.permissions.includes('organization:read')) {
        list = await fetchCompanies();
        setCompanies(list);
      } else {
        setCompanies([]);
      }
      const resolved = resolveDefaultCompanyId(me, list, getCompanyId());
      if (resolved) {
        setCompanyId(resolved);
        setCompanyIdState(resolved);
      } else if (hasAllScope && list.length > 1) {
        setCompanyId(ALL_COMPANIES_ID);
        setCompanyIdState(ALL_COMPANIES_ID);
      }
    } catch (err) {
      setUser(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (loading || !user || companyId) return;
    if (!userHasGlobalCompanyScope(user) || companies.length === 0) return;
    const next = companies.length > 1 ? ALL_COMPANIES_ID : companies[0].id;
    setCompanyId(next);
    setCompanyIdState(next);
  }, [loading, user, companyId, companies]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    setToken(result.accessToken);
    setLoading(true);
    setError('');
    try {
      const me = await fetchMe();
      setUser(me);
      const hasAllScope = userHasGlobalCompanyScope(me);
      let list: CompanyOption[] = [];
      if (hasAllScope || me.permissions.includes('organization:read')) {
        try {
          list = await fetchCompanies();
          setCompanies(list);
        } catch {
          setCompanies([]);
        }
      } else {
        setCompanies([]);
      }
      const resolved = resolveDefaultCompanyId(me, list, getCompanyId());
      if (resolved) {
        setCompanyId(resolved);
        setCompanyIdState(resolved);
      } else if (hasAllScope && list.length > 1) {
        setCompanyId(ALL_COMPANIES_ID);
        setCompanyIdState(ALL_COMPANIES_ID);
      }
    } catch (err) {
      clearToken();
      setUser(null);
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'เข้าสู่ระบบไม่สำเร็จ';
      throw new ApiError(message, err instanceof ApiError ? err.status : 500);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setCompanies([]);
    window.location.href = '/login';
  }, []);

  const selectCompany = useCallback((id: string) => {
    setCompanyId(id);
    setCompanyIdState(id);
  }, []);

  const hasAllScope = Boolean(user && userHasGlobalCompanyScope(user));

  const can = useCallback((permission: string) => {
    if (hasAllScope) return true;
    return user?.permissions.includes(permission) ?? false;
  }, [user, hasAllScope]);

  const canAny = useCallback((...permissions: string[]) => {
    if (hasAllScope) return true;
    return permissions.some((p) => user?.permissions.includes(p));
  }, [user, hasAllScope]);

  const isWorkforceMember = Boolean(user?.employeeId);
  const isPlatformOperator = Boolean(
    user
    && !user.employeeId
    && (
      user.permissions.includes('scope:all')
      || user.roles.some((r) => r === 'super_admin' || r === 'owner')
    ),
  );

  const value = useMemo(() => ({
    user,
    companies,
    companyId,
    loading,
    error,
    isWorkforceMember,
    isPlatformOperator,
    login,
    logout,
    refresh: bootstrap,
    selectCompany,
    can,
    canAny,
  }), [
    user,
    companies,
    companyId,
    loading,
    error,
    isWorkforceMember,
    isPlatformOperator,
    login,
    logout,
    bootstrap,
    selectCompany,
    can,
    canAny,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useCompanyId(): string {
  const { companyId } = useAuth();
  return companyId === ALL_COMPANIES_ID ? '' : companyId;
}
