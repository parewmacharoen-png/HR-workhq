import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPayrollCycles, type PayrollCycle } from '../api/payroll';
import { useAuth, useCompanyId } from '../context/AuthContext';
import { findPayrollCycleForCompany, payrollCycleCompanyLabel } from '../utils/payroll-cycle-company-sync';

interface Options {
  cycle: PayrollCycle | null;
  /** Base path without cycle id, e.g. `/payroll/cycles` */
  basePath?: string;
}

/**
 * When the user changes "ขอบเขตงาน" while viewing a payroll cycle, jump to the
 * matching cycle (same period) for the newly selected company.
 */
export function usePayrollCycleCompanySync({ cycle, basePath = '/payroll/cycles' }: Options) {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const { companies } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [noMatchingCycle, setNoMatchingCycle] = useState(false);

  const cycleCompanyLabel = cycle
    ? payrollCycleCompanyLabel(companies, cycle.companyId)
    : '';
  const scopeMismatch = Boolean(
    cycle && companyId && cycle.companyId !== companyId,
  );

  useEffect(() => {
    if (!cycle || !companyId || cycle.companyId === companyId) {
      setNoMatchingCycle(false);
      return;
    }

    let cancelled = false;
    setSyncing(true);
    setNoMatchingCycle(false);

    void (async () => {
      try {
        const rows = await listPayrollCycles(companyId);
        if (cancelled) return;
        const match = findPayrollCycleForCompany(rows, cycle.periodStart, cycle.periodEnd);
        if (match) {
          const suffix = window.location.pathname.endsWith('/overview') ? '/overview' : '';
          navigate(`${basePath}/${match.id}${suffix}`, { replace: true });
          return;
        }
        setNoMatchingCycle(true);
      } catch {
        if (!cancelled) setNoMatchingCycle(true);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [basePath, companyId, cycle, navigate]);

  return {
    syncing,
    scopeMismatch,
    noMatchingCycle,
    cycleCompanyLabel,
    selectedCompanyLabel: companyId
      ? payrollCycleCompanyLabel(companies, companyId)
      : '',
  };
}
