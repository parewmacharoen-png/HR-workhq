import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  applyPromotionReview,
  applySalaryReview,
  approvePromotionReview,
  approveSalaryReview,
  CompensationDashboard,
  fetchCompensationDashboard,
  rejectPromotionReview,
  rejectSalaryReview,
} from '../../api/compensation-review';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany, mergeCompensationDashboards } from '../../utils/multi-company';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
} from '../../components/ui';
import { th } from '../../i18n/th-labels';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

type ApplyTarget = { id: string; type: 'salary' | 'promotion'; employeeName: string };

export default function CompensationReviewDashboardPage() {
  const singleCompanyId = useCompanyId();
  const { isAllCompanies: allCompanies, scopedCompanyIds, hasCompanyScope } = useCompanyScope();
  const { user, can } = useAuth();
  const canManage = can('payroll:read')
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');
  const isOwner = user?.businessRole === 'owner';
  const canApply = user?.businessRole === 'owner' || user?.businessRole === 'secretary';

  const [dashboard, setDashboard] = useState<CompensationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [applyTarget, setApplyTarget] = useState<ApplyTarget | null>(null);

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const companyIds = allCompanies ? scopedCompanyIds : singleCompanyId ? [singleCompanyId] : [];
      const results = await fetchForEachCompany(companyIds, fetchCompensationDashboard);
      setDashboard(mergeCompensationDashboards(results.map((r) => r.result)));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [hasCompanyScope, allCompanies, scopedCompanyIds, singleCompanyId]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(action: () => Promise<unknown>) {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmApply() {
    if (!applyTarget) return;
    setBusyId(applyTarget.id);
    await runAction(async () => {
      if (applyTarget.type === 'salary') await applySalaryReview(applyTarget.id);
      else await applyPromotionReview(applyTarget.id);
    });
    setApplyTarget(null);
  }

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
        <WorkHQCard title={th.employees.selectCompanyTitle}>
          <p>{th.employees.selectCompanyDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!dashboard) return null;

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.compensationReview.dashboardTitle}
        subtitle={th.compensationReview.dashboardSubtitle}
        actions={(
          <Link to="/hr/compensation-reviews/list" className="whq-link">
            {th.compensationReview.viewAllLink}
          </Link>
        )}
      />

      <WorkHQCard title={th.compensationReview.pendingSalaryTitle}>
        <ReviewTable
          rows={dashboard.pendingSalaryReviews.map((row) => ({
            id: row.id,
            type: 'salary' as const,
            employeeName: row.employeeName,
            employeeCode: row.employeeCode,
            detail: `${formatMoney(row.currentSalary)} → ${formatMoney(row.proposedSalary)}`,
            effectiveDate: row.effectiveDate,
            status: row.status,
            profileLink: `/hr/employees/${row.employeeId}`,
          }))}
          isOwner={isOwner}
          canApply={false}
          busyId={busyId}
          onApprove={(id) => {
            setBusyId(id);
            void runAction(() => approveSalaryReview(id));
          }}
          onReject={(id) => {
            setBusyId(id);
            void runAction(() => rejectSalaryReview(id));
          }}
          onApply={() => undefined}
        />
      </WorkHQCard>

      <WorkHQCard title={th.compensationReview.pendingPromotionTitle}>
        <ReviewTable
          rows={dashboard.pendingPromotionReviews.map((row) => ({
            id: row.id,
            type: 'promotion' as const,
            employeeName: row.employeeName,
            employeeCode: row.employeeCode,
            detail: `${row.currentPosition ?? '—'} → ${row.proposedPosition}`,
            effectiveDate: row.effectiveDate,
            status: row.status,
            profileLink: `/hr/employees/${row.employeeId}`,
          }))}
          isOwner={isOwner}
          canApply={false}
          busyId={busyId}
          onApprove={(id) => {
            setBusyId(id);
            void runAction(() => approvePromotionReview(id));
          }}
          onReject={(id) => {
            setBusyId(id);
            void runAction(() => rejectPromotionReview(id));
          }}
          onApply={() => undefined}
        />
      </WorkHQCard>

      <WorkHQCard title={th.compensationReview.upcomingSalaryTitle}>
        <UpcomingTable
          rows={dashboard.upcomingSalaryChanges}
          type="salary"
          canApply={canApply}
          busyId={busyId}
          onApply={(row) => setApplyTarget({ id: row.id, type: 'salary', employeeName: row.employeeName })}
        />
      </WorkHQCard>

      <WorkHQCard title={th.compensationReview.upcomingPromotionTitle}>
        <UpcomingPromotionTable
          rows={dashboard.upcomingPromotionChanges}
          canApply={canApply}
          busyId={busyId}
          onApply={(row) => setApplyTarget({ id: row.id, type: 'promotion', employeeName: row.employeeName })}
        />
      </WorkHQCard>

      <ConfirmModal
        open={applyTarget !== null}
        title={th.compensationReview.applyConfirmTitle}
        message={`${th.compensationReview.applyConfirmMessage}${applyTarget ? ` (${applyTarget.employeeName})` : ''}`}
        confirmLabel={th.compensationReview.applyNow}
        onClose={() => setApplyTarget(null)}
        onConfirm={confirmApply}
      />
    </WorkHQPage>
  );
}

function ReviewTable({
  rows,
  isOwner,
  canApply,
  busyId,
  onApprove,
  onReject,
  onApply,
}: {
  rows: Array<{
    id: string;
    type: 'salary' | 'promotion';
    employeeName: string;
    employeeCode: string;
    detail: string;
    effectiveDate: string;
    status: string;
    profileLink: string;
  }>;
  isOwner: boolean;
  canApply: boolean;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApply: (row: { id: string; type: 'salary' | 'promotion'; employeeName: string }) => void;
}) {
  if (rows.length === 0) {
    return <p className="whq-muted">{th.compensationReview.emptyPending}</p>;
  }
  return (
    <div className="whq-table-wrap">
      <table className="whq-table whq-table--responsive">
        <thead>
          <tr>
            <th>{th.payrollCycle.colEmployee}</th>
            <th>{th.compensationReview.colChange}</th>
            <th>{th.payrollCycle.payDate}</th>
            <th>{th.payrollOverview.colStatus}</th>
            {isOwner && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={row.profileLink} className="whq-link">{row.employeeName}</Link>
                <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
              </td>
              <td>{row.detail}</td>
              <td>{row.effectiveDate}</td>
              <td><WorkHQBadge status={row.status} /></td>
              {isOwner && (
                <td>
                  <div className="whq-btn-group">
                    <WorkHQButton
                      type="button"
                      variant="primary"
                      disabled={busyId !== null}
                      onClick={() => onApprove(row.id)}
                    >
                      {th.compensationReview.approve}
                    </WorkHQButton>
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={busyId !== null}
                      onClick={() => onReject(row.id)}
                    >
                      {th.compensationReview.reject}
                    </WorkHQButton>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingTable({
  rows,
  type,
  canApply,
  busyId,
  onApply,
}: {
  rows: CompensationDashboard['upcomingSalaryChanges'];
  type: 'salary';
  canApply: boolean;
  busyId: string | null;
  onApply: (row: CompensationDashboard['upcomingSalaryChanges'][number]) => void;
}) {
  if (rows.length === 0) return <p className="whq-muted">{th.compensationReview.emptyUpcoming}</p>;
  return (
    <div className="whq-table-wrap">
      <table className="whq-table">
        <thead>
          <tr>
            <th>{th.payrollCycle.colEmployee}</th>
            <th>{th.compensationReview.colChange}</th>
            <th>{th.payrollCycle.payDate}</th>
            {canApply && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.employeeName}</td>
              <td>{formatMoney(row.proposedSalary)}</td>
              <td>{row.effectiveDate}</td>
              {canApply && (
                <td>
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={busyId !== null}
                    onClick={() => onApply(row)}
                  >
                    {th.compensationReview.applyNow}
                  </WorkHQButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingPromotionTable({
  rows,
  canApply,
  busyId,
  onApply,
}: {
  rows: CompensationDashboard['upcomingPromotionChanges'];
  canApply: boolean;
  busyId: string | null;
  onApply: (row: CompensationDashboard['upcomingPromotionChanges'][number]) => void;
}) {
  if (rows.length === 0) return <p className="whq-muted">{th.compensationReview.emptyUpcoming}</p>;
  return (
    <div className="whq-table-wrap">
      <table className="whq-table">
        <thead>
          <tr>
            <th>{th.payrollCycle.colEmployee}</th>
            <th>{th.compensationReview.colPosition}</th>
            <th>{th.payrollCycle.payDate}</th>
            {canApply && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.employeeName}</td>
              <td>{row.proposedPosition}</td>
              <td>{row.effectiveDate}</td>
              {canApply && (
                <td>
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={busyId !== null}
                    onClick={() => onApply(row)}
                  >
                    {th.compensationReview.applyNow}
                  </WorkHQButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
