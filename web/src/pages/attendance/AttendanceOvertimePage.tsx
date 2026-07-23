import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { WorkHQButton, WorkHQCard } from '../../components/ui';
import { WorkHQEmptyState } from '../../components/workhq';

interface Row {
  id: string;
  employeeName: string;
  workDate: string;
  overtimeHours: number;
  status: string;
  companyId?: string;
  companyName?: string;
}

export default function AttendanceOvertimePage() {
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    companyLabel,
    isAllCompanies,
  } = useCompanyScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const companyNameOf = useCallback((id: string) => {
    const match = companies.find((company) => company.id === id);
    return match ? match.name : id.slice(0, 8);
  }, [companies]);

  const load = useCallback(async () => {
    if (!hasCompanyScope) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await fetchForEachCompany(scopedCompanyIds, (companyId) =>
        apiGet<Row[]>('/attendance/overtime/pending', { companyId }),
      );
      const merged = results
        .flatMap((row) => row.result.map((item) => ({
          ...item,
          companyId: row.companyId,
          companyName: companyNameOf(row.companyId),
        })))
        .sort((a, b) => b.workDate.localeCompare(a.workDate)
          || a.employeeName.localeCompare(b.employeeName, 'th'));
      setRows(merged);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companyNameOf, hasCompanyScope, scopedCompanyIds]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasCompanyScope) {
    return (
      <div className="whq-page whq-att-cc">
        <header className="whq-att-cc-hero">
          <p className="whq-att-cc-eyebrow">เวลาเข้างาน › อนุมัติ OT</p>
          <h1 className="whq-att-cc-title">อนุมัติ OT</h1>
          <p className="whq-att-cc-subtitle">เลือกบริษัทจากแถบด้านบน หรือเลือกทุกบริษัท</p>
        </header>
        <WorkHQEmptyState
          icon="🏢"
          title="ยังไม่ได้เลือกบริษัท"
          description='เลือกบริษัทหรือ "ทุกบริษัท" จากแถบด้านบน'
        />
      </div>
    );
  }

  return (
    <div className="whq-page whq-att-cc">
      <header className="whq-att-cc-hero">
        <p className="whq-att-cc-eyebrow">เวลาเข้างาน › อนุมัติ OT</p>
        <h1 className="whq-att-cc-title">อนุมัติ OT</h1>
        <p className="whq-att-cc-subtitle">
          กำลังดู: <strong>{companyLabel}</strong>
          {isAllCompanies ? ` · คำขอจากทุกบริษัท` : ''}
        </p>
        <div className="whq-att-cc-toolbar">
          <WorkHQButton variant="secondary" onClick={() => void load()}>รีเฟรช</WorkHQButton>
          <WorkHQButton to="/approvals" variant="secondary">ไปหน้าอนุมัติทั้งหมด</WorkHQButton>
        </div>
      </header>

      {loading && <LoadingState />}
      {!loading && error != null && <ErrorState error={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title" style={{ textAlign: 'center' }}>
            ไม่มีคำขอ OT ที่รออนุมัติ
          </p>
          <p className="whq-muted" style={{ textAlign: 'center' }}>
            เมื่อมีคำขอ OT ใหม่ รายการจะแสดงที่นี่
          </p>
        </WorkHQCard>
      )}
      {!loading && !error && rows.length > 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title">พบ {rows.length} คำขอ</p>
          <div className="whq-table-wrap">
            <table className="whq-table data-table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  {isAllCompanies && <th>บริษัท</th>}
                  <th>วันที่</th>
                  <th>OT (ชม.)</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.companyId ?? ''}:${row.id}`}>
                    <td>{row.employeeName}</td>
                    {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
                    <td>{row.workDate}</td>
                    <td>{row.overtimeHours}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQCard>
      )}

      <p className="whq-muted" style={{ textAlign: 'center', marginTop: '1rem' }}>
        <Link to="/attendance">กลับเมนูเวลาเข้างาน</Link>
      </p>
    </div>
  );
}
