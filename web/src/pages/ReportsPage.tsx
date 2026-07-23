import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCompanyScope } from '../hooks/useCompanyScope';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge } from '../components/StatusBadge';
import { WorkHQDateInput } from '../components/ui';
import { apiGetMergedForCompanies } from '../utils/multi-company';

interface ReportRow {
  id: string;
  reportDate: string;
  employeeName: string;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  status: string;
  submittedAt: string | null;
  companyName?: string;
}

export default function ReportsPage() {
  const { scopedCompanyIds, hasCompanyScope, isAllCompanies, companies } = useCompanyScope();
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const merged = await apiGetMergedForCompanies<ReportRow>(
        '/marketing/reports',
        scopedCompanyIds,
        companies,
        {
          status: status || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      );
      setRows(merged);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [scopedCompanyIds.join(','), hasCompanyScope]);

  if (!hasCompanyScope) {
    return (
      <EmptyState
        title="เลือกบริษัท"
        description='เลือกบริษัทหรือ "ทุกบริษัท" จากแถบด้านบนเพื่อดูรายงาน'
      />
    );
  }

  return (
    <div className="card">
      <div className="page-header">
        <h1>รายงานการตลาด</h1>
        {isAllCompanies && (
          <p className="whq-muted">กำลังดู {scopedCompanyIds.length} บริษัท</p>
        )}
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </button>
      </div>
      <div className="toolbar">
        <label>
          สถานะ
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="draft">draft</option>
            <option value="submitted">submitted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="voided">voided</option>
          </select>
        </label>
        <label>จาก<WorkHQDateInput value={dateFrom} onChange={setDateFrom} /></label>
        <label>ถึง<WorkHQDateInput value={dateTo} onChange={setDateTo} /></label>
        <button type="button" className="secondary" onClick={() => void load()}>ใช้ตัวกรอง</button>
      </div>
      {error ? <ErrorState error={error} onRetry={() => void load()} /> : null}
      <table>
        <thead>
          <tr>
            {isAllCompanies && <th>บริษัท</th>}
            <th>วันที่</th>
            <th>พนักงาน</th>
            <th>ทีม</th>
            <th>สถานะ</th>
            <th>ส่งเมื่อ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.companyName ?? ''}-${row.id}`}>
              {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
              <td>{row.reportDate}</td>
              <td>{row.employeeName}</td>
              <td>{row.teamName ?? '—'}</td>
              <td><StatusBadge status={row.status} /></td>
              <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString('th-TH') : '—'}</td>
              <td><Link to={`/marketing/reports/${row.id}`}>ดู</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
