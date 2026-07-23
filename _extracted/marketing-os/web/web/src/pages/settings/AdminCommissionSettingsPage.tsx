import { FormEvent, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ReasonModal } from '../../components/ReasonModal';

interface AdminConfig {
  poolAPercent: number;
  poolBPercent: number;
  normalLeaveAllowanceDays: number;
  leavePenaltyTiers: Array<{ minExtraDays: number; deductionPercent: number }>;
}

interface ConfigResponse {
  activeVersion: number | null;
  config: AdminConfig;
  versions: Array<{ versionNumber: number; reason: string; createdAt: string }>;
}

export default function AdminCommissionSettingsPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await apiGet<ConfigResponse>('/settings/commission/admin', { companyId });
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
    await apiPut(`/settings/commission/admin?companyId=${companyId}`, { config: form, reason });
    await load();
  }

  if (!companyId) return <EmptyState title="Select a company" />;
  if (loading || !form) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Admin Commission Settings</h1>
        {can('reporting:owner') && (
          <button type="button" onClick={() => setModalOpen(true)}>Save changes</button>
        )}
      </div>
      <form className="form-grid settings-grid" onSubmit={(e: FormEvent) => e.preventDefault()}>
        <label>Pool A %<input type="number" value={form.poolAPercent} onChange={(e) => setForm({ ...form, poolAPercent: Number(e.target.value) })} /></label>
        <label>Pool B %<input type="number" value={form.poolBPercent} onChange={(e) => setForm({ ...form, poolBPercent: Number(e.target.value) })} /></label>
        <label>Normal leave allowance (days)<input type="number" value={form.normalLeaveAllowanceDays} onChange={(e) => setForm({ ...form, normalLeaveAllowanceDays: Number(e.target.value) })} /></label>
      </form>
      <section>
        <h2>Leave penalty tiers</h2>
        <table>
          <thead><tr><th>Min extra days</th><th>Deduction %</th></tr></thead>
          <tbody>
            {form.leavePenaltyTiers.map((tier, idx) => (
              <tr key={idx}>
                <td>{tier.minExtraDays}</td>
                <td>{tier.deductionPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <ReasonModal title="Save admin commission settings" actionLabel="Save" open={modalOpen} onClose={() => setModalOpen(false)} onConfirm={save} />
    </div>
  );
}
