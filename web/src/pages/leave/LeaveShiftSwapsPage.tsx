import { useEffect, useState } from 'react';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { apiGetMergedForCompanies } from '../../utils/multi-company';

interface Row {
  id: string;
  requesterName: string;
  partnerName: string;
  status: string;
  companyName?: string;
}

export default function LeaveShiftSwapsPage() {
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
    apiGetMergedForCompanies<Row>('/leave/shift-swaps', scopedCompanyIds, companies)
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
      <h1>สลับกะ</h1>
      {isAllCompanies && (
        <p className="whq-muted">กำลังดู {scopedCompanyIds.length} บริษัท</p>
      )}
      <table>
        <thead>
          <tr>
            {isAllCompanies && <th>บริษัท</th>}
            <th>ผู้ขอ</th>
            <th>คู่สลับ</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.companyName ?? ''}-${row.id}`}>
              {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
              <td>{row.requesterName}</td>
              <td>{row.partnerName}</td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
