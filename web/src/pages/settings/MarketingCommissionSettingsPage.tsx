import { FormEvent, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ReasonModal } from '../../components/ReasonModal';

interface MarketingConfig {
  kpiTargetDefault: number;
  teamPoolPercent: number;
  bigLeaderPercent: number;
  newHireRamp: Record<string, number>;
  carryForwardMaxMonths: number;
  promotionExpenseThreshold: number;
  companyHeadDeductionPercent: number;
}

interface ConfigResponse {
  activeVersion: number | null;
  config: MarketingConfig;
  versions: Array<{ versionNumber: number; reason: string; createdAt: string }>;
}

export default function MarketingCommissionSettingsPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState<MarketingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiGet<ConfigResponse>('/settings/commission/marketing', { companyId });
      setData(res);
      setForm(res.config);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  async function save(reason: string) {
    if (!companyId || !form) return;
    await apiPut(`/settings/commission/marketing?companyId=${companyId}`, { config: form, reason });
    await load();
  }

  function updateNumber(key: keyof MarketingConfig, value: string) {
    if (!form) return;
    setForm({ ...form, [key]: Number(value) });
  }

  if (!companyId) return <EmptyState title="Select a company" />;
  if (loading || !form) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Marketing Commission Settings</h1>
        {can('reporting:owner') && (
          <button type="button" onClick={() => setModalOpen(true)}>Save changes</button>
        )}
      </div>
      <p className="muted">Active version: {data?.activeVersion ?? 'defaults'}</p>
      <form className="form-grid settings-grid" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <label>KPI target default<input type="number" value={form.kpiTargetDefault} onChange={(e) => updateNumber('kpiTargetDefault', e.target.value)} /></label>
        <label>Team pool %<input type="number" value={form.teamPoolPercent} onChange={(e) => updateNumber('teamPoolPercent', e.target.value)} /></label>
        <label>Big leader %<input type="number" value={form.bigLeaderPercent} onChange={(e) => updateNumber('bigLeaderPercent', e.target.value)} /></label>
        <label>Carry forward max months<input type="number" value={form.carryForwardMaxMonths} onChange={(e) => updateNumber('carryForwardMaxMonths', e.target.value)} /></label>
        <label>Promotion expense threshold<input type="number" value={form.promotionExpenseThreshold} onChange={(e) => updateNumber('promotionExpenseThreshold', e.target.value)} /></label>
        <label>Company head deduction %<input type="number" value={form.companyHeadDeductionPercent} onChange={(e) => updateNumber('companyHeadDeductionPercent', e.target.value)} /></label>
      </form>
      {data?.versions?.length ? (
        <section>
          <h2>Version history</h2>
          <table>
            <thead><tr><th>Version</th><th>Reason</th><th>When</th></tr></thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.versionNumber}><td>{v.versionNumber}</td><td>{v.reason}</td><td>{new Date(v.createdAt).toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <ReasonModal
        title="Save marketing commission settings"
        actionLabel="Save"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={save}
      />
    </div>
  );
}
