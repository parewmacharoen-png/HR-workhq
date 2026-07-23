import { useAuth } from '../context/AuthContext';

const ADD_EMPLOYEE_ROLES = new Set(['owner', 'secretary']);

/** Owner, Secretary, or platform operators with employee:write may add employees. */
export function useCanAddEmployee(): boolean {
  const { user, can } = useAuth();
  if (can('employee:write')) return true;
  if (user?.roles?.includes('super_admin')) return true;
  return !!user?.businessRole && ADD_EMPLOYEE_ROLES.has(user.businessRole);
}
