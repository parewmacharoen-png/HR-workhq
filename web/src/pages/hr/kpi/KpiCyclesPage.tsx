import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createKpiCycle,
  fetchKpiCycles,
  fetchKpiDashboard,
  type KpiAssignment,
  type KpiCycle,
  type KpiDashboard,
} from '../../../api/kpi';
import { useAuth } from '../../../context/AuthContext';
import { useCompanyScope } from '../../../hooks/useCompanyScope';
import { useScopedCompanyId } from '../../../hooks/useScopedCompanyId';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../../components/workhq';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQStatCard,
  WorkHQDateInput,
} from '../../../components/ui';
import { th } from '../../../i18n/th-labels';
import { fetchForEachCompany, mergeKpiCycles, mergeKpiDashboards } from '../../../utils/multi-company';

function formatScore(score: number | null | undefined): string {
  if (score == null) return th.common.dash;
  return score.toFixed(1);
}

function topPerformers(rows: KpiAssignment[], limit = 5): KpiAssignment[] {
  return [...rows]
    .filter((row) => row.score?.totalScore != null)
    .sort((a, b) => (b.score!.totalScore! - a.score!.totalScore!))
    .slice(0, limit);
}

function lowScores(rows: KpiAssignment[], limit = 5): KpiAssignment[] {
  return [...rows]
    .filter((row) => row.score?.totalScore != null)
    .sort((a, b) => (a.score!.totalScore! - b.score!.totalScore!))
    .slice(0, limit);
}

export default function KpiCyclesPage() {
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    isAllCompanies,
    companyLabel,
  } = useCompanyScope();
  const {
    companyId: createCompanyId,
    setLocalCompanyId,
    needsLocalPicker,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const canWrite = can('performance:write');

  const [cycles, setCycles] = useState<Array<KpiCycle & { companyName?: string }>>([]);
  const [dashboard, setDashboard] = useState<KpiDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const pendingReviews = useMemo(
    () => [
      ...(dashboard?.pendingAssignments ?? []),
      ...(dashboard?.submittedAssignments ?? []),
    ],
    [dashboard],
  );

  const performers = useMemo(
    () => topPerformers(dashboard?.recentlyFinalized ?? []),
    [dashboard],
  );

  const underperformers = useMemo(
    () => lowScores(dashboard?.recentlyFinalized ?? []),
    [dashboard],
  );

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const [cycleRows, dashboardRows] = await Promise.all([
        fetchForEachCompany(scopedCompanyIds, (id) => fetchKpiCycles(id)),
        fetchForEachCompany(scopedCompanyIds, (id) => fetchKpiDashboard(id)),
      ]);
      setCycles(mergeKpiCycles(cycleRows, companies));
      setDashboard(mergeKpiDashboards(dashboardRows.map((row) => row.result)));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companies, hasCompanyScope, scopedCompanyIds]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createCompanyId || !name.trim() || !periodStart || !periodEnd) return;
    setBusy(true);
    try {
      await createKpiCycle({ companyId: createCompanyId, name: name.trim(), periodStart, periodEnd });
      setName('');
      setPeriodStart('');
      setPeriodEnd('');
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!can('performance:read')) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.kpi.accessDeniedTitle}>
          <p>{th.kpi.accessDeniedDesc}</p>
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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.kpi.cyclesTitle}
        subtitle={isAllCompanies ? `${th.kpi.cyclesSubtitle} · ${companyLabel}` : th.kpi.cyclesSubtitle}
        actions={(
          <div className="whq-btn-group">
            <Link to="/hr/kpi/templates" className="whq-link">{th.kpi.templatesLink}</Link>
            {canWrite && (
              <WorkHQButton type="button" variant="primary" onClick={() => setShowForm((v) => !v)}>
                {showForm ? th.kpi.cancelCreate : th.kpi.createCycle}
              </WorkHQButton>
            )}
          </div>
        )}
      />

      {dashboard && (
        <>
          <div className="whq-stat-grid">
            <WorkHQStatCard
              icon="🔄"
              value={dashboard.activeCycles.length}
              label={th.kpi.activeCyclesLabel}
              tone="cool"
            />
            <WorkHQStatCard
              icon="⏳"
              value={pendingReviews.length}
              label={th.kpi.pendingReviewsLabel}
              tone="warm"
            />
            <WorkHQStatCard
              icon="🏆"
              value={performers.length}
              label={th.kpi.topPerformersLabel}
              tone="green"
            />
            <WorkHQStatCard
              icon="📉"
              value={underperformers.length}
              label={th.kpi.lowScoresLabel}
              tone="lavender"
            />
          </div>

          <WorkHQCard title={th.kpi.activeCyclesTitle}>
            {dashboard.activeCycles.length === 0 ? (
              <p className="whq-muted">{th.kpi.emptyActiveCycles}</p>
            ) : (
              <div className="whq-table-wrap">
                <table className="whq-table">
                  <thead>
                    <tr>
                      <th>{th.kpi.colName}</th>
                      <th>{th.kpi.colPeriod}</th>
                      <th>{th.kpi.colAssignments}</th>
                      <th>{th.payrollOverview.colStatus}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.activeCycles.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.periodStart} → {row.periodEnd}</td>
                        <td>{row.assignmentCount}</td>
                        <td><WorkHQBadge status={row.status} /></td>
                        <td>
                          <Link to={`/hr/kpi/cycles/${row.id}`} className="whq-link">{th.kpi.viewDetail}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkHQCard>

          <WorkHQCard title={th.kpi.pendingReviewsTitle}>
            {pendingReviews.length === 0 ? (
              <p className="whq-muted">{th.kpi.emptyPendingReviews}</p>
            ) : (
              <AssignmentMiniTable rows={pendingReviews.slice(0, 10)} />
            )}
          </WorkHQCard>

          <WorkHQCard title={th.kpi.topPerformersTitle}>
            {performers.length === 0 ? (
              <p className="whq-muted">{th.kpi.emptyTopPerformers}</p>
            ) : (
              <AssignmentMiniTable rows={performers} showScore />
            )}
          </WorkHQCard>

          <WorkHQCard title={th.kpi.lowScoresTitle}>
            {underperformers.length === 0 ? (
              <p className="whq-muted">{th.kpi.emptyLowScores}</p>
            ) : (
              <AssignmentMiniTable rows={underperformers} showScore />
            )}
          </WorkHQCard>
        </>
      )}

      {showForm && canWrite && (
        <WorkHQCard title={th.kpi.createCycleTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleCreate(e)}>
            {needsLocalPicker ? (
              <CompanyScopePicker
                companies={companies}
                companyIds={scopedCompanyIds}
                value={createCompanyId}
                onChange={setLocalCompanyId}
                label="บริษัทที่สร้างรอบ KPI"
              />
            ) : null}
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colName}</span>
              <input className="whq-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <div className="whq-form-row">
              <label className="whq-field">
                <span className="whq-field-label">{th.kpi.periodStart}</span>
                <WorkHQDateInput className="whq-input" value={periodStart} onChange={setPeriodStart} required />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.kpi.periodEnd}</span>
                <WorkHQDateInput className="whq-input" value={periodEnd} onChange={setPeriodEnd} required />
              </label>
            </div>
            <WorkHQButton type="submit" variant="primary" disabled={busy}>{th.kpi.saveCycle}</WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.kpi.allCyclesTitle}>
        {cycles.length === 0 ? (
          <p className="whq-muted">{th.kpi.emptyCycles}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  {isAllCompanies ? <th>บริษัท</th> : null}
                  <th>{th.kpi.colName}</th>
                  <th>{th.kpi.colPeriod}</th>
                  <th>{th.kpi.colAssignments}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cycles.map((row) => (
                  <tr key={row.id}>
                    {isAllCompanies ? <td>{row.companyName}</td> : null}
                    <td>{row.name}</td>
                    <td>{row.periodStart} → {row.periodEnd}</td>
                    <td>{row.assignmentCount}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td>
                      <Link to={`/hr/kpi/cycles/${row.id}`} className="whq-link">{th.kpi.viewDetail}</Link>
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

function AssignmentMiniTable({ rows, showScore = false }: { rows: KpiAssignment[]; showScore?: boolean }) {
  return (
    <div className="whq-table-wrap">
      <table className="whq-table">
        <thead>
          <tr>
            <th>{th.payrollCycle.colEmployee}</th>
            <th>{th.kpi.colCycle}</th>
            <th>{th.kpi.colTemplate}</th>
            {showScore && <th>{th.kpi.colScore}</th>}
            <th>{th.payrollOverview.colStatus}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={`/hr/employees/${row.employeeId}`} className="whq-link">{row.employeeName}</Link>
                <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
              </td>
              <td>{row.cycleName}</td>
              <td>{row.templateName}</td>
              {showScore && <td>{formatScore(row.score?.totalScore)}</td>}
              <td><WorkHQBadge status={row.status} /></td>
              <td>
                <Link to={`/hr/kpi/cycles/${row.cycleId}`} className="whq-link">{th.kpi.viewDetail}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
