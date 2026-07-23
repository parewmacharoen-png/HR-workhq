import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, ApiError } from '../../api/client';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { WorkHQErrorState } from '../../components/workhq/states/WorkHQErrorState';
import { WorkHQLoadingState } from '../../components/workhq/states/WorkHQLoadingState';
import { WorkHQSelectCompanyState } from '../../components/workhq';
import { WorkHQButton, WorkHQCard } from '../../components/ui';
import { fetchForEachCompany } from '../../utils/multi-company';

interface AuditRow {
  id: string;
  occurredAt: string;
  entityType: string;
  entityId: string | null;
  action: string;
  actorUserId: string | null;
  suspicious: boolean;
  companyId?: string;
  companyName?: string;
}

export default function HrAuditExplorerPage() {
  const { companies, scopedCompanyIds, hasCompanyScope, isAllCompanies } = useCompanyScope();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function search() {
    if (!hasCompanyScope) return;
    setLoading(true);
    setError(null);
    try {
      const results = await fetchForEachCompany(scopedCompanyIds, (companyId) =>
        apiGet<AuditRow[]>('/audit/logs', {
          companyId,
          entityType: entityType || undefined,
          action: action || undefined,
          limit: '100',
        }),
      );
      const merged = results
        .flatMap((row) => row.result.map((item) => ({
          ...item,
          companyId: row.companyId,
          companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
        })))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      setRows(merged);
    } catch (err) {
      setError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasCompanyScope) void search();
  }, [hasCompanyScope, scopedCompanyIds.join(',')]);

  if (!hasCompanyScope) return <WorkHQSelectCompanyState />;

  return (
    <div className="whq-page">
      <div className="page-header">
        <Link to="/settings">← ตั้งค่า</Link>
        <h1 className="whq-page-title">🔍 ตรวจสอบระบบ</h1>
      </div>
      <p className="muted">
        ค้นหาประวัติการเปลี่ยนแปลงและกิจกรรมที่น่าสงสัยในระบบ
        {isAllCompanies ? ` · ทุกบริษัท (${scopedCompanyIds.length})` : ''}
      </p>
      <WorkHQCard title="ค้นหา" className="whq-detail-card">
        <input className="whq-input" placeholder="ประเภทข้อมูล (เช่น employee, payroll)" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
        <input className="whq-input" placeholder="การกระทำ (เช่น create, update)" value={action} onChange={(e) => setAction(e.target.value)} />
        <WorkHQButton onClick={() => void search()} disabled={loading}>ค้นหา</WorkHQButton>
      </WorkHQCard>

      {loading && <WorkHQLoadingState />}
      {error != null && !loading && (
        <WorkHQErrorState
          referenceCode={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void search()}
        />
      )}

      {!loading && !error && (
        <table className="whq-table">
          <thead>
            <tr>
              <th>เวลา</th>
              {isAllCompanies ? <th>บริษัท</th> : null}
              <th>ข้อมูล</th>
              <th>การกระทำ</th>
              <th>ผู้ทำรายการ</th>
              <th>แจ้งเตือน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.occurredAt).toLocaleString('th-TH')}</td>
                {isAllCompanies ? <td>{r.companyName}</td> : null}
                <td>{r.entityType}{r.entityId ? ` / ${r.entityId.slice(0, 8)}` : ''}</td>
                <td>{r.action}</td>
                <td>{r.actorUserId?.slice(0, 8) ?? '—'}</td>
                <td>{r.suspicious ? '⚠️' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="muted">ไม่พบรายการ — ลองปรับเงื่อนไขค้นหา</p>
      )}
    </div>
  );
}
