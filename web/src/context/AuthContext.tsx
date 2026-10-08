import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ApiError,
  clearToken,
  fetchCompanies,
  fetchMe,
  getAuthToken,
  getCompanyId,
  login as apiLogin,
  refreshSession,
  setCompanyId,
  setToken,
  type CompanyOption,
  type MeResponse,
} from '../api/client';
import { ALL_COMPANIES_ID, resolveDefaultCompanyId, userHasGlobalCompanyScope } from '../constants/company';
import { isServerUnavailableError, shouldRefreshToken } from '../lib/session-token';

/** Waits between retries while the API wakes up or restarts after a deploy (~1.5 minutes in all). */
const SERVER_RETRY_DELAYS_MS = [3_000, 5_000, 10_000, 15_000, 20_000, 30_000];

async function fetchMeWhenServerReady(): Promise<MeResponse> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchMe();
    } catch (err) {
      if (!isServerUnavailableError(err) || attempt >= SERVER_RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, SERVER_RETRY_DELAYS_MS[attempt]));
    }
  }
}

interface AuthContextValue {
  user: MeResponse | null;
  companies: CompanyOption[];
  companyId: string;
  loading: boolean;
  error: string;
  /** True when a saved login exists but the server could not be reached to check it. */
  serverUnavailable: boolean;
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
  const [serverUnavailable, setServerUnavailable] = useState(false);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');
    setServerUnavailable(false);
    try {
      if (!getAuthToken()) {
        setUser(null);
        return;
      }
      const me = await fetchMeWhenServerReady();
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
      // Keep the saved login: the server is down or still starting, not rejecting it.
      if (isServerUnavailableError(err) && getAuthToken()) setServerUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Renew the token while the app is open so an active session never runs out.
  useEffect(() => {
    if (!user) return;
    const renewIfDue = () => {
      const token = getAuthToken();
      if (token && shouldRefreshToken(token)) void refreshSession().catch(() => undefined);
    };
    renewIfDue();
    const timer = window.setInterval(renewIfDue, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') renewIfDue(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

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
    serverUnavailable,
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
    serverUnavailable,
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
