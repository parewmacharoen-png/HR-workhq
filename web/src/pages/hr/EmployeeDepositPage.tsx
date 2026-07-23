import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCompanies } from '../../api/client';
import {
  addLegacyDeposit,
  deleteDepositLedgerEntry,
  fetchEmployeeDepositBalance,
  fetchEmployeeDepositLedger,
  updateDepositLedgerEntry,
  updateEmployeeDepositSettings,
  type DepositLedgerEntry,
  type EmployeeDepositBalance,
} from '../../api/employee-deposit';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { WorkHQButton, WorkHQCard, WorkHQPage } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { th } from '../../i18n/th-labels';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DEPOSIT_CAP = 3000;

export default function EmployeeDepositPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canEdit = can('employee:write');

  const [balance, setBalance] = useState<EmployeeDepositBalance | null>(null);
  const [ledger, setLedger] = useState<DepositLedgerEntry[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [depositDeductionExempt, setDepositDeductionExempt] = useState(false);
  const [legacyDepositAmount, setLegacyDepositAmount] = useState('');
  const [legacyDepositCompanyId, setLegacyDepositCompanyId] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const [bal, led, companyList] = await Promise.all([
        fetchEmployeeDepositBalance(id),
        fetchEmployeeDepositLedger(id),
        fetchCompanies(),
      ]);
      setBalance(bal);
      setLedger(led.entries);
      setCompanies(companyList);
      setDepositDeductionExempt(bal.depositDeductionExempt);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function saveExempt() {
    if (!id || !reason.trim()) {
      setFormError('กรุณาระบุเหตุผลการบันทึก');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateEmployeeDepositSettings(id, {
        depositDeductionExempt,
        reason: reason.trim(),
      });
      setReason('');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  async function addLegacyEntry() {
    if (!id || !reason.trim()) {
      setFormError('กรุณาระบุเหตุผลการบันทึก');
      return;
    }
    const amount = Number(legacyDepositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('กรุณาระบุยอดเงินประกันที่มากกว่า 0');
      return;
    }
    if (!legacyDepositCompanyId) {
      setFormError('กรุณาเลือกบริษัทที่เก็บเงินประกันก่อนใช้ระบบ');
      return;
    }
    const used = balance?.balance ?? 0;
    if (used + amount > DEPOSIT_CAP) {
      const left = Math.max(0, DEPOSIT_CAP - used);
      setFormError(
        left <= 0
          ? `ยอดรวมครบเพดาน ฿${DEPOSIT_CAP.toLocaleString('th-TH')} แล้ว — ลบหรือลดรายการเดิมก่อนเพิ่มรายการใหม่`
          : `เพิ่มไม่ได้ ยอดรวมจะเกินเพดาน ฿${DEPOSIT_CAP.toLocaleString('th-TH')} (เหลือเพิ่มได้ ฿${left.toLocaleString('th-TH')})`,
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await addLegacyDeposit(id, {
        companyId: legacyDepositCompanyId,
        amount,
        reason: reason.trim(),
      });
      if (depositDeductionExempt !== balance?.depositDeductionExempt) {
        await updateEmployeeDepositSettings(id, {
          depositDeductionExempt,
          reason: reason.trim(),
        });
      }
      setLegacyDepositAmount('');
      setLegacyDepositCompanyId('');
      setReason('');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  async function handleEditLedger(row: DepositLedgerEntry) {
    if (!id) return;
    const nextAmountRaw = window.prompt('จำนวนเงินที่หัก (บาท)', String(row.amount));
    if (nextAmountRaw == null) return;
    const nextAmount = Number(nextAmountRaw);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      window.alert('จำนวนเงินไม่ถูกต้อง');
      return;
    }
    const editReason = window.prompt('เหตุผลการแก้ไข');
    if (!editReason?.trim()) return;

    setBusyId(row.id);
    try {
      await updateDepositLedgerEntry(id, row.id, {
        amount: nextAmount,
        reason: editReason.trim(),
      });
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteLedger(row: DepositLedgerEntry) {
    if (!id) return;
    const deleteReason = window.prompt(
      `ลบรายการหัก ฿${formatMoney(row.amount)} ใช่หรือไม่?\nระบุเหตุผล:`,
    );
    if (!deleteReason?.trim()) return;

    setBusyId(row.id);
    try {
      await deleteDepositLedgerEntry(id, row.id, deleteReason.trim());
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!balance) return null;

  return (
    <WorkHQPage>
      <Link to={`/hr/employees/${id}`} className="whq-back-link">{th.employeeDeposit.back}</Link>
      <h1 className="whq-page-title">{th.employeeDeposit.title}</h1>

      <div className="whq-detail-grid">
        <WorkHQCard title={th.employeeDeposit.balanceTitle} className="whq-detail-card">
          <div className="whq-detail-card-body">
            <div className="whq-stat-value whq-stat-value--large">
              ฿{formatMoney(balance.balance)}
            </div>
            {balance.legacyDepositAmount > 0 && (
              <div className="whq-info-row">
                <span className="whq-info-label">{th.employeeDeposit.legacyAmount}</span>
                <span className="whq-info-value">฿{formatMoney(balance.legacyDepositAmount)}</span>
              </div>
            )}
            {balance.ledgerBalance !== balance.balance && (
              <div className="whq-info-row">
                <span className="whq-info-label">{th.employeeDeposit.systemLedger}</span>
                <span className="whq-info-value">฿{formatMoney(balance.ledgerBalance)}</span>
              </div>
            )}
            <div className="whq-info-row">
              <span className="whq-info-label">{th.employeeDeposit.refundable}</span>
              <span className="whq-info-value">฿{formatMoney(balance.refundableEstimate)}</span>
            </div>
            {balance.depositDeductionExempt && (
              <p className="whq-badge whq-badge-success whq-mt-sm">{th.employeeDeposit.exemptBadge}</p>
            )}
            <div className="whq-deposit-cap whq-mt-sm" data-testid="deposit-cap-bar">
              <div className="whq-deposit-cap__label">
                <span>
                  ใช้ไปแล้ว ฿{formatMoney(balance.balance)} / เพดาน ฿{DEPOSIT_CAP.toLocaleString('th-TH')}
                </span>
                <span>
                  {balance.balance >= DEPOSIT_CAP
                    ? 'เต็มแล้ว'
                    : `เหลือเพิ่มได้ ฿${formatMoney(Math.max(0, DEPOSIT_CAP - balance.balance))}`}
                </span>
              </div>
              <div className="whq-deposit-cap__track" aria-hidden>
                <div
                  className={`whq-deposit-cap__fill${balance.balance >= DEPOSIT_CAP ? ' is-full' : ''}`}
                  style={{ width: `${Math.min(100, Math.round((balance.balance / DEPOSIT_CAP) * 100))}%` }}
                />
              </div>
              {balance.balance >= DEPOSIT_CAP && (
                <p className="whq-deposit-cap__warn">
                  ยอดรวมครบเพดานแล้ว — ลบหรือลดรายการเดิมก่อนเพิ่มรายการใหม่
                </p>
              )}
            </div>
            <p className="whq-muted whq-text-sm whq-mt-sm">
              เมื่อยอดรวมครบเพดาน (เงินก่อนใช้ระบบ + หักผ่าน payroll) ระบบจะไม่หักรายเดือนต่อ
              {balance.depositDeductionExempt ? ' — ตอนนี้ตั้งเป็นไม่หักแล้ว' : ''}
            </p>
          </div>
        </WorkHQCard>

        <WorkHQCard title={th.employeeDeposit.collectorTitle} className="whq-detail-card">
          {balance.collectorBreakdown.length === 0 ? (
            <p className="whq-muted">{th.common.noData}</p>
          ) : (
            <table className="whq-table">
              <thead>
                <tr>
                  <th>{th.employeeDeposit.company}</th>
                  <th className="whq-table-num">{th.employeeDeposit.collected}</th>
                </tr>
              </thead>
              <tbody>
                {balance.collectorBreakdown.map((row) => (
                  <tr key={row.companyId}>
                    <td>
                      {row.companyName ?? row.companyCode ?? row.companyId.slice(0, 8)}
                      {row.isLegacy && (
                        <span className="whq-badge whq-badge-secondary whq-ml-sm">
                          {th.employeeDeposit.legacyTag}
                        </span>
                      )}
                    </td>
                    <td className="whq-table-num">฿{formatMoney(row.collectedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WorkHQCard>
      </div>

      {canEdit && (
        <WorkHQCard title={th.employeeDeposit.settingsTitle} className="whq-detail-card whq-detail-card--full">
          <p className="whq-muted">{th.employeeDeposit.settingsDesc}</p>
          <p className="whq-muted">
            เพิ่มรายการแยกตามบริษัทได้ เช่น SB 1,000 แล้วเพิ่ม KW 2,000 อีกครั้ง
          </p>
          {formError && <p className="whq-error">{formError}</p>}
          <div className="whq-form-grid whq-form-grid--2">
            <label className="whq-field whq-field--checkbox">
              <input
                type="checkbox"
                checked={depositDeductionExempt}
                onChange={(e) => setDepositDeductionExempt(e.target.checked)}
              />
              <span>{th.employeeDeposit.exemptLabel}</span>
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDeposit.legacyAmountLabel}</span>
              <input
                className="whq-input"
                type="number"
                min={0}
                step={1}
                placeholder="เช่น 1000"
                value={legacyDepositAmount}
                onChange={(e) => setLegacyDepositAmount(e.target.value)}
              />
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDeposit.legacyCompanyLabel}</span>
              <select
                className="whq-input"
                value={legacyDepositCompanyId}
                onChange={(e) => setLegacyDepositCompanyId(e.target.value)}
              >
                <option value="">— เลือกบริษัท —</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDeposit.reasonLabel}</span>
              <input
                className="whq-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น หักจาก SB ก่อนย้ายมา KW"
              />
            </label>
          </div>
          <div className="whq-btn-group whq-mt-md">
            <WorkHQButton type="button" variant="primary" disabled={saving} onClick={() => void addLegacyEntry()}>
              {saving ? th.common.saving : 'เพิ่มรายการตามบริษัท'}
            </WorkHQButton>
            <WorkHQButton type="button" variant="secondary" disabled={saving} onClick={() => void saveExempt()}>
              บันทึกสถานะไม่หัก
            </WorkHQButton>
          </div>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.employeeDeposit.ledgerTitle} className="whq-detail-card whq-detail-card--full">
        <p className="whq-muted whq-text-sm whq-mb-sm">
          รวมรายการก่อนใช้ระบบและหักผ่าน payroll — แก้ไขหรือลบได้
        </p>
        {ledger.length === 0 ? (
          <p className="whq-muted">{th.common.noData}</p>
        ) : (
          <table className="whq-table">
            <thead>
              <tr>
                <th>{th.employeeDeposit.date}</th>
                <th>{th.employeeDeposit.company}</th>
                <th className="whq-table-num">{th.employeeDeposit.deducted}</th>
                <th className="whq-table-num">{th.employeeDeposit.runningTotal}</th>
                {canEdit && <th>การดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleDateString('th-TH')}</td>
                  <td>
                    {row.owningCompanyName ?? row.owningCompanyCode ?? '—'}
                    {row.isLegacy && (
                      <span className="whq-badge whq-badge-secondary whq-ml-sm">
                        {th.employeeDeposit.legacyTag}
                      </span>
                    )}
                  </td>
                  <td className="whq-table-num">฿{formatMoney(row.amount)}</td>
                  <td className="whq-table-num">฿{formatMoney(row.runningTotal)}</td>
                  {canEdit && (
                    <td>
                      <div className="whq-btn-group">
                        <WorkHQButton
                          type="button"
                          variant="secondary"
                          disabled={busyId === row.id}
                          onClick={() => void handleEditLedger(row)}
                        >
                          แก้ไข
                        </WorkHQButton>
                        <WorkHQButton
                          type="button"
                          variant="danger"
                          disabled={busyId === row.id}
                          onClick={() => void handleDeleteLedger(row)}
                        >
                          ลบ
                        </WorkHQButton>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkHQCard>
    </WorkHQPage>
  );
}
