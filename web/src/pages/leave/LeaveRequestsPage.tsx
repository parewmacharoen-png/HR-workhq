import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { ApprovalPreviewPanel } from '../../components/hr/ApprovalPreviewPanel';
import { resolveLeaveWorkflowType } from '../../api/approval';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { apiGetMergedForCompanies } from '../../utils/multi-company';

interface LeaveRow {
  id: string;
  employeeName: string;
  globalId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  companyName?: string;
}

export default function LeaveRequestsPage() {
  const { user } = useAuth();
  const { scopedCompanyIds, hasCompanyScope, isAllCompanies, companies } = useCompanyScope();
  const [status, setStatus] = useState('');
  const [previewLeaveType, setPreviewLeaveType] = useState('annual');
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const previewWorkflowType = useMemo(
    () => resolveLeaveWorkflowType(previewLeaveType),
    [previewLeaveType],
  );

  async function load() {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const merged = await apiGetMergedForCompanies<LeaveRow>(
        '/leave/requests',
        scopedCompanyIds,
        companies,
        { status: status || undefined },
      );
      setRows(merged);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [scopedCompanyIds.join(','), status, hasCompanyScope]);

  if (!hasCompanyScope) {
    return (
      <EmptyState
        title="เลือกบริษัท"
        description='เลือกบริษัทหรือ "ทุกบริษัท" จากแถบด้านบน'
      />
    );
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>คำขอลา</h1>
        {isAllCompanies && (
          <p className="whq-muted">กำลังดู {scopedCompanyIds.length} บริษัท</p>
        )}
        <div className="toolbar">
          <label>
            สถานะ
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="pending">รออนุมัติ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ไม่อนุมัติ</option>
            </select>
          </label>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            {isAllCompanies && <th>บริษัท</th>}
            <th>พนักงาน</th>
            <th>ประเภท</th>
            <th>เริ่ม</th>
            <th>สิ้นสุด</th>
            <th>วัน</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={isAllCompanies ? 7 : 6} className="whq-muted">ไม่พบรายการ</td>
            </tr>
          ) : rows.map((row) => (
            <tr key={`${row.companyName ?? ''}-${row.id}`}>
              {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
              <td>{row.globalId} {row.employeeName}</td>
              <td>{row.leaveType}</td>
              <td>{row.startDate}</td>
              <td>{row.endDate}</td>
              <td>{row.days}</td>
              <td><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {user?.employeeId && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>ตัวอย่างเส้นทางอนุมัติ</h2>
          <label>
            ประเภทลา (ตัวอย่าง)
            <select value={previewLeaveType} onChange={(e) => setPreviewLeaveType(e.target.value)}>
              <option value="annual">ลาพักร้อน</option>
              <option value="sick">ลาป่วย</option>
              <option value="personal">ลากิจ</option>
            </select>
          </label>
          <ApprovalPreviewPanel
            workflowType={previewWorkflowType}
            employeeId={user.employeeId}
            leaveTypeCode={previewLeaveType}
          />
        </section>
      )}
    </div>
  );
}
