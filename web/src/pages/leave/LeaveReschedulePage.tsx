import { useEffect, useState } from 'react';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { apiGetMergedForCompanies } from '../../utils/multi-company';

interface Row {
  id: string;
  employeeName: string;
  originalStartDate: string;
  proposedStartDate: string;
  status: string;
  companyName?: string;
}

export default function LeaveReschedulePage() {
  const { scopedCompanyIds, hasCompanyScope, isAllCompanies, companies } = useCompanyScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!hasCompanyScope) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiGetMergedForCompanies<Row>('/leave/reschedule-requests', scopedCompanyIds, companies)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [scopedCompanyIds.join(','), hasCompanyScope, companies]);

  if (!hasCompanyScope) {
    return (
      <EmptyState
        title="เลือกบริษัท"
        description='เลือกบริษัทหรือ "ทุกบริษัท" จากแถบด้านบน'
      />
    );
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="card">
      <h1>เลื่อนวันลา</h1>
      {isAllCompanies && (
        <p className="whq-muted">กำลังดู {scopedCompanyIds.length} บริษัท</p>
      )}
      <table>
        <thead>
          <tr>
            {isAllCompanies && <th>บริษัท</th>}
            <th>พนักงาน</th>
            <th>วันเดิม</th>
            <th>วันใหม่</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.companyName ?? ''}-${row.id}`}>
              {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
              <td>{row.employeeName}</td>
              <td>{row.originalStartDate}</td>
              <td>{row.proposedStartDate}</td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
