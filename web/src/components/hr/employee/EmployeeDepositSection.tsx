import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCompanies } from '../../../api/client';
import {
  addLegacyDeposit,
  deleteDepositLedgerEntry,
  fetchEmployeeDepositBalance,
  fetchEmployeeDepositLedger,
  updateEmployeeDepositSettings,
  type DepositLedgerEntry,
  type EmployeeDepositBalance,
} from '../../../api/employee-deposit';
import { useAuth } from '../../../context/AuthContext';
import { th } from '../../../i18n/th-labels';
import { WorkHQButton, WorkHQCard } from '../../ui';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Global deposit cap (THB) — matches payroll.deposits running_total check. */
const DEPOSIT_CAP = 3000;

const EMPTY_BALANCE: EmployeeDepositBalance = {
  employeeId: '',
  balance: 0,
  ledgerBalance: 0,
  refundableEstimate: 0,
  depositDeductionExempt: false,
  legacyDepositAmount: 0,
  legacyDepositCompanyId: null,
  legacyDepositCompanyCode: null,
  legacyDepositCompanyName: null,
  legacyEntries: [],
  collectorBreakdown: [],
};

interface EmployeeDepositSectionProps {
  employeeId: string;
  /** Show summary first; edit form only when expanded. */
  compact?: boolean;
}

export function EmployeeDepositSection({ employeeId, compact = false }: EmployeeDepositSectionProps) {
  const { can } = useAuth();
  const canEdit = can('employee:write');

  const [balance, setBalance] = useState<EmployeeDepositBalance | null>(null);
  const [ledger, setLedger] = useState<DepositLedgerEntry[]>([]);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!compact);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [depositDeductionExempt, setDepositDeductionExempt] = useState(false);
  const [legacyDepositAmount, setLegacyDepositAmount] = useState('');
  const [legacyDepositCompanyId, setLegacyDepositCompanyId] = useState('');
  const [reason, setReason] = useState('');

  const applyBalance = useCallback((bal: EmployeeDepositBalance) => {
    setBalance(bal);
    setDepositDeductionExempt(bal.depositDeductionExempt);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setBalanceError(null);
    try {
      const [bal, ledgerRes, companyList] = await Promise.all([
        fetchEmployeeDepositBalance(employeeId),
        fetchEmployeeDepositLedger(employeeId).catch(() => ({ employeeId, entries: [] as DepositLedgerEntry[] })),
        canEdit ? fetchCompanies() : Promise.resolve([]),
      ]);
      applyBalance(bal);
      setLedger(ledgerRes.entries);
      setCompanies(companyList);
      setFormError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : th.common.errorGeneric;
      setBalanceError(message);
      setBalance(null);
      if (canEdit) {
        try {
          setCompanies(await fetchCompanies());
        } catch {
          setCompanies([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [applyBalance, canEdit, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveExempt() {
    if (!reason.trim()) {
      setFormError('กรุณาระบุเหตุผลการบันทึก');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateEmployeeDepositSettings(employeeId, {
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
    if (!reason.trim()) {
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
      await addLegacyDeposit(employeeId, {
        companyId: legacyDepositCompanyId,
        amount,
        reason: reason.trim(),
      });
      if (depositDeductionExempt !== (balance?.depositDeductionExempt ?? false)) {
        await updateEmployeeDepositSettings(employeeId, {
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

  async function removeDepositEntry(entryId: string | null, companyLabel: string, amount: number) {
    const deleteReason = window.prompt(
      `เหตุผลการลบรายการ ${companyLabel} ฿${formatMoney(amount)}`,
    );
    if (!deleteReason?.trim()) return;

    const targetId = entryId ?? 'profile';
    setBusyId(targetId);
    try {
      await deleteDepositLedgerEntry(employeeId, targetId, deleteReason.trim());
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusyId(null);
    }
  }

  const displayBalance = balance ?? { ...EMPTY_BALANCE, employeeId };
  const profileLegacyRows = (displayBalance.legacyEntries ?? []).filter((row) => row.source === 'profile');
  const depositTableRows = [
    ...profileLegacyRows.map((row) => ({
      key: `profile-${row.companyId}`,
      entryId: null as string | null,
      companyLabel: row.companyName ?? row.companyCode ?? row.companyId.slice(0, 8),
      amount: row.amount,
      isLegacy: true,
    })),
    ...ledger.map((row) => ({
      key: row.id,
      entryId: row.id,
      companyLabel: row.owningCompanyName ?? row.owningCompanyCode ?? '—',
      amount: row.amount,
      isLegacy: row.isLegacy,
    })),
  ];
  const usedTowardCap = displayBalance.balance;
  const remainingCap = Math.max(0, DEPOSIT_CAP - usedTowardCap);
  const capFull = remainingCap <= 0;
  const capPercent = Math.min(100, Math.round((usedTowardCap / DEPOSIT_CAP) * 100));

  return (
    <WorkHQCard
      title={th.employeeDeposit.settingsTitle}
      className="whq-detail-card whq-detail-card--wide whq-employee-deposit-section whq-payroll-setup-card"
      data-testid="employee-deposit-section"
      id="deposit-settings"
    >
      <p className="whq-muted">{th.employeeDeposit.settingsDesc}</p>
      <p className="whq-muted">
        บันทึกแยกตามบริษัทได้ เช่น หักจาก SB 1,000 และ KW 2,000 — ตอนลาออกจะคืนถูกบริษัท
      </p>
      <p className="whq-muted whq-text-sm">
        ถ้าพนักงานหักครบก่อนใช้ระบบแล้ว ให้ติ๊ก &quot;ไม่หักค่าประกันแล้ว&quot; ได้เลย — ถ้าเคยบันทึกยอดตั้งต้นผิด กดลบรายการ &quot;ก่อนใช้ระบบ&quot; ได้
      </p>

      {loading ? (
        <p className="whq-muted">{th.common.loading}</p>
      ) : (
        <>
          {balanceError && (
            <p className="whq-error whq-mb-md">
              โหลดยอดเงินประกันไม่สำเร็จ ({balanceError}) — ยังสามารถตั้งค่าด้านล่างได้
            </p>
          )}

          {balance && (
            <>
              <div className="whq-deposit-summary-strip">
                <div className="whq-deposit-summary-item">
                  <span className="whq-deposit-summary-label">{th.employeeDeposit.balanceTitle}</span>
                  <strong>฿{formatMoney(displayBalance.balance)}</strong>
                </div>
                <div className="whq-deposit-summary-item">
                  <span className="whq-deposit-summary-label">{th.employeeDeposit.refundable}</span>
                  <strong>฿{formatMoney(displayBalance.refundableEstimate)}</strong>
                </div>
                {displayBalance.depositDeductionExempt && (
                  <span className="whq-badge whq-badge-success">{th.employeeDeposit.exemptBadge}</span>
                )}
                {displayBalance.legacyDepositAmount > 0 && (
                  <div className="whq-deposit-summary-item">
                    <span className="whq-deposit-summary-label">{th.employeeDeposit.legacyAmount}</span>
                    <strong>฿{formatMoney(displayBalance.legacyDepositAmount)}</strong>
                  </div>
                )}
              </div>

              <div className="whq-deposit-cap" data-testid="deposit-cap-bar">
                <div className="whq-deposit-cap__label">
                  <span>ใช้ไปแล้ว ฿{formatMoney(usedTowardCap)} / เพดาน ฿{formatMoney(DEPOSIT_CAP)}</span>
                  <span>{capFull ? 'เต็มแล้ว' : `เหลือเพิ่มได้ ฿${formatMoney(remainingCap)}`}</span>
                </div>
                <div className="whq-deposit-cap__track" aria-hidden>
                  <div
                    className={`whq-deposit-cap__fill${capFull ? ' is-full' : ''}`}
                    style={{ width: `${capPercent}%` }}
                  />
                </div>
                {capFull && (
                  <p className="whq-deposit-cap__warn">
                    ยอดรวมครบเพดาน ฿{formatMoney(DEPOSIT_CAP)} แล้ว — ลบหรือลดรายการเดิมก่อนเพิ่มรายการใหม่
                  </p>
                )}
              </div>

              {(depositTableRows.length > 0) && (
                <div className="whq-table-wrap whq-mb-md">
                  <table className="whq-table" data-testid="deposit-collector-table">
                    <thead>
                      <tr>
                        <th>{th.employeeDeposit.collectorTitle}</th>
                        <th className="whq-table-num">{th.employeeDeposit.collected}</th>
                        {canEdit && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {depositTableRows.map((row) => (
                        <tr key={row.key} data-testid={`deposit-row-${row.key}`}>
                          <td>
                            {row.companyLabel}
                            {row.isLegacy && (
                              <span className="whq-badge whq-badge-secondary whq-ml-sm">
                                {th.employeeDeposit.legacyTag}
                              </span>
                            )}
                          </td>
                          <td className="whq-table-num">฿{formatMoney(row.amount)}</td>
                          {canEdit && (
                            <td>
                              <WorkHQButton
                                type="button"
                                variant="danger"
                                disabled={busyId === (row.entryId ?? 'profile')}
                                onClick={() => void removeDepositEntry(
                                  row.entryId,
                                  row.companyLabel,
                                  row.amount,
                                )}
                              >
                                ลบ
                              </WorkHQButton>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {canEdit ? (
            <>
              {compact && (
                <div className="whq-btn-group whq-mb-md">
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    onClick={() => setShowForm((v) => !v)}
                  >
                    {showForm ? 'ซ่อนฟอร์มตั้งค่า' : 'ตั้งค่าเงินประกัน'}
                  </WorkHQButton>
                </div>
              )}
              {showForm && (
                <>
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
                        data-testid="deposit-legacy-amount"
                        onChange={(e) => setLegacyDepositAmount(e.target.value)}
                      />
                    </label>
                    <label className="whq-field">
                      <span className="whq-field-label">{th.employeeDeposit.legacyCompanyLabel}</span>
                      <select
                        className="whq-input"
                        value={legacyDepositCompanyId}
                        data-testid="deposit-legacy-company"
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
                        data-testid="deposit-legacy-reason"
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="เช่น หักจาก SB ก่อนย้ายมา KW"
                      />
                    </label>
                  </div>
                  <div className="whq-btn-group whq-mt-md">
                    <WorkHQButton
                      type="button"
                      variant="primary"
                      disabled={saving}
                      data-testid="deposit-legacy-add"
                      onClick={() => void addLegacyEntry()}
                    >
                      {saving ? th.common.saving : 'เพิ่มรายการตามบริษัท'}
                    </WorkHQButton>
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={saving}
                      data-testid="deposit-exempt-save"
                      onClick={() => void saveExempt()}
                    >
                      บันทึกสถานะไม่หัก
                    </WorkHQButton>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="whq-muted">ติดต่อ HR หากต้องการปรับการหักเงินประกัน</p>
          )}

          <p className="whq-muted whq-mt-md">
            <Link to={`/hr/employees/${employeeId}/deposit`} className="whq-inline-link">
              ดูประวัติเงินประกันแบบเต็ม
            </Link>
          </p>
        </>
      )}
    </WorkHQCard>
  );
}
