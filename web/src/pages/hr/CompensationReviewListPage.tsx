import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CompensationReviewListItem,
  CompensationReviewStatus,
  fetchCompensationReviewList,
} from '../../api/compensation-review';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { WorkHQSelectCompanyState } from '../../components/workhq';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQDateInput,
} from '../../components/ui';
import { th } from '../../i18n/th-labels';
import { fetchForEachCompany } from '../../utils/multi-company';

const STATUS_OPTIONS: CompensationReviewStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'applied',
];

export default function CompensationReviewListPage() {
  const { companies, scopedCompanyIds, hasCompanyScope, isAllCompanies } = useCompanyScope();
  const { user, can } = useAuth();
  const canManage = can('payroll:read')
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');

  const [items, setItems] = useState<Array<CompensationReviewListItem & { companyName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [type, setType] = useState<'all' | 'salary' | 'promotion'>('all');
  const [status, setStatus] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const rows = await fetchForEachCompany(scopedCompanyIds, (companyId) =>
        fetchCompensationReviewList({
          companyId,
          type,
          status: status ? (status as CompensationReviewStatus) : undefined,
          effectiveFrom: effectiveFrom || undefined,
          effectiveTo: effectiveTo || undefined,
          search: search.trim() || undefined,
        }),
      );
      setItems(rows.flatMap((row) =>
        row.result.items.map((item) => ({
          ...item,
          companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
        })),
      ));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companies, effectiveFrom, effectiveTo, hasCompanyScope, scopedCompanyIds, search, status, type]);

  useEffect(() => { void load(); }, [load]);

  if (!canManage) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.compensationReview.accessDeniedTitle}>
          <p>{th.compensationReview.accessDeniedDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (!hasCompanyScope) {
    return (
      <WorkHQPage>
        <WorkHQSelectCompanyState />
      </WorkHQPage>
    );
  }

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.compensationReview.listTitle}
        subtitle={th.compensationReview.listSubtitle}
        actions={(
          <Link to="/hr/compensation-reviews" className="whq-link">
            {th.compensationReview.backToDashboard}
          </Link>
        )}
      />

      <WorkHQCard title={th.compensationReview.filtersTitle}>
        <div className="whq-form-grid">
          <label className="whq-field">
            <span className="whq-field-label">{th.compensationReview.filterType}</span>
            <select className="whq-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">{th.compensationReview.filterAllTypes}</option>
              <option value="salary">{th.compensationReview.salaryLabel}</option>
              <option value="promotion">{th.compensationReview.promotionLabel}</option>
            </select>
          </label>
          <label className="whq-field">
            <span className="whq-field-label">{th.payrollOverview.colStatus}</span>
            <select className="whq-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{th.payrollOverview.allStatuses}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="whq-field">
            <span className="whq-field-label">{th.compensationReview.effectiveFrom}</span>
            <WorkHQDateInput className="whq-input" value={effectiveFrom} onChange={setEffectiveFrom} />
          </label>
          <label className="whq-field">
            <span className="whq-field-label">{th.compensationReview.effectiveTo}</span>
            <WorkHQDateInput className="whq-input" value={effectiveTo} onChange={setEffectiveTo} />
          </label>
          <label className="whq-field whq-field--wide">
            <span className="whq-field-label">{th.payrollOverview.searchLabel}</span>
            <input
              className="whq-input"
              value={search}
              placeholder={th.payrollOverview.searchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <WorkHQButton type="button" variant="primary" onClick={() => void load()}>
          {th.payrollOverview.applyFilters}
        </WorkHQButton>
      </WorkHQCard>

      <WorkHQCard title={th.compensationReview.listTableTitle}>
        {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={load} /> : items.length === 0 ? (
          <p className="whq-muted">{th.compensationReview.emptyList}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.payrollCycle.colEmployee}</th>
                  <th>{th.compensationReview.filterType}</th>
                  <th>{th.compensationReview.colCurrent}</th>
                  <th>{th.compensationReview.colProposed}</th>
                  <th>{th.compensationReview.colIncrease}</th>
                  <th>{th.payrollCycle.payDate}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th>{th.compensationReview.colRequestedBy}</th>
                  <th>{th.compensationReview.colApprovedBy}</th>
                  <th>{th.compensationReview.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>
                      <Link to={`/hr/employees/${row.employeeId}`} className="whq-link">{row.employeeName}</Link>
                      <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                    </td>
                    <td>{row.type === 'salary' ? th.compensationReview.salaryLabel : th.compensationReview.promotionLabel}</td>
                    <td>{row.currentValue}</td>
                    <td>{row.proposedValue}</td>
                    <td>
                      {row.type === 'salary' && row.increaseAmount != null
                        ? `${row.increaseAmount.toLocaleString('th-TH')} (${row.increasePercent}%)`
                        : th.common.dash}
                    </td>
                    <td>{row.effectiveDate}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td>{row.requestedByName ?? th.common.dash}</td>
                    <td>{row.approvedByName ?? th.common.dash}</td>
                    <td>
                      <Link to={`/hr/employees/${row.employeeId}`} className="whq-link">
                        {th.compensationReview.viewEmployee}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkHQCard>
    </WorkHQPage>
  );
}
