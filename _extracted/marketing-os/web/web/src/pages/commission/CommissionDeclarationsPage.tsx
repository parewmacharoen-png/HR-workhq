import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';

interface DeclarationRow {
  id: string;
  employeeName: string;
  globalId: string;
  status: string;
  rejectReason?: string | null;
}

interface DeclarationSummaryGroup {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  teamPool: DeclarationRow[];
  bigLeaderSplit: DeclarationRow[];
  none: DeclarationRow[];
  unsure: DeclarationRow[];
  incomplete: DeclarationRow[];
  splitMismatch: DeclarationRow[];
}

interface SummaryResponse {
  groups: DeclarationSummaryGroup[];
  warnings: string[];
}

export default function CommissionDeclarationsPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [rejectTarget, setRejectTarget] = useState<DeclarationRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      setSummary(await apiGet<SummaryResponse>('/commission/declarations/summary', { companyId }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function hrReview(id: string) {
    setActionError(null);
    try {
      await apiPost(`/commission/declarations/${id}/hr-review`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'HR review failed');
    }
  }

  async function approve(id: string) {
    setActionError(null);
    try {
      await apiPost(`/commission/declarations/${id}/approve`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed');
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setActionError('Reject reason is required');
      return;
    }
    setActionError(null);
    try {
      await apiPost(`/commission/declarations/${rejectTarget.id}/reject`, { reason });
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reject failed');
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  const showActions = can('commission:declaration:review')
    || can('commission:declaration:approve')
    || can('commission:declaration:reject');

  return (
    <div className="card">
      <div className="page-header">
        <h1>Commission Declarations</h1>
        <button type="button" onClick={load}>Refresh</button>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {summary?.warnings.map((w) => (
        <p key={w} className="error">⚠️ {w}</p>
      ))}

      {rejectTarget && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>Reject declaration — {rejectTarget.globalId}</h3>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reject reason (required)"
            rows={3}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button type="button" onClick={submitReject}>Confirm reject</button>
          {' '}
          <button type="button" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Cancel</button>
        </div>
      )}

      {summary?.groups.map((group) => (
        <section key={`${group.companyId}:${group.teamId}`} style={{ marginBottom: '1.5rem' }}>
          <h2>{group.companyName} — {group.teamName}</h2>
          <div className="summary-cards">
            <div className="summary-card"><strong>{group.teamPool.length}</strong><span>TEAM POOL</span></div>
            <div className="summary-card"><strong>{group.bigLeaderSplit.length}</strong><span>BIG LEADER SPLIT</span></div>
            <div className="summary-card"><strong>{group.none.length}</strong><span>NONE</span></div>
            <div className="summary-card"><strong>{group.unsure.length}</strong><span>UNSURE</span></div>
            <div className="summary-card"><strong>{group.incomplete.length}</strong><span>Incomplete</span></div>
            <div className="summary-card"><strong>{group.splitMismatch.length}</strong><span>Split ≠ 100%</span></div>
          </div>

          {[
            { label: 'TEAM POOL', rows: group.teamPool },
            { label: 'BIG LEADER SPLIT', rows: group.bigLeaderSplit },
            { label: 'NONE', rows: group.none },
            { label: 'UNSURE', rows: group.unsure },
            { label: 'Incomplete', rows: group.incomplete },
            { label: 'Split mismatch', rows: group.splitMismatch },
          ].filter((section) => section.rows.length > 0).map((section) => (
            <div key={section.label}>
              <h3>{section.label}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    {showActions && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${section.label}:${row.id}`}>
                      <td>{row.globalId} — {row.employeeName}</td>
                      <td><StatusBadge status={row.status} /></td>
                      {showActions && (
                        <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {can('commission:declaration:review') && row.status === 'submitted' && (
                            <button type="button" onClick={() => hrReview(row.id)}>HR Review</button>
                          )}
                          {can('commission:declaration:approve') && row.status === 'hr_review' && (
                            <button type="button" onClick={() => approve(row.id)}>Approve</button>
                          )}
                          {can('commission:declaration:reject') && row.status === 'hr_review' && (
                            <button type="button" onClick={() => { setRejectTarget(row); setRejectReason(''); }}>Reject</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
