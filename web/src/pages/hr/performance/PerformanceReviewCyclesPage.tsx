import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  archiveWeightProfile,
  cloneWeightProfile,
  createReviewCycle,
  createWeightProfile,
  deleteWeightProfile,
  fetchPerformanceDashboard,
  fetchReviewCycles,
  fetchWeightProfiles,
  versionWeightProfile,
  type PerformanceDashboard,
  type PerformanceReviewCycle,
  type PerformanceWeightProfile,
} from '../../../api/performance-review';
import { ConfirmModal } from '../../../components/ConfirmModal';
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
import { fetchForEachCompany } from '../../../utils/multi-company';

function formatWeight(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export default function PerformanceReviewCyclesPage() {
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

  const [cycles, setCycles] = useState<Array<PerformanceReviewCycle & { companyName?: string }>>([]);
  const [profiles, setProfiles] = useState<Array<PerformanceWeightProfile & { companyName?: string }>>([]);
  const [dashboard, setDashboard] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const [profileName, setProfileName] = useState('');
  const [kpiWeight, setKpiWeight] = useState(0.4);
  const [leaderWeight, setLeaderWeight] = useState(0.3);
  const [selfWeight, setSelfWeight] = useState(0.2);
  const [feedback360Weight, setFeedback360Weight] = useState(0.1);
  const [isDefault, setIsDefault] = useState(false);

  const [cycleName, setCycleName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [weightProfileId, setWeightProfileId] = useState('');

  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.status === 'active'),
    [profiles],
  );

  const pendingCount = useMemo(
    () => (dashboard?.pendingReviews?.length ?? 0) + (dashboard?.submittedReviews?.length ?? 0),
    [dashboard],
  );

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const [cycleRows, profileRows, dashRows] = await Promise.all([
        fetchForEachCompany(scopedCompanyIds, (id) => fetchReviewCycles(id)),
        fetchForEachCompany(scopedCompanyIds, (id) => fetchWeightProfiles(id)),
        fetchForEachCompany(scopedCompanyIds, (id) => fetchPerformanceDashboard(id)),
      ]);
      setCycles(cycleRows.flatMap((row) =>
        row.result.map((cycle) => ({
          ...cycle,
          companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
        })),
      ));
      setProfiles(profileRows.flatMap((row) =>
        row.result.map((profile) => ({
          ...profile,
          companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
        })),
      ));
      setDashboard({
        companyId: 'all',
        activeCycles: dashRows.flatMap((row) => row.result.activeCycles ?? []),
        pendingReviews: dashRows.flatMap((row) => row.result.pendingReviews ?? []),
        submittedReviews: dashRows.flatMap((row) => row.result.submittedReviews ?? []),
        recentlyFinalized: dashRows.flatMap((row) => row.result.recentlyFinalized ?? []),
      });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companies, hasCompanyScope, scopedCompanyIds]);

  useEffect(() => { void load(); }, [load]);

  async function runProfileAction(action: (id: string) => Promise<unknown>, id: string) {
    setBusy(true);
    try {
      await action(id);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!createCompanyId || !profileName.trim()) return;
    setBusy(true);
    try {
      await createWeightProfile({
        companyId: createCompanyId,
        name: profileName.trim(),
        kpiWeight,
        leaderReviewWeight: leaderWeight,
        selfReviewWeight: selfWeight,
        feedback360Weight,
        isDefault,
      });
      setProfileName('');
      setIsDefault(false);
      setShowProfileForm(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!createCompanyId || !cycleName.trim() || !periodStart || !periodEnd || !weightProfileId) return;
    setBusy(true);
    try {
      await createReviewCycle({
        companyId: createCompanyId,
        name: cycleName.trim(),
        periodStart,
        periodEnd,
        weightProfileId,
      });
      setCycleName('');
      setPeriodStart('');
      setPeriodEnd('');
      setWeightProfileId('');
      setShowCycleForm(false);
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
        title={th.performanceReview.cyclesTitle}
        subtitle={th.performanceReview.cyclesSubtitle}
        actions={canWrite ? (
          <div className="whq-btn-group">
            <WorkHQButton type="button" variant="secondary" onClick={() => setShowProfileForm((v) => !v)}>
              {showProfileForm ? th.performanceReview.cancelProfile : th.performanceReview.createProfile}
            </WorkHQButton>
            <WorkHQButton type="button" variant="primary" onClick={() => setShowCycleForm((v) => !v)}>
              {showCycleForm ? th.performanceReview.cancelCycle : th.performanceReview.createCycle}
            </WorkHQButton>
          </div>
        ) : undefined}
      />

      <div className="whq-stat-grid">
        <WorkHQStatCard
          icon="🔄"
          label={th.performanceReview.activeCyclesLabel}
          value={dashboard?.activeCycles?.length ?? 0}
          tone="cool"
        />
        <WorkHQStatCard
          icon="⏳"
          label={th.performanceReview.pendingReviewsLabel}
          value={pendingCount}
          tone="warm"
        />
        <WorkHQStatCard
          icon="🏆"
          label={th.performanceReview.finalizedLabel}
          value={dashboard?.recentlyFinalized?.length ?? 0}
          tone="green"
        />
      </div>

      {showProfileForm && canWrite && (
        <WorkHQCard title={th.performanceReview.createProfileTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleCreateProfile(e)}>
            <label className="whq-field">
              <span className="whq-field-label">{th.performanceReview.colProfileName}</span>
              <input className="whq-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
            </label>
            <div className="whq-form-row">
              <label className="whq-field">
                <span className="whq-field-label">{th.performanceReview.colKpiWeight}</span>
                <input className="whq-input" type="number" min={0} max={1} step={0.05} value={kpiWeight} onChange={(e) => setKpiWeight(Number(e.target.value))} />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.performanceReview.colLeaderWeight}</span>
                <input className="whq-input" type="number" min={0} max={1} step={0.05} value={leaderWeight} onChange={(e) => setLeaderWeight(Number(e.target.value))} />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.performanceReview.colSelfWeight}</span>
                <input className="whq-input" type="number" min={0} max={1} step={0.05} value={selfWeight} onChange={(e) => setSelfWeight(Number(e.target.value))} />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.performanceReview.col360Weight}</span>
                <input className="whq-input" type="number" min={0} max={1} step={0.05} value={feedback360Weight} onChange={(e) => setFeedback360Weight(Number(e.target.value))} />
              </label>
            </div>
            <label className="whq-field whq-checkbox-row">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              {th.performanceReview.defaultProfile}
            </label>
            <WorkHQButton type="submit" variant="primary" disabled={busy}>{th.common.save}</WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      {showCycleForm && canWrite && (
        <WorkHQCard title={th.performanceReview.createCycleTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleCreateCycle(e)}>
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colName}</span>
              <input className="whq-input" value={cycleName} onChange={(e) => setCycleName(e.target.value)} required />
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
            <label className="whq-field">
              <span className="whq-field-label">{th.performanceReview.colWeightProfile}</span>
              <select className="whq-input" value={weightProfileId} onChange={(e) => setWeightProfileId(e.target.value)} required>
                <option value="">{th.performanceReview.selectProfile}</option>
                {activeProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {activeProfiles.length === 0 && (
                <span className="whq-muted whq-text-sm">{th.performanceReview.noActiveProfiles}</span>
              )}
            </label>
            <WorkHQButton type="submit" variant="primary" disabled={busy}>{th.performanceReview.saveCycle}</WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.performanceReview.weightProfilesTitle}>
        {profiles.length === 0 ? (
          <p className="whq-muted">{th.performanceReview.emptyProfiles}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.performanceReview.colProfileName}</th>
                  <th>{th.performanceReview.colKpiWeight}</th>
                  <th>{th.performanceReview.colLeaderWeight}</th>
                  <th>{th.performanceReview.colSelfWeight}</th>
                  <th>{th.performanceReview.col360Weight}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th>{th.kpi.colVersion}</th>
                  {canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {profiles.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name}
                      {row.isDefault && <span className="whq-muted"> · {th.performanceReview.defaultProfile}</span>}
                    </td>
                    <td>{formatWeight(row.kpiWeight)}</td>
                    <td>{formatWeight(row.leaderReviewWeight)}</td>
                    <td>{formatWeight(row.selfReviewWeight)}</td>
                    <td>{formatWeight(row.feedback360Weight)}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td>v{row.version}</td>
                    {canWrite && (
                      <td>
                        <div className="whq-btn-group whq-btn-group--inline">
                          <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => void runProfileAction(cloneWeightProfile, row.id)}>
                            {th.positionFramework.clone}
                          </WorkHQButton>
                          {row.status !== 'archived' && (
                            <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => void runProfileAction(archiveWeightProfile, row.id)}>
                              {th.positionFramework.archive}
                            </WorkHQButton>
                          )}
                          <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => void runProfileAction(versionWeightProfile, row.id)}>
                            {th.positionFramework.newVersion}
                          </WorkHQButton>
                          <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => setDeleteProfileId(row.id)}>
                            {th.positionFramework.delete}
                          </WorkHQButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkHQCard>

      <WorkHQCard title={th.performanceReview.allCyclesTitle}>
        {cycles.length === 0 ? (
          <p className="whq-muted">{th.performanceReview.emptyCycles}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.kpi.colName}</th>
                  <th>{th.kpi.colPeriod}</th>
                  <th>{th.performanceReview.colWeightProfile}</th>
                  <th>{th.kpi.colAssignments}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cycles.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.periodStart} — {row.periodEnd}</td>
                    <td>{row.weightProfileName ?? row.weightProfileId}</td>
                    <td>{row.reviewCount ?? 0}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td>
                      <Link to={`/hr/performance/reviews/${row.id}`} className="whq-link">
                        {th.kpi.viewDetail}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkHQCard>

      <ConfirmModal
        open={deleteProfileId != null}
        title={th.performanceReview.deleteProfileTitle}
        message={th.performanceReview.deleteProfileMessage}
        confirmLabel={th.positionFramework.delete}
        onClose={() => setDeleteProfileId(null)}
        onConfirm={async () => {
          if (!deleteProfileId) return;
          await deleteWeightProfile(deleteProfileId);
          await load();
        }}
      />
    </WorkHQPage>
  );
}
