import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  approveSelfOnboarding,
  listSelfOnboardingSubmissions,
  rejectSelfOnboarding,
} from '../../api/employee-onboarding';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { WorkHQButton, WorkHQCard } from '../../components/ui';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  draft: 'กำลังกรอกข้อมูล',
  submitted: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกแล้ว',
};

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  linked: 'เชื่อม Telegram แล้ว',
  started: 'กำลังกรอกข้อมูล',
  pending_review: 'รอตรวจสอบ',
  invite_sent: 'ส่ง invite แล้ว',
  expired: 'invite หมดอายุ',
  rejected: 'ไม่อนุมัติ',
  not_connected: 'ยังไม่เชื่อม Telegram',
};

function labelFor(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}

function employmentSummary(row: Record<string, unknown>): string {
  const json = row.submittedDataJson as Record<string, unknown> | undefined;
  const decl = json?.employmentDeclaration as Record<string, unknown> | undefined;
  if (!decl || !Object.keys(decl).length) return '—';
  const parts: string[] = [];
  if (decl.declaredDepartment) parts.push(`แผนก ${String(decl.declaredDepartment)}`);
  if (decl.declaredPosition) parts.push(String(decl.declaredPosition));
  const companyTeams = decl.companyTeams as Array<Record<string, unknown>> | undefined;
  if (companyTeams?.length) {
    for (const ct of companyTeams) {
      const team = ct.teamSkipped
        ? 'ไม่ระบุทีม'
        : String(ct.teamName ?? '—').replace(/^Team /, 'ทีม ');
      parts.push(`${String(ct.companyName ?? '—')}: ${team}`);
    }
  } else {
    if (decl.declaredTeamName) parts.push(String(decl.declaredTeamName).replace(/^Team /, 'ทีม '));
  }
  return parts.join(' · ') || '—';
}

export default function SelfOnboardingPage() {
  const { companies, scopedCompanyIds, hasCompanyScope, isAllCompanies, companyLabel } = useCompanyScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [data, setData] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');

  const companyNameById = useCallback(
    (id: string) => companies.find((c) => c.id === id)?.name ?? id,
    [companies],
  );

  const load = useCallback(async () => {
    if (!hasCompanyScope) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchForEachCompany(scopedCompanyIds, (companyId) =>
        listSelfOnboardingSubmissions({
          companyId,
          status: status || undefined,
        }),
      );
      const items = rows.flatMap(({ companyId, result }) =>
        (result.items ?? []).map((item) => ({
          ...item,
          companyId,
          companyName: companyNameById(companyId),
        })),
      ) as Array<Record<string, unknown>>;
      items.sort((a, b) => {
        const aTime = a.submittedAt ? new Date(String(a.submittedAt)).getTime() : 0;
        const bTime = b.submittedAt ? new Date(String(b.submittedAt)).getTime() : 0;
        return bTime - aTime;
      });
      setData(items);
      setTotal(items.length);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [hasCompanyScope, scopedCompanyIds, status, companyNameById]);

  useEffect(() => { void load(); }, [load]);

  function setStatusFilter(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('status', next);
    else params.delete('status');
    setSearchParams(params, { replace: true });
  }

  async function approve(id: string) {
    await approveSelfOnboarding(id);
    setMsg('อนุมัติแล้ว');
    await load();
  }

  async function reject(id: string) {
    const reason = window.prompt('เหตุผลที่ไม่อนุมัติ');
    if (!reason) return;
    await rejectSelfOnboarding(id, reason);
    setMsg('ปฏิเสธแล้ว');
    await load();
  }

  if (!hasCompanyScope) {
    return (
      <div className="whq-page">
        <h1 className="whq-page-title">การลงทะเบียนและข้อมูลพนักงาน</h1>
        <p className="whq-muted">กรุณาเลือกบริษัทหรือ &quot;ทุกบริษัท&quot; จากแถบด้านบน</p>
      </div>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">การลงทะเบียนและข้อมูลพนักงาน</h1>
      <p className="whq-muted">
        กำลังดู: <strong>{companyLabel}</strong>
        {isAllCompanies ? ` (${scopedCompanyIds.length} บริษัท)` : ''}
        {' — '}
        ตัวเลขบนแดชบอร์ดและสถานะ Telegram อ้างอิงจากรายการนี้
      </p>
      {msg && <p>{msg}</p>}
      <WorkHQCard title="ตัวกรอง" className="whq-detail-card">
        <label>
          สถานะข้อมูล{' '}
          <select value={status} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">ทั้งหมด</option>
            <option value="draft">กำลังกรอกข้อมูล</option>
            <option value="submitted">รอตรวจสอบ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="rejected">ไม่อนุมัติ</option>
          </select>
        </label>
        {' '}
        <WorkHQButton onClick={() => void load()}>รีเฟรช</WorkHQButton>
        <p className="whq-muted">พบ {total} รายการ</p>
      </WorkHQCard>

      <table className="data-table">
        <thead>
          <tr>
            {isAllCompanies && <th>บริษัท</th>}
            <th>พนักงาน</th>
            <th>เบอร์โทร</th>
            <th>สถานะ Telegram</th>
            <th>สถานะข้อมูล</th>
            <th>ข้อมูลงาน (ที่พนักงานระบุ)</th>
            <th>ส่งเมื่อ</th>
            <th>การดำเนินการ</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={isAllCompanies ? 8 : 7} className="whq-muted">ไม่พบรายการ</td>
            </tr>
          ) : data.map((row) => {
            const emp = row.employee as Record<string, unknown> | undefined;
            const rowStatus = String(row.status);
            const connectionStatus = String(row.connectionStatus ?? 'not_connected');
            return (
              <tr key={String(row.id)}>
                {isAllCompanies && <td>{String(row.companyName ?? '—')}</td>}
                <td>{emp ? `${String(emp.globalId)} ${String(emp.firstName)} ${String(emp.lastName)}` : '—'}</td>
                <td>{emp ? String(emp.phone ?? '—') : '—'}</td>
                <td>{labelFor(CONNECTION_STATUS_LABELS, connectionStatus)}</td>
                <td>{labelFor(SUBMISSION_STATUS_LABELS, rowStatus)}</td>
                <td className="whq-muted" style={{ maxWidth: 280 }}>{employmentSummary(row)}</td>
                <td>{row.submittedAt ? new Date(String(row.submittedAt)).toLocaleString('th-TH') : '—'}</td>
                <td>
                  {rowStatus === 'submitted' && (
                    <>
                      <WorkHQButton onClick={() => void approve(String(row.id))}>อนุมัติ</WorkHQButton>
                      {' '}
                      <WorkHQButton onClick={() => void reject(String(row.id))}>ไม่อนุมัติ</WorkHQButton>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
