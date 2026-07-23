/** Routes that exist in App.tsx — used to hide dead quick-create links. */
export const APP_ROUTES = new Set([
  '/dashboard',
  '/my-work',
  '/requests',
  '/requests/create',
  '/requests/mine',
  '/requests/templates',
  '/approvals',
  '/hr/employees',
  '/hr/employees/new',
  '/hr/assets',
  '/hr/invitation',
  '/attendance',
  '/attendance/daily',
  '/attendance/command-center',
  '/leave',
  '/leave/requests',
  '/payroll/cycles',
  '/hr/compensation-reviews',
  '/hr/compensation-reviews/list',
  '/commission',
  '/commission/cycles',
  '/performance',
  '/reports',
  '/settings',
  '/settings/workflows',
  '/admin/workflows',
  '/settings/leave',
]);

export function isKnownRoute(path: string): boolean {
  return APP_ROUTES.has(path);
}
