import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchPayrollCycle, PayrollCycle } from '../../api/payroll';
import {
  fetchPayrollOverview,
  fetchPayrollOverviewEmployeeDetail,
  formatOverviewException,
  logPayrollOverviewExportInitiated,
  PayrollOverviewEmployeeDetail,
  PayrollOverviewEmployeeRow,
  PayrollOverviewFilters,
  PayrollOverviewResponse,
} from '../../api/payroll-overview';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PayrollOverviewEmployeeDetailModal } from '../../components/payroll/PayrollOverviewEmployeeDetailModal';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQSelect,
  WorkHQStatCard,
  WorkHQAlert,
} from '../../components/ui';
import { usePayrollCycleCompanySync } from '../../hooks/usePayrollCycleCompanySync';
import { th } from '../../i18n/th-labels';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

export default function PayrollCycleOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const { user, can } = useAuth();

  const canViewCompanyOverview = can('payroll:read')
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');
  const canExport = user?.businessRole === 'owner' || user?.businessRole === 'secretary';

  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [overview, setOverview] = useState<PayrollOverviewResponse | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PayrollOverviewFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [detail, setDetail] = useState<PayrollOverviewEmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const cycleRow = await fetchPayrollCycle(id);
      setCycle(cycleRow);
      const overviewRow = await fetchPayrollOverview(id, {
        ...filters,
        companyId: cycleRow.companyId,
      });
      setOverview(overviewRow);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, filters]);

  useEffect(() => { void load(); }, [load]);

  const {
    syncing: companySyncing,
    scopeMismatch,
    noMatchingCycle,
    cycleCompanyLabel,
    selectedCompanyLabel,
  } = usePayrollCycleCompanySync({ cycle });

  const filteredEmployees = useMemo(() => {
    if (!overview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return overview.employees;
    return overview.employees.filter((row) =>
      row.employeeName.toLowerCase().includes(q)
      || row.employeeCode.toLowerCase().includes(q)
      || (row.department ?? '').toLowerCase().includes(q)
      || (row.teamName ?? '').toLowerCase().includes(q),
    );
  }, [overview, search]);

  async function openDetail(row: PayrollOverviewEmployeeRow) {
    if (!id) return;
    setDetailLoading(true);
    try {
      setDetail(await fetchPayrollOverviewEmployeeDetail(id, row.employeeId));
    } catch (err) {
      setError(err);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!id || !detail?.employeeId || !cycle) return;
    try {
      const [nextDetail, overviewRow] = await Promise.all([
        fetchPayrollOverviewEmployeeDetail(id, detail.employeeId),
        fetchPayrollOverview(id, { ...filters, companyId: cycle.companyId }),
      ]);
      setDetail(nextDetail);
      setOverview(overviewRow);
    } catch (err) {
      setError(err);
    }
  }

  async function goToExport() {
    if (!id) return;
    try {
      await logPayrollOverviewExportInitiated(id);
    } catch {
      // non-blocking audit
    }
    navigate(`/payroll/cycles/${id}`);
  }

  if (!canViewCompanyOverview) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.payrollOverview.accessDeniedTitle}>
          <p>{th.payrollOverview.accessDeniedDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (!companyId) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.employees.selectCompanyTitle}>
          <p>{th.employees.selectCompanyDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!overview || !cycle || !id) return null;

  return (
    <WorkHQPage>
      <Link to={`/payroll/cycles/${id}`} className="whq-back-link">{th.payrollOverview.back}</Link>

      {companySyncing && scopeMismatch && (
        <p className="whq-muted whq-mb-md">กำลังสลับไปรอบของ {selectedCompanyLabel}…</p>
      )}
      {noMatchingCycle && scopeMismatch && cycle && (
        <WorkHQAlert
          tone="warning"
          message={`รอบนี้เป็นของ ${cycleCompanyLabel} — ยังไม่มีรอบช่วง ${cycle.periodStart} → ${cycle.periodEnd} ใน ${selectedCompanyLabel}`}
        />
      )}

      <WorkHQPageHeader
        title={th.payrollOverview.title}
        subtitle={`${cycleCompanyLabel || overview.companyName} · ${overview.periodStart} → ${overview.periodEnd}`}
        actions={<WorkHQBadge status={overview.cycleStatus} />}
      />

      <WorkHQCard title={th.payrollOverview.filtersTitle} className="whq-detail-card">
        <div className="whq-filter-grid whq-detail-card-body">
          <WorkHQField label={th.payrollOverview.searchLabel}>
            <WorkHQInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={th.payrollOverview.searchPlaceholder}
            />
          </WorkHQField>
          <WorkHQField label={th.payrollOverview.departmentFilter}>
            <WorkHQInput
              value={filters.department ?? ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value || undefined }))}
            />
          </WorkHQField>
          <WorkHQField label={th.payrollOverview.positionFilter}>
            <WorkHQInput
              value={filters.position ?? ''}
              onChange={(e) => setFilters((prev) => ({ ...prev, position: e.target.value || undefined }))}
            />
          </WorkHQField>
          <WorkHQField label={th.payrollOverview.statusFilter}>
            <WorkHQSelect
              value={filters.employmentStatus ?? ''}
              onChange={(e) => setFilters((prev) => ({
                ...prev,
                employmentStatus: e.target.value || undefined,
              }))}
            >
              <option value="">{th.payrollOverview.allStatuses}</option>
              <option value="active">active</option>
              <option value="probation">probation</option>
              <option value="terminated">terminated</option>
              <option value="suspended">suspended</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label={th.payrollOverview.payrollStatusFilter}>
            <WorkHQSelect
              value={filters.payrollStatus ?? ''}
              onChange={(e) => setFilters((prev) => ({
                ...prev,
                payrollStatus: e.target.value || undefined,
              }))}
            >
              <option value="">{th.payrollOverview.allPayrollStatuses}</option>
              <option value="ready">ready</option>
              <option value="exception">exception</option>
              <option value="no_items">no_items</option>
              <option value="zero_net">zero_net</option>
            </WorkHQSelect>
          </WorkHQField>
          <div className="whq-filter-actions">
            <WorkHQButton type="button" variant="secondary" onClick={() => void load()}>
              {th.payrollOverview.applyFilters}
            </WorkHQButton>
            {canExport && overview.canExportBankTransfer && (
              <WorkHQButton type="button" variant="primary" onClick={() => void goToExport()}>
                {th.payrollOverview.exportLink}
              </WorkHQButton>
            )}
          </div>
        </div>
      </WorkHQCard>

      <div className="whq-stat-grid">
        <WorkHQStatCard icon="👥" value={overview.summary.totalEmployees} label={th.payrollOverview.totalEmployees} tone="cool" />
        <WorkHQStatCard icon="💰" value={formatMoney(overview.summary.totalBaseSalary)} label={th.payrollOverview.totalSalary} tone="green" />
        <WorkHQStatCard icon="🍱" value={formatMoney(overview.summary.totalMealAllowance)} label={th.payrollOverview.totalMeal} tone="warm" />
        <WorkHQStatCard icon="🕒" value={formatMoney(overview.summary.totalOtAmount)} label={th.payrollOverview.totalOt} tone="cool" />
        <WorkHQStatCard icon="📊" value={formatMoney(overview.summary.totalCommissionAmount)} label={th.payrollOverview.totalCommission} tone="lavender" />
        <WorkHQStatCard icon="➖" value={formatMoney(overview.summary.totalDeductionAmount)} label={th.payrollOverview.totalDeduction} tone="warm" />
        <WorkHQStatCard icon="✅" value={formatMoney(overview.summary.totalNetPayAmount)} label={th.payrollOverview.totalNet} tone="green" />
        <WorkHQStatCard icon="🏦" value={overview.summary.missingBankAccountCount} label={th.payrollOverview.missingBank} tone="lavender" />
        <WorkHQStatCard icon="⚠️" value={overview.exceptions.length} label={th.payrollOverview.exceptionCount} tone="warm" />
      </div>

      {overview.exceptions.length > 0 && (
        <WorkHQCard title={th.payrollOverview.exceptionsTitle}>
          <div className="whq-table-wrap">
            <table className="whq-table">
              <thead>
                <tr>
                  <th>{th.payrollCycle.colEmployee}</th>
                  <th>{th.payrollCycle.colNet}</th>
                  <th>{th.payrollOverview.exceptionReasons}</th>
                </tr>
              </thead>
              <tbody>
                {overview.exceptions.map((row) => (
                  <tr key={row.employeeId}>
                    <td>
                      <button type="button" className="whq-link-button" onClick={() => void openDetail(row)}>
                        {row.employeeName}
                      </button>
                      <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                    </td>
                    <td>{formatMoney(row.netPayAmount)}</td>
                    <td>
                      {row.exceptionReasons.map((reason) => (
                        <span key={reason} className="whq-badge whq-badge--warning whq-badge-inline">
                          {formatOverviewException(reason)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.payrollOverview.employeesTitle}>
        <div className="whq-table-wrap">
          <table className="whq-table whq-table--responsive">
            <thead>
              <tr>
                <th>{th.payrollCycle.colEmployee}</th>
                <th>{th.payrollOverview.colDepartment}</th>
                <th>{th.payrollCycle.colSalary}</th>
                <th>{th.payrollCycle.colOt}</th>
                <th>{th.payrollCycle.colNet}</th>
                <th>{th.payrollOverview.colBank}</th>
                <th>{th.payrollOverview.colStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((row) => (
                <tr key={row.employeeId}>
                  <td data-label={th.payrollCycle.colEmployee}>
                    <div>{row.employeeName}</div>
                    <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                    <div className="whq-muted whq-text-sm">{row.tenureDisplay}</div>
                  </td>
                  <td data-label={th.payrollOverview.colDepartment}>
                    <div>{row.department ?? '—'}</div>
                    <div className="whq-muted whq-text-sm">{row.teamName ?? '—'}</div>
                  </td>
                  <td data-label={th.payrollCycle.colSalary}>{formatMoney(row.baseSalary)}</td>
                  <td data-label={th.payrollCycle.colOt}>{formatMoney(row.otAmount)}</td>
                  <td data-label={th.payrollCycle.colNet}>{formatMoney(row.netPayAmount)}</td>
                  <td data-label={th.payrollOverview.colBank}>
                    <div>{row.bankName ?? '—'}</div>
                    <div className="whq-muted whq-text-sm">{row.bankAccountNoMasked ?? '—'}</div>
                  </td>
                  <td data-label={th.payrollOverview.colStatus}>
                    <WorkHQBadge status={row.payrollStatus} />
                    {row.hasException && (
                      <span className="whq-badge whq-badge--warning whq-badge-inline">!</span>
                    )}
                  </td>
                  <td>
                    <WorkHQButton type="button" variant="secondary" onClick={() => void openDetail(row)}>
                      {th.payrollOverview.viewDetail}
                    </WorkHQButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkHQCard>

      {(detail || detailLoading) && (
        <PayrollOverviewEmployeeDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          cycleId={id}
          onChanged={() => void refreshDetail()}
        />
      )}
    </WorkHQPage>
  );
}
