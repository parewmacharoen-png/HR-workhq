import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import type {
  PayrollOverviewComponentLine,
  PayrollOverviewEmployeeDetail,
} from '../../api/payroll-overview';
import {
  addPayrollManualItem,
  deletePayrollItem,
  fetchPayslip,
  generatePayslip,
  updatePayrollItem,
  type PayslipResponse,
} from '../../api/payroll';
import { downloadPayslipPdf } from '../../api/manual-payroll-items';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../LoadingState';
import { WorkHQButton, WorkHQCard } from '../ui';
import { th } from '../../i18n/th-labels';
import { humanizePayrollNote, payrollItemTypeLabel } from '../../lib/payroll-item-display';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

const ADD_ITEM_OPTIONS: Array<{ itemType: string; label: string; deduction: boolean }> = [
  { itemType: 'salary', label: 'เงินเดือน', deduction: false },
  { itemType: 'meal_allowance', label: 'ค่าอาหาร', deduction: false },
  { itemType: 'cross_border', label: 'ค่าข้าม', deduction: false },
  { itemType: 'bonus', label: 'โบนัส', deduction: false },
  { itemType: 'ot', label: 'OT', deduction: false },
  { itemType: 'commission', label: 'คอมมิชชั่น', deduction: false },
  { itemType: 'manual_adjustment', label: 'รายได้อื่นๆ', deduction: false },
  { itemType: 'late_deduction', label: 'หักมาสาย', deduction: true },
  { itemType: 'absence_deduction', label: 'หักขาดงาน', deduction: true },
  { itemType: 'deposit', label: 'หักประกัน', deduction: true },
  { itemType: 'manual_adjustment', label: 'หักอื่นๆ', deduction: true },
];

function EditableLineRow({
  line,
  canEdit,
  cycleId,
  busy,
  onSaved,
}: {
  line: PayrollOverviewComponentLine;
  canEdit: boolean;
  cycleId: string;
  busy: boolean;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(Math.abs(line.amount)));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(String(Math.abs(line.amount)));
    setReason('');
    setError(null);
  }, [line.id, line.amount]);

  const dirty = Number(amount) !== Math.abs(line.amount);

  async function handleSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setError('จำนวนเงินต้องไม่ติดลบ');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePayrollItem(cycleId, line.id, {
        amount: value,
        note: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบรายการ「${payrollItemTypeLabel(line.itemType)}」?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePayrollItem(cycleId, line.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        {payrollItemTypeLabel(line.itemType)}
        {line.manualOverride ? (
          <div className="whq-muted whq-text-sm">แก้ด้วยมือแล้ว</div>
        ) : null}
        {!line.approved ? (
          <div className="whq-muted whq-text-sm">รออนุมัติ</div>
        ) : null}
      </td>
      <td>
        {canEdit ? (
          <input
            className="whq-input"
            type="number"
            min={0}
            step="1"
            value={amount}
            disabled={busy || saving}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: '7rem' }}
          />
        ) : (
          formatMoney(line.amount)
        )}
      </td>
      <td style={{ whiteSpace: 'pre-line' }}>
        {humanizePayrollNote(line.note)}
        {canEdit && (
          <div style={{ marginTop: '0.35rem' }}>
            <input
              className="whq-input"
              type="text"
              placeholder="เหตุผลที่แก้ (ถ้ามี)"
              value={reason}
              disabled={busy || saving}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        {error ? <p className="whq-error-text">{error}</p> : null}
      </td>
      {canEdit && (
        <td>
          <div className="whq-btn-group">
            <WorkHQButton
              type="button"
              variant="primary"
              disabled={busy || saving || !dirty}
              onClick={() => void handleSave()}
            >
              {saving ? '…' : 'บันทึก'}
            </WorkHQButton>
            <WorkHQButton
              type="button"
              variant="ghost"
              disabled={busy || saving}
              onClick={() => void handleDelete()}
            >
              ลบ
            </WorkHQButton>
          </div>
        </td>
      )}
    </tr>
  );
}

function ComponentSection({
  title,
  lines,
  canEdit,
  cycleId,
  busy,
  onSaved,
}: {
  title: string;
  lines: PayrollOverviewComponentLine[];
  canEdit: boolean;
  cycleId: string;
  busy: boolean;
  onSaved: () => void;
}) {
  if (lines.length === 0) return null;
  return (
    <WorkHQCard title={title}>
      <div className="whq-table-wrap">
        <table className="whq-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th>จำนวนเงิน</th>
              <th>รายละเอียด</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <EditableLineRow
                key={line.id}
                line={line}
                canEdit={canEdit}
                cycleId={cycleId}
                busy={busy}
                onSaved={onSaved}
              />
            ))}
          </tbody>
        </table>
      </div>
    </WorkHQCard>
  );
}

export interface PayrollOverviewEmployeeDetailModalProps {
  detail: PayrollOverviewEmployeeDetail | null;
  loading: boolean;
  onClose: () => void;
  cycleId?: string;
  onChanged?: () => void;
}

export function PayrollOverviewEmployeeDetailModal({
  detail,
  loading,
  onClose,
  cycleId,
  onChanged,
}: PayrollOverviewEmployeeDetailModalProps) {
  const { can } = useAuth();
  const canWrite = can('payroll:write');
  const [payslip, setPayslip] = useState<PayslipResponse | null>(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [payslipError, setPayslipError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [addOptionIndex, setAddOptionIndex] = useState(0);
  const [addAmount, setAddAmount] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const canEdit = Boolean(canWrite && detail?.canEditItems && cycleId);

  useEffect(() => {
    setPayslip(null);
    setPayslipError(null);
    setFlash(null);
    if (!cycleId || !detail?.employeeId || loading) return;
    setPayslipLoading(true);
    fetchPayslip(cycleId, detail.employeeId)
      .then(setPayslip)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setPayslip(null);
          return;
        }
        setPayslip(null);
      })
      .finally(() => setPayslipLoading(false));
  }, [cycleId, detail?.employeeId, loading, detail?.row.netPayAmount]);

  async function handleGeneratePayslip() {
    if (!cycleId || !detail?.employeeId) return;
    setPayslipLoading(true);
    setPayslipError(null);
    try {
      setPayslip(await generatePayslip(cycleId, detail.employeeId));
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : th.common.errorGeneric;
      setPayslipError(message);
    } finally {
      setPayslipLoading(false);
    }
  }

  async function handleDownloadPayslipPdf() {
    if (!cycleId || !detail?.employeeId) return;
    setPdfBusy(true);
    setPayslipError(null);
    try {
      await downloadPayslipPdf(cycleId, detail.employeeId);
    } catch (err) {
      setPayslipError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setPdfBusy(false);
    }
  }

  function handleItemChanged() {
    setFlash('บันทึกแล้ว — ถ้ามีสลิปเก่า ต้องสร้างสลิปใหม่');
    setPayslip(null);
    onChanged?.();
  }

  async function handleAddItemByIndex() {
    if (!cycleId || !detail?.employeeId) return;
    const value = Number(addAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setAddError('กรอกจำนวนเงินที่มากกว่า 0');
      return;
    }
    const selected = ADD_ITEM_OPTIONS[addOptionIndex] ?? ADD_ITEM_OPTIONS[0]!;
    const signed = selected.deduction ? -Math.abs(value) : Math.abs(value);
    setAddBusy(true);
    setAddError(null);
    try {
      await addPayrollManualItem(cycleId, {
        employeeId: detail.employeeId,
        itemType: selected.itemType,
        amount: signed,
        note: addNote.trim() || selected.label,
      });
      setAddAmount('');
      setAddNote('');
      handleItemChanged();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="modal-backdrop whq-payroll-detail-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-panel whq-detail-modal whq-payroll-detail-modal"
        data-testid="payroll-overview-detail-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{detail?.employeeName ?? th.payrollOverview.detailLoading}</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        {loading || !detail ? (
          <LoadingState />
        ) : (
          <div className="whq-detail-modal-body">
            <div className="whq-info-row">
              <span className="whq-info-label">{th.payrollCycle.colEmployee}</span>
              <span className="whq-info-value">{detail.employeeCode}</span>
            </div>
            <div className="whq-info-row">
              <span className="whq-info-label">{th.payrollCycle.colNet}</span>
              <span className="whq-info-value">{formatMoney(detail.row.netPayAmount)}</span>
            </div>
            {flash && <p className="whq-success-text">{flash}</p>}
            {canEdit && (
              <p className="whq-muted whq-text-sm">
                แก้จำนวนเงินได้เมื่อรอบยังเปิดอยู่ — รายการที่แก้ด้วยมือจะไม่ถูกทับตอนคำนวณรอบใหม่
              </p>
            )}
            {!detail.canEditItems && canWrite && (
              <p className="whq-muted whq-text-sm">
                รอบนี้{detail.cycleStatus === 'locked' ? 'ล็อคแล้ว' : 'จ่ายแล้ว'} — แก้รายการไม่ได้
              </p>
            )}

            <ComponentSection
              title={th.payrollOverview.salaryComponents}
              lines={detail.salaryComponents}
              canEdit={canEdit}
              cycleId={cycleId ?? detail.cycleId}
              busy={addBusy}
              onSaved={handleItemChanged}
            />
            <ComponentSection
              title={th.payrollOverview.deductions}
              lines={detail.deductions}
              canEdit={canEdit}
              cycleId={cycleId ?? detail.cycleId}
              busy={addBusy}
              onSaved={handleItemChanged}
            />
            <ComponentSection
              title={th.payrollOverview.overtime}
              lines={detail.overtime}
              canEdit={canEdit}
              cycleId={cycleId ?? detail.cycleId}
              busy={addBusy}
              onSaved={handleItemChanged}
            />
            <ComponentSection
              title={th.payrollOverview.commission}
              lines={detail.commission}
              canEdit={canEdit}
              cycleId={cycleId ?? detail.cycleId}
              busy={addBusy}
              onSaved={handleItemChanged}
            />

            {canEdit && (
              <WorkHQCard title="เพิ่มรายการด้วยมือ">
                <div className="whq-form-stack">
                  <label>
                    ประเภท
                    <select
                      className="whq-input"
                      value={addOptionIndex}
                      disabled={addBusy}
                      onChange={(e) => setAddOptionIndex(Number(e.target.value))}
                    >
                      {ADD_ITEM_OPTIONS.map((opt, idx) => (
                        <option key={`${opt.itemType}-${opt.label}`} value={idx}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    จำนวนเงิน (บาท)
                    <input
                      className="whq-input"
                      type="number"
                      min={0}
                      value={addAmount}
                      disabled={addBusy}
                      onChange={(e) => setAddAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    หมายเหตุ
                    <input
                      className="whq-input"
                      type="text"
                      value={addNote}
                      disabled={addBusy}
                      onChange={(e) => setAddNote(e.target.value)}
                      placeholder="เช่น ปรับตามตกลงพิเศษ"
                    />
                  </label>
                  {addError ? <p className="whq-error-text">{addError}</p> : null}
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={addBusy}
                    onClick={() => void handleAddItemByIndex()}
                  >
                    {addBusy ? 'กำลังเพิ่ม…' : 'เพิ่มรายการ'}
                  </WorkHQButton>
                </div>
              </WorkHQCard>
            )}

            {detail.advancePay.length > 0 && (
              <WorkHQCard title={th.payrollOverview.advancePay}>
                <ul className="whq-list-plain">
                  {detail.advancePay.map((advance) => (
                    <li key={advance.advanceRequestId}>
                      {formatMoney(advance.amount)} · {advance.status}
                      {advance.recoveredInCycle ? ` · ${th.payrollOverview.recoveredThisCycle}` : ''}
                    </li>
                  ))}
                </ul>
              </WorkHQCard>
            )}
            {detail.payrollNotes.length > 0 && (
              <WorkHQCard title={th.payrollOverview.notes}>
                <ul className="whq-list-plain">
                  {detail.payrollNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </WorkHQCard>
            )}
            {detail.historyLink && (
              <Link to={detail.historyLink} className="whq-link">{th.payrollOverview.profileLink}</Link>
            )}
            {cycleId && (
              <WorkHQCard title={th.payrollCycle.payslipTitle}>
                {payslipLoading ? (
                  <p className="whq-muted">กำลังโหลดสลิป…</p>
                ) : payslip ? (
                  <div className="whq-detail-card-body">
                    <p>{th.payrollCycle.payslipGross}: {formatMoney(payslip.gross)}</p>
                    <p>{th.payrollCycle.payslipDeductions}: {formatMoney(payslip.deductions)}</p>
                    <p><strong>{th.payrollCycle.payslipNet}: {formatMoney(payslip.net)}</strong></p>
                  </div>
                ) : (
                  <p className="whq-muted">ยังไม่มีสลิป — กดสร้างสลิปจากรายการเงินเดือนในรอบนี้</p>
                )}
                <div className="whq-btn-group" style={{ marginTop: '0.75rem' }}>
                  {canWrite && !payslip && (
                    <WorkHQButton
                      type="button"
                      variant="primary"
                      disabled={payslipLoading}
                      onClick={() => void handleGeneratePayslip()}
                    >
                      {payslipLoading ? 'กำลังสร้าง…' : th.payrollCycle.payslipGenerate}
                    </WorkHQButton>
                  )}
                  {canWrite && payslip && (
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={payslipLoading}
                      onClick={() => void handleGeneratePayslip()}
                    >
                      สร้างสลิปใหม่
                    </WorkHQButton>
                  )}
                  {payslip && (
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={pdfBusy}
                      onClick={() => void handleDownloadPayslipPdf()}
                    >
                      {pdfBusy ? '…' : th.payrollCycle.payslipDownloadPdf}
                    </WorkHQButton>
                  )}
                </div>
                {payslipError ? <p className="whq-error-text">{payslipError}</p> : null}
              </WorkHQCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
