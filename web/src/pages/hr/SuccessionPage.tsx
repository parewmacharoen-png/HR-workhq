import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCriticalRoles } from '../../api/phase2-hr-os';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { WorkHQSelectCompanyState } from '../../components/workhq';
import { fetchForEachCompany } from '../../utils/multi-company';

const RISK_LABELS: Record<string, string> = {
  low: 'ต่ำ',
  medium: 'ปานกลาง',
  high: 'สูง',
  critical: 'วิกฤต',
};

export default function SuccessionPage() {
  const { companies, scopedCompanyIds, hasCompanyScope, isAllCompanies } = useCompanyScope();
  const [rows, setRows] = useState<Array<Record<string, unknown> & { companyName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!hasCompanyScope) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchForEachCompany(scopedCompanyIds, (companyId) => listCriticalRoles(companyId))
      .then((results) => {
        setRows(results.flatMap((row) =>
          row.result.map((item) => ({
            ...item,
            companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
          })),
        ));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [companies, hasCompanyScope, scopedCompanyIds.join(',')]);

  if (!hasCompanyScope) return <WorkHQSelectCompanyState />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>แผนทดแทน</h1>
        </div>
      </div>
      <p className="muted">
        วางแผนผู้สืบทอดตำแหน่งสำคัญและติดตามความเสี่ยง
        {isAllCompanies ? ` · ทุกบริษัท (${scopedCompanyIds.length})` : ''}
      </p>
      <table>
        <thead>
          <tr>
            {isAllCompanies ? <th>บริษัท</th> : null}
            <th>ตำแหน่งสำคัญ</th>
            <th>ผู้ครอง</th>
            <th>ความเสี่ยง</th>
            <th>ผู้สำรอง</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const holder = r.currentHolder as Record<string, unknown> | null;
            const candidates = (r.candidates as Array<unknown>) ?? [];
            const risk = String(r.riskLevel ?? '');
            return (
              <tr key={`${String(r.companyName)}-${String(r.id)}`}>
                {isAllCompanies ? <td>{String(r.companyName)}</td> : null}
                <td>{String(r.name)}</td>
                <td>{holder ? `${holder.firstName} ${holder.lastName}` : '—'}</td>
                <td>{RISK_LABELS[risk] ?? (risk || '—')}</td>
                <td>{candidates.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ยังไม่มีตำแหน่งสำคัญ" />}
    </div>
  );
}
