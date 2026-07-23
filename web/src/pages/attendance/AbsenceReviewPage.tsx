import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAbsences, runAbsenceFlag, approveAbsence, waiveAbsence } from '../../api/absence';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { useAuth } from '../../context/AuthContext';
import { fetchForEachCompany } from '../../utils/multi-company';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { WorkHQButton, WorkHQCard, WorkHQDateInput } from '../../components/ui';
import { WorkHQEmptyState } from '../../components/workhq';

interface AbsenceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  status: string;
  positionSnapshot: string | null;
  penaltyAmount: number | null;
  penaltyExempt?: boolean;
  contactNotes: string | null;
  companyId?: string;
  companyName?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AbsenceReviewPage() {
  const { can } = useAuth();
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    companyLabel,
    isAllCompanies,
  } = useCompanyScope();
  const canWrite = can('attendance:write');
  /** Empty string = all companies in scope */
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [status, setStatus] = useState('flagged');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayIso);
  const [rows, setRows] = useState<AbsenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flagMsg, setFlagMsg] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [modal, setModal] = useState<'approve' | 'waive' | null>(null);
  const [contactNotes, setContactNotes] = useState('');
  const [contactAt, setContactAt] = useState(new Date().toISOString().slice(0, 16));
  const [waiveReason, setWaiveReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const companyNameOf = useCallback((id: string) => {
    const match = companies.find((company) => company.id === id);
    return match ? `${match.name} (${match.code})` : id.slice(0, 8);
  }, [companies]);

  const activeCompanyIds = filterCompanyId
    ? [filterCompanyId]
    : scopedCompanyIds;

  const load = useCallback(async () => {
    if (!hasCompanyScope || activeCompanyIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await fetchForEachCompany(activeCompanyIds, (companyId) =>
        listAbsences({ companyId, status, from, to }),
      );
      const merged = results
        .flatMap((row) => (row.result.items as AbsenceRow[]).map((item) => ({
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
  }, [activeCompanyIds, companyNameOf, from, hasCompanyScope, status, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRunFlag(targetDate?: string) {
    if (!canWrite || activeCompanyIds.length === 0) return;
    const workDate = targetDate ?? todayIso();
    setFlagging(true);
    setFlagMsg('');
    try {
      const results = await Promise.all(
        activeCompanyIds.map(async (companyId) => {
          try {
            return await runAbsenceFlag({ companyId, workDate });
          } catch {
            return { flaggedCount: 0, skippedCount: 0 };
          }
        }),
      );
      const flagged = results.reduce((sum, row) => sum + row.flaggedCount, 0);
      const skipped = results.reduce((sum, row) => sum + row.skippedCount, 0);
      setFlagMsg(`สร้างรายการขาดงาน ${flagged} รายการ (ข้าม ${skipped}) จาก ${activeCompanyIds.length} บริษัท`);
      if (workDate >= from && workDate <= to) await load();
    } catch (err) {
      setFlagMsg(err instanceof Error ? err.message : 'สร้างรายการไม่สำเร็จ');
    } finally {
      setFlagging(false);
    }
  }

  function openModal(id: string, type: 'approve' | 'waive') {
    setActionId(id);
    setModal(type);
    setContactNotes('');
    setWaiveReason('');
    setSubmitError(null);
  }

  async function submitApprove() {
    if (!actionId || contactNotes.trim().length < 10) {
      setSubmitError('กรุณากรอกหมายเหตุการติดต่ออย่างน้อย 10 ตัวอักษร');
      return;
    }
    try {
      await approveAbsence(actionId, {
        contactAttemptedAt: new Date(contactAt).toISOString(),
        contactNotes: contactNotes.trim(),
      });
      setModal(null);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ');
    }
  }

  async function submitWaive() {
    if (!actionId || waiveReason.trim().length < 3) {
      setSubmitError('กรุณากรอกเหตุผล');
      return;
    }
    try {
      await waiveAbsence(actionId, { reason: waiveReason.trim() });
      setModal(null);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ');
    }
  }

  if (!hasCompanyScope) {
    return (
      <div className="whq-page whq-att-cc">
        <header className="whq-att-cc-hero">
          <p className="whq-att-cc-eyebrow">เวลาเข้างาน › ตรวจสอบขาดงาน</p>
          <h1 className="whq-att-cc-title">ตรวจสอบขาดงาน</h1>
          <p className="whq-att-cc-subtitle">เลือกบริษัทจากแถบด้านบน หรือเลือกทุกบริษัทเพื่อดูทุกคน</p>
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
        <p className="whq-att-cc-eyebrow">เวลาเข้างาน › ตรวจสอบขาดงาน</p>
        <h1 className="whq-att-cc-title">ตรวจสอบขาดงาน</h1>
        <p className="whq-att-cc-subtitle">
          กำลังดู: <strong>{filterCompanyId ? companyNameOf(filterCompanyId) : companyLabel}</strong>
          {isAllCompanies && !filterCompanyId
            ? ` · พนักงานทุกคนจาก ${scopedCompanyIds.length} บริษัท`
            : ''}
        </p>
        <p className="whq-att-cc-hint">
          ระบบสร้างรายการอัตโนมัติเมื่อเลยเวลาเข้างานตามกะ (ไม่เช็กอิน · ไม่ลา · ไม่วันหยุด)
          {' · '}
          <Link to="/approvals">อนุมัติรวมที่ศูนย์อนุมัติ →</Link>
        </p>
      </header>

      <WorkHQCard className="whq-att-cc-risk-card">
        <div className="whq-att-cc-toolbar" style={{ marginTop: 0 }}>
          {isAllCompanies && (
            <label className="whq-att-cc-field">
              <span>บริษัท</span>
              <select
                value={filterCompanyId}
                onChange={(event) => setFilterCompanyId(event.target.value)}
                data-testid="absence-filter-company"
              >
                <option value="">ทุกบริษัท ({scopedCompanyIds.length})</option>
                {companies
                  .filter((company) => scopedCompanyIds.includes(company.id))
                  .map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} ({company.code})
                    </option>
                  ))}
              </select>
            </label>
          )}
          {!isAllCompanies && (
            <p className="whq-muted" style={{ margin: 0 }}>
              บริษัท: <strong>{companyLabel}</strong>
            </p>
          )}
          <label className="whq-att-cc-field">
            <span>สถานะ</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="flagged">รอตรวจสอบ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="waived">ยกเลิกแล้ว</option>
              <option value="disputed">โต้แย้ง</option>
            </select>
          </label>
          <label className="whq-att-cc-field">
            <span>จากวันที่</span>
            <WorkHQDateInput value={from} onChange={setFrom} />
          </label>
          <label className="whq-att-cc-field">
            <span>ถึงวันที่</span>
            <WorkHQDateInput value={to} onChange={setTo} />
          </label>
          <WorkHQButton variant="secondary" onClick={() => void load()}>รีเฟรช</WorkHQButton>
          {canWrite && (
            <WorkHQButton
              variant="primary"
              onClick={() => void handleRunFlag(todayIso())}
              disabled={flagging}
            >
              {flagging ? 'กำลังสร้าง…' : 'สร้างรายการวันนี้'}
            </WorkHQButton>
          )}
        </div>
        {flagMsg && <p className="whq-muted">{flagMsg}</p>}
      </WorkHQCard>

      {loading && <LoadingState />}
      {!loading && error != null && <ErrorState error={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title" style={{ textAlign: 'center' }}>
            ไม่มีรายการขาดงานในช่วงที่เลือก
          </p>
          <p className="whq-muted" style={{ textAlign: 'center' }}>
            ถ้าวันนี้ยังไม่มีใครเช็กอิน รอจนเลยเวลากะเข้างาน หรือกด &quot;สร้างรายการวันนี้&quot;
          </p>
        </WorkHQCard>
      )}
      {!loading && !error && rows.length > 0 && (
        <WorkHQCard>
          <p className="whq-att-cc-section-title">พบ {rows.length} รายการ</p>
          <div className="whq-table-wrap">
            <table className="whq-table data-table">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  {isAllCompanies && !filterCompanyId && <th>บริษัท</th>}
                  <th>วันที่</th>
                  <th>ตำแหน่ง</th>
                  <th>สถานะ</th>
                  <th>ค่าปรับ</th>
                  <th>หมายเหตุ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.employeeName}</td>
                    {isAllCompanies && !filterCompanyId && (
                      <td>{row.companyName ?? '—'}</td>
                    )}
                    <td>{row.workDate}</td>
                    <td>{row.positionSnapshot ?? '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      {row.status === 'approved'
                        ? row.penaltyExempt
                          ? 'ยกเว้น'
                          : `฿${row.penaltyAmount?.toLocaleString() ?? '0'}`
                        : '—'}
                    </td>
                    <td>{row.contactNotes ?? '—'}</td>
                    <td>
                      {row.status === 'flagged' && canWrite && (
                        <>
                          <WorkHQButton onClick={() => openModal(row.id, 'approve')}>อนุมัติ</WorkHQButton>
                          {' '}
                          <WorkHQButton onClick={() => openModal(row.id, 'waive')}>ยกเลิก</WorkHQButton>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQCard>
      )}

      {modal && (
        <div className="modal-overlay" role="dialog">
          <div className="card modal">
            <h2>{modal === 'approve' ? 'อนุมัติการขาดงาน' : 'ยกเลิกการขาดงาน'}</h2>
            {submitError && <p className="error-text">{submitError}</p>}
            {modal === 'approve' ? (
              <>
                <label>
                  วันที่ติดต่อ
                  <input type="datetime-local" value={contactAt} onChange={(e) => setContactAt(e.target.value)} />
                </label>
                <label>
                  หมายเหตุการติดต่อ (ขั้นต่ำ 10 ตัวอักษร)
                  <textarea value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} rows={3} />
                </label>
                <WorkHQButton onClick={() => void submitApprove()}>ยืนยันอนุมัติ</WorkHQButton>
              </>
            ) : (
              <>
                <label>
                  เหตุผล
                  <textarea value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} rows={3} />
                </label>
                <WorkHQButton onClick={() => void submitWaive()}>ยืนยันยกเลิก</WorkHQButton>
              </>
            )}
            <WorkHQButton variant="secondary" onClick={() => setModal(null)}>ปิด</WorkHQButton>
          </div>
        </div>
      )}

      <p className="whq-muted" style={{ textAlign: 'center', marginTop: '1rem' }}>
        <Link to="/attendance/daily">กลับไปบันทึกประจำวัน</Link>
        {' · '}
        <Link to="/attendance">เมนูเวลาเข้างาน</Link>
      </p>
    </div>
  );
}
