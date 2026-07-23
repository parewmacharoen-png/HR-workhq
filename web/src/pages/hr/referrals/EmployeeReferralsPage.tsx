import { useEffect, useState } from 'react';
import { approveReferralBonus, listEmployeeReferrals } from '../../../api/request-platform';
import { useCompanyScope } from '../../../hooks/useCompanyScope';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { StatusBadge } from '../../../components/StatusBadge';
import { WorkHQSelectCompanyState } from '../../../components/workhq';
import { fetchForEachCompany } from '../../../utils/multi-company';

export default function EmployeeReferralsPage() {
  const { companies, scopedCompanyIds, hasCompanyScope, isAllCompanies } = useCompanyScope();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown> & { companyName?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const results = await fetchForEachCompany(scopedCompanyIds, (companyId) =>
        listEmployeeReferrals(companyId, status || undefined),
      );
      setRows(results.flatMap((row) =>
        row.result.map((item) => ({
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
  }

  useEffect(() => { void load(); }, [hasCompanyScope, scopedCompanyIds.join(','), status]);

  if (!hasCompanyScope) return <WorkHQSelectCompanyState />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>แนะนำคน (REC-002)</h1>
        <Link to="/admin/referral-programs">โปรแกรมโบนัส</Link>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="submitted">ส่งแล้ว</option>
          <option value="hired">จ้างแล้ว</option>
          <option value="probation">ทดลองงาน</option>
          <option value="bonus_eligible">มีสิทธิ์โบนัส</option>
          <option value="bonus_approved">อนุมัติโบนัส</option>
          <option value="paid">จ่ายแล้ว</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            {isAllCompanies ? <th>บริษัท</th> : null}
            <th>ผู้สมัคร</th>
            <th>ผู้แนะนำ</th>
            <th>สถานะ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              {isAllCompanies ? <td>{String(r.companyName)}</td> : null}
              <td><Link to={`/hr/referrals/${r.id}`}>{String(r.candidateName)}</Link></td>
              <td>{String((r.referrerEmployee as { firstName?: string })?.firstName ?? '—')}</td>
              <td><StatusBadge status={String(r.status)} /></td>
              <td>
                {r.status === 'bonus_eligible' && (
                  <button type="button" onClick={async () => { await approveReferralBonus(String(r.id)); void load(); }}>
                    อนุมัติโบนัส
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีรายการแนะนำ" />}
    </div>
  );
}
