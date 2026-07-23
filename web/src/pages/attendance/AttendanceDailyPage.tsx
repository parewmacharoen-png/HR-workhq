import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { WorkHQButton, WorkHQCard, WorkHQDateInput } from '../../components/ui';
import { WorkHQEmptyState } from '../../components/workhq';

interface Row {
  id: string;
  employeeName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  status: string;
  mayBeAbsent?: boolean;
  absenceStatus?: string | null;
  companyId?: string;
  companyName?: string;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function AttendanceDailyPage() {
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    companyLabel,
    isAllCompanies,
  } = useCompanyScope();
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
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
        apiGet<Row[]>('/attendance/daily', { companyId, workDate }),
      );
      const merged = results
        .flatMap((row) => row.result.map((item) => ({
          ...item,
          companyId: row.companyId,
          companyName: companyNameOf(row.companyId),
        })))
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'th'));
      setRows(merged);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companyNameOf, hasCompanyScope, scopedCompanyIds, workDate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasCompanyScope) {
    return (
      <div className="whq-page whq-att-cc">
        <header className="whq-att-cc-hero">
          <p className="whq-att-cc-eyebrow">เวลาเข้างาน › บันทึกประจำวัน</p>
          <h1 className="whq-att-cc-title">บันทึกประจำวัน</h1>
          <p className="whq-att-cc-subtitle">เลือกบริษัทจากแถบด้านบน หรือเลือกทุกบริษัทเพื่อดูทุกคน</p>
        </header>
        <WorkHQEmptyState
          icon="🏢"
          title="ยังไม่ได้เลือกบริษัท"
          description='เลือกบริษัทหรือ "ทุกบริษัท" จากแถบด้านบน แล้วระบบจะแสดงพนักงานทั้งหมด'
        />
      </div>
    );
  }

  return (
    <div className="whq-page whq-att-cc">
      <header className="whq-att-cc-hero">
        <p className="whq-att-cc-eyebrow">เวลาเข้างาน › บันทึกประจำวัน</p>
        <h1 className="whq-att-cc-title">บันทึกประจำวัน</h1>
        <p className="whq-att-cc-subtitle">
          กำลังดู: <strong>{companyLabel}</strong>
          {isAllCompanies ? ` · ${scopedCompanyIds.length} บริษัท · พนักงานทุกคน` : ''}
        </p>
        <div className="whq-att-cc-toolbar">
          <label className="whq-att-cc-field">
            <span>วันที่</span>
            <WorkHQDateInput value={workDate} onChange={setWorkDate} />
          </label>
          <WorkHQButton variant="secondary" onClick={() => void load()}>รีเฟรช</WorkHQButton>
          <WorkHQButton to="/attendance/absences" variant="secondary">ตรวจสอบขาดงาน</WorkHQButton>
        </div>
      </header>

      {loading && <LoadingState />}
      {!loading && error != null && <ErrorState error={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title" style={{ textAlign: 'center' }}>
            ยังไม่มีบันทึกเข้างานในวันนี้
          </p>
          <p className="whq-muted" style={{ textAlign: 'center' }}>
            เมื่อพนักงานเช็กอิน รายชื่อจะแสดงที่นี่
          </p>
        </WorkHQCard>
      )}
      {!loading && !error && rows.length > 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title">
            พบ {rows.length} คน
            {isAllCompanies ? ' จากทุกบริษัท' : ''}
          </p>
          <div className="whq-table-wrap">
            <table className="whq-table data-table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  {isAllCompanies && <th>บริษัท</th>}
                  <th>เช็กอิน</th>
                  <th>เช็กเอาต์</th>
                  <th>สาย (นาที)</th>
                  <th>สถานะ</th>
                  <th>ขาดงาน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.companyId ?? ''}:${row.id}`}>
                    <td>{row.employeeName}</td>
                    {isAllCompanies && <td>{row.companyName ?? '—'}</td>}
                    <td>{formatTime(row.checkInAt)}</td>
                    <td>{formatTime(row.checkOutAt)}</td>
                    <td>{row.lateMinutes}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      {row.absenceStatus
                        ? <StatusBadge status={row.absenceStatus} />
                        : row.mayBeAbsent
                          ? (
                            <Link to={`/attendance/absences?from=${workDate}&to=${workDate}`}>
                              อาจขาดงาน
                            </Link>
                          )
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQCard>
      )}
    </div>
  );
}
