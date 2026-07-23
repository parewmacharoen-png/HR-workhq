import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchApprovalHubSummary } from '../api/approval';
import { getRequestDashboard } from '../api/request-platform';
import { useAuth } from '../context/AuthContext';
import { useCompanyScope } from './useCompanyScope';

export interface NavNotificationCounts {
  requests: number;
  approvals: number;
}

const EMPTY: NavNotificationCounts = { requests: 0, approvals: 0 };
const POLL_MS = 60_000;

export function formatNavBadgeCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export function navBadgeCountForPath(path: string, counts: NavNotificationCounts): number {
  if (path === '/requests' || path.startsWith('/requests/')) return counts.requests;
  if (path === '/approvals' || path.startsWith('/approvals/')) return counts.approvals;
  return 0;
}

export function useNavNotificationCounts(): NavNotificationCounts {
  const { can } = useAuth();
  const { companyId, isAllCompanies, scopedCompanyIds, hasCompanyScope } = useCompanyScope();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<NavNotificationCounts>(EMPTY);

  const refresh = useCallback(async () => {
    if (!hasCompanyScope) {
      setCounts(EMPTY);
      return;
    }

    const companyIds = isAllCompanies ? scopedCompanyIds : companyId ? [companyId] : [];
    if (!companyIds.length) {
      setCounts(EMPTY);
      return;
    }

    const canReadRequests = can('workflow:read');
    const canActApprovals = can('workflow:act');

    const [dashboards, summaries] = await Promise.all([
      canReadRequests
        ? Promise.all(companyIds.map((id) => getRequestDashboard(id).catch(() => null)))
        : Promise.resolve([]),
      canActApprovals
        ? Promise.all(companyIds.map((id) => fetchApprovalHubSummary(id).catch(() => null)))
        : Promise.resolve([]),
    ]);

    setCounts({
      requests: dashboards.reduce((sum, row) => sum + (row?.pendingApproval ?? 0), 0),
      approvals: summaries.reduce((sum, row) => sum + (row?.pendingTotal ?? 0), 0),
    });
  }, [can, companyId, hasCompanyScope, isAllCompanies, scopedCompanyIds]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, pathname]);

  return counts;
}
