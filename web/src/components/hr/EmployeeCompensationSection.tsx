import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CompensationTimeline,
  createAndSubmitPromotionReview,
  createAndSubmitSalaryReview,
  createPromotionReview,
  createSalaryReview,
  fetchCompensationTimeline,
  submitPromotionReview,
  submitSalaryReview,
} from '../../api/compensation-review';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { WorkHQButton, WorkHQCard, WorkHQDateInput } from '../../components/ui';
import { th } from '../../i18n/th-labels';
import { EmployeeDepositSection } from './employee/EmployeeDepositSection';
import { EmployeeSharedPayrollSection } from './employee/EmployeeSharedPayrollSection';
import { fetchSharedPayrollInfo, type SharedPayrollInfo } from '../../api/shared-payroll';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  employeeId: string;
  companyId: string;
  /** เปิดฟอร์มตั้งเงินเดือนอัตโนมัติเมื่อยังไม่มีฐานเงินเดือน */
  initialSetup?: boolean;
  /**
   * setup-only: only initial salary form
   * manage: adjustment forms + history + deposit (collapsed forms by default)
   * full: legacy full page (default)
   */
  mode?: 'setup-only' | 'manage' | 'full';
}

export function EmployeeCompensationSection({
  employeeId,
  companyId,
  initialSetup = false,
  mode = 'full',
}: Props) {
  const { user, can } = useAuth();
  const contextCompanyId = useCompanyId();
  const resolvedCompanyId = companyId || contextCompanyId || '';

  const [timeline, setTimeline] = useState<CompensationTimeline | null>(null);
  const [sharedInfo, setSharedInfo] = useState<SharedPayrollInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSalaryForm, setShowSalaryForm] = useState(initialSetup || mode === 'setup-only');
  const [showPromotionForm, setShowPromotionForm] = useState(false);

  useEffect(() => {
    if (initialSetup) setShowSalaryForm(true);
  }, [initialSetup]);

  const [proposedSalary, setProposedSalary] = useState('');
  const [proposedPosition, setProposedPosition] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');

  const canPropose = can('payroll:read')
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      setTimeline(await fetchCompensationTimeline(employeeId, resolvedCompanyId || undefined));
      try {
        setSharedInfo(await fetchSharedPayrollInfo(employeeId));
      } catch {
        setSharedInfo(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [employeeId, resolvedCompanyId]);

  useEffect(() => { void load(); }, [load]);

  async function runCreate(type: 'salary' | 'promotion', submitNow: boolean) {
    if (!resolvedCompanyId) return;
    const isInitial = type === 'salary'
      && timeline != null
      && timeline.currentSalary <= 0
      && timeline.salaryHistory.length === 0;
    const resolvedEffectiveDate = isInitial && timeline?.hireDate
      ? timeline.hireDate
      : (effectiveDate || todayIso());
    if (type === 'promotion' && !effectiveDate) return;
    setBusy(true);
    setError(null);
    try {
      if (type === 'salary') {
        const isInitial = timeline != null && timeline.currentSalary <= 0 && timeline.salaryHistory.length === 0;
        const body = {
          employeeId,
          companyId: resolvedCompanyId,
          proposedSalary: Number(proposedSalary),
          effectiveDate: resolvedEffectiveDate,
          reason: isInitial
            ? 'ตั้งเงินเดือนเริ่มต้น'
            : (reason.trim() || undefined),
          note: isInitial ? undefined : (note.trim() || undefined),
        };
        if (submitNow) await createAndSubmitSalaryReview(body);
        else await createSalaryReview(body);
      } else {
        const body = {
          employeeId,
          companyId: resolvedCompanyId,
          proposedPosition: proposedPosition.trim(),
          effectiveDate: resolvedEffectiveDate,
          reason: reason.trim() || undefined,
          note: note.trim() || undefined,
        };
        if (submitNow) await createAndSubmitPromotionReview(body);
        else await createPromotionReview(body);
      }
      setProposedSalary('');
      setProposedPosition('');
      setReason('');
      setNote('');
      setEffectiveDate('');
      setShowSalaryForm(false);
      setShowPromotionForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft(id: string, type: 'salary' | 'promotion') {
    setBusy(true);
    try {
      if (type === 'salary') await submitSalaryReview(id);
      else await submitPromotionReview(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <WorkHQCard title={th.compensationReview.initialSalaryTitle} className="whq-detail-card whq-payroll-setup-card">
        <div className="whq-state-panel" style={{ minHeight: '4rem' }}>
          <div className="whq-spinner" aria-hidden />
          <p>{th.common.loading}</p>
        </div>
      </WorkHQCard>
    );
  }
  if (!timeline) {
    return (
      <WorkHQCard title={th.compensationReview.createTitle} className="whq-detail-card">
        <p className="whq-error">{error ?? th.common.errorGeneric}</p>
        <WorkHQButton type="button" variant="secondary" onClick={() => void load()}>
          {th.common.retry}
        </WorkHQButton>
      </WorkHQCard>
    );
  }

  const needsInitialSalary = timeline.currentSalary <= 0 && timeline.salaryHistory.length === 0;
  const createSalaryLabel = needsInitialSalary
    ? th.compensationReview.initialSalaryTitle
    : th.compensationReview.createSalary;

  const isSharedSalary = sharedInfo?.mode === 'shared_across_companies'
    || (sharedInfo?.qualifies ?? false);
  const salaryLabel = isSharedSalary
    ? th.addEmployee.sharedMonthlySalary
    : th.compensationReview.proposedSalaryLabel;
  const initialSalaryLabel = isSharedSalary
    ? th.addEmployee.sharedMonthlySalary
    : th.compensationReview.proposedSalaryInitialLabel;
  const draftSalary = timeline.pendingSalaryReviews.filter((r) => r.status === 'draft');
  const draftPromotion = timeline.pendingPromotionReviews.filter((r) => r.status === 'draft');

  const showManageBlocks = mode === 'manage' || mode === 'full';
  const showSetupBlocks = needsInitialSalary || mode === 'setup-only' || mode === 'full';

  return (
    <div className="whq-compensation-section">
      {showSetupBlocks && needsInitialSalary && (
        <WorkHQCard className="whq-detail-card whq-payroll-setup-card">
          <p className="whq-payroll-setup-title">{th.compensationReview.initialSalaryTitle}</p>
          <p className="whq-muted">{th.compensationReview.initialSalaryDesc}</p>
        </WorkHQCard>
      )}

      {canPropose && needsInitialSalary ? (
        <WorkHQCard title={th.compensationReview.initialSalaryTitle} className="whq-detail-card whq-payroll-setup-card">
          {error && <p className="whq-error">{error}</p>}
          <p className="whq-muted">{th.compensationReview.initialSalaryQuickDesc}</p>
          {timeline.hireDate && (
            <p className="whq-muted">
              วันมีผล: <strong>{timeline.hireDate}</strong> (วันเริ่มงาน)
            </p>
          )}
          <div className="whq-initial-salary-form">
            <label className="whq-field">
              <span className="whq-field-label">{initialSalaryLabel}</span>
              <input
                className="whq-input whq-initial-salary-input"
                type="number"
                min={1}
                placeholder="เช่น 10000"
                value={proposedSalary}
                onChange={(e) => setProposedSalary(e.target.value)}
              />
            </label>
            <WorkHQButton
              type="button"
              variant="primary"
              disabled={busy || !proposedSalary.trim() || Number(proposedSalary) <= 0}
              onClick={() => void runCreate('salary', true)}
            >
              {busy ? 'กำลังบันทึก…' : th.compensationReview.saveInitialSalary}
            </WorkHQButton>
          </div>
        </WorkHQCard>
      ) : canPropose && showManageBlocks && !needsInitialSalary ? (
        <div className="whq-compensation-manage">
          {error && <p className="whq-error">{error}</p>}
          <div className="whq-btn-group whq-mb-md">
            <WorkHQButton type="button" variant="secondary" onClick={() => {
              setShowSalaryForm((v) => !v);
              setShowPromotionForm(false);
            }}>
              {showSalaryForm ? 'ซ่อนฟอร์มปรับเงินเดือน' : createSalaryLabel}
            </WorkHQButton>
            <WorkHQButton type="button" variant="secondary" onClick={() => {
              setShowPromotionForm((v) => !v);
              setShowSalaryForm(false);
            }}>
              {showPromotionForm ? 'ซ่อนฟอร์มเลื่อนตำแหน่ง' : th.compensationReview.createPromotion}
            </WorkHQButton>
          </div>

          {showSalaryForm && (
            <ReviewForm
              currentLabel={th.compensationReview.currentSalaryLabel}
              currentValue={formatMoney(timeline.currentSalary)}
              contextLabel={timeline.latestKpiScore ? th.kpi.latestScoreContext : undefined}
              contextValue={timeline.latestKpiScore
                ? `${timeline.latestKpiScore.cycleName}: ${timeline.latestKpiScore.totalScore != null ? timeline.latestKpiScore.totalScore.toFixed(1) : th.common.dash}${timeline.latestKpiScore.grade ? ` (${timeline.latestKpiScore.grade})` : ''}`
                : undefined}
              fields={(
                <label className="whq-field">
                  <span className="whq-field-label">{salaryLabel}</span>
                  <input
                    className="whq-input"
                    type="number"
                    min={0}
                    value={proposedSalary}
                    onChange={(e) => setProposedSalary(e.target.value)}
                  />
                </label>
              )}
              reason={reason}
              note={note}
              effectiveDate={effectiveDate}
              onReasonChange={setReason}
              onNoteChange={setNote}
              onEffectiveDateChange={setEffectiveDate}
              busy={busy}
              onSaveDraft={() => void runCreate('salary', false)}
              onCreateAndSubmit={() => void runCreate('salary', true)}
            />
          )}

          {showPromotionForm && (
            <ReviewForm
              currentLabel={th.compensationReview.currentPositionLabel}
              currentValue={timeline.currentPosition ?? th.common.dash}
              fields={(
                <label className="whq-field">
                  <span className="whq-field-label">{th.compensationReview.proposedPositionLabel}</span>
                  <input
                    className="whq-input"
                    value={proposedPosition}
                    onChange={(e) => setProposedPosition(e.target.value)}
                  />
                </label>
              )}
              reason={reason}
              note={note}
              effectiveDate={effectiveDate}
              onReasonChange={setReason}
              onNoteChange={setNote}
              onEffectiveDateChange={setEffectiveDate}
              busy={busy}
              onSaveDraft={() => void runCreate('promotion', false)}
              onCreateAndSubmit={() => void runCreate('promotion', true)}
            />
          )}

          {(draftSalary.length > 0 || draftPromotion.length > 0) && (
            <div className="whq-mt-md">
              <h4>{th.compensationReview.draftTitle}</h4>
              <ul className="whq-list-plain">
                {draftSalary.map((row) => (
                  <li key={row.id}>
                    {th.compensationReview.salaryLabel}: {formatMoney(row.currentSalary)} → {formatMoney(row.proposedSalary)}
                    <WorkHQButton
                      type="button"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void submitDraft(row.id, 'salary')}
                    >
                      {th.compensationReview.submitForApproval}
                    </WorkHQButton>
                  </li>
                ))}
                {draftPromotion.map((row) => (
                  <li key={row.id}>
                    {th.compensationReview.promotionLabel}: {row.currentPosition ?? '—'} → {row.proposedPosition}
                    <WorkHQButton
                      type="button"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void submitDraft(row.id, 'promotion')}
                    >
                      {th.compensationReview.submitForApproval}
                    </WorkHQButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : needsInitialSalary ? (
        <WorkHQCard title={th.compensationReview.initialSalaryTitle} className="whq-detail-card">
          <p className="whq-muted">{th.compensationReview.noPermissionDesc}</p>
        </WorkHQCard>
      ) : null}

      {showManageBlocks && (
        <>
          <EmployeeSharedPayrollSection employeeId={employeeId} compact />
          <EmployeeDepositSection employeeId={employeeId} compact />

          {(timeline.pendingSalaryReviews.length > 0 || timeline.pendingPromotionReviews.length > 0) && (
            <WorkHQCard title={th.compensationReview.pendingTitle} className="whq-detail-card">
              {timeline.pendingSalaryReviews.some((r) => r.status === 'pending_approval') && (
                <p className="whq-muted" style={{ marginBottom: '0.75rem' }}>
                  {th.compensationReview.pendingSalaryHint}{' '}
                  <Link to="/approvals" className="whq-link">อนุมัติ</Link>
                  {' · '}
                  <Link to="/hr/compensation-reviews" className="whq-link">ปรับเงินเดือน</Link>
                </p>
              )}
              <ul className="whq-list-plain">
                {timeline.pendingSalaryReviews.filter((r) => r.status !== 'draft').map((row) => (
                  <li key={row.id}>
                    {th.compensationReview.salaryLabel}: {formatMoney(row.currentSalary)} → {formatMoney(row.proposedSalary)} ({row.status})
                  </li>
                ))}
                {timeline.pendingPromotionReviews.filter((r) => r.status !== 'draft').map((row) => (
                  <li key={row.id}>
                    {th.compensationReview.promotionLabel}: {row.currentPosition ?? '—'} → {row.proposedPosition} ({row.status})
                  </li>
                ))}
              </ul>
            </WorkHQCard>
          )}

          <div className="whq-compensation-history-grid">
            <WorkHQCard title="ประวัติฐานเงินเดือน" className="whq-detail-card">
              {timeline.salaryHistory.length === 0 ? (
                <p className="whq-muted">{th.compensationReview.emptyHistory}</p>
              ) : (
                <div className="whq-table-wrap">
                  <table className="whq-table">
                    <thead>
                      <tr>
                        <th>มีผลตั้งแต่</th>
                        <th>ฐานเงินเดือน</th>
                        <th>เหตุผล</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.salaryHistory.map((row) => (
                        <tr key={row.id}>
                          <td>{row.effectiveFrom}{row.effectiveTo ? ` → ${row.effectiveTo}` : ''}</td>
                          <td>{formatMoney(row.monthlySalary)}</td>
                          <td>{row.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WorkHQCard>

            {timeline.promotionReviews.length > 0 && (
              <WorkHQCard title={th.compensationReview.promotionHistoryTitle} className="whq-detail-card">
                <div className="whq-table-wrap">
                  <table className="whq-table">
                    <thead>
                      <tr>
                        <th>ตำแหน่ง</th>
                        <th>วันมีผล</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.promotionReviews.map((row) => (
                        <tr key={row.id}>
                          <td>{row.currentPosition ?? '—'} → {row.proposedPosition}</td>
                          <td>{row.effectiveDate}</td>
                          <td>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WorkHQCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewForm({
  currentLabel,
  currentValue,
  contextLabel,
  contextValue,
  fields,
  reason,
  note,
  effectiveDate,
  onReasonChange,
  onNoteChange,
  onEffectiveDateChange,
  busy,
  onSaveDraft,
  onCreateAndSubmit,
}: {
  currentLabel: string;
  currentValue: string;
  contextLabel?: string;
  contextValue?: string;
  fields: React.ReactNode;
  reason: string;
  note: string;
  effectiveDate: string;
  onReasonChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onEffectiveDateChange: (v: string) => void;
  busy: boolean;
  onSaveDraft: () => void;
  onCreateAndSubmit: () => void;
}) {
  return (
    <div className="whq-form-stack">
      <label className="whq-field">
        <span className="whq-field-label">{currentLabel}</span>
        <input className="whq-input" value={currentValue} readOnly disabled />
      </label>
      {contextLabel && contextValue && (
        <label className="whq-field">
          <span className="whq-field-label">{contextLabel}</span>
          <input className="whq-input" value={contextValue} readOnly disabled />
        </label>
      )}
      {fields}
      <label className="whq-field">
        <span className="whq-field-label">{th.compensationReview.colReason} (ไม่บังคับ)</span>
        <input className="whq-input" value={reason} onChange={(e) => onReasonChange(e.target.value)} />
      </label>
      <label className="whq-field">
        <span className="whq-field-label">{th.compensationReview.noteLabel}</span>
        <textarea className="whq-input" rows={2} value={note} onChange={(e) => onNoteChange(e.target.value)} />
      </label>
      <label className="whq-field">
        <span className="whq-field-label">{th.payrollCycle.payDate}</span>
        <WorkHQDateInput value={effectiveDate} onChange={onEffectiveDateChange} />
        {!effectiveDate && (
          <span className="whq-muted whq-text-sm">ว่างไว้ = มีผลวันนี้</span>
        )}
      </label>
      <div className="whq-btn-group">
        <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={onSaveDraft}>
          {th.compensationReview.saveDraft}
        </WorkHQButton>
        <WorkHQButton type="button" variant="primary" disabled={busy} onClick={onCreateAndSubmit}>
          {th.compensationReview.createAndSubmit}
        </WorkHQButton>
      </div>
    </div>
  );
}
