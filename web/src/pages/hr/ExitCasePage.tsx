import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../../api/client';
import {
  approveFinalSettlement,
  cancelFinalSettlement,
  createFinalSettlementDraft,
  fetchFinalSettlement,
  markFinalSettlementPaid,
  recalculateFinalSettlement,
  submitFinalSettlement,
  updateFinalSettlement,
  type FinalSettlementRecord,
} from '../../api/final-settlement';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../../components/LoadingState';
import { FlashMessage } from '../../components/FlashMessage';
import { WorkHQErrorState } from '../../components/workhq/states/WorkHQErrorState';
import { WorkHQButton, WorkHQCard, WorkHQPage } from '../../components/ui';
import { th } from '../../i18n/th-labels';

interface ExitCaseDetail {
  id: string;
  employeeId: string;
  exitReason: string;
  exitType?: string;
  lifecycleStatus?: string;
  status: string;
  cancellationReason?: string | null;
  checklistItems?: Array<{
    id: string;
    label: string;
    completed: boolean;
  }>;
}

interface ExitAsset {
  assignmentId: string;
  assetId: string;
  assetTag: string | null;
  assetName: string | null;
  status: string;
}

interface LossClaim {
  id: string;
  amount: number;
  category: string;
  description: string;
  status: string;
  evidenceUrl: string | null;
  approvedByOwner: string | null;
  approvedAt: string | null;
}

interface SettlementPreview {
  depositBalance: number;
  refundAmount: number;
  forfeitAmount: number;
  outcome: string;
  legalReviewRequired: boolean;
  approvedClaimsTotal: number;
  collectorBreakdown: Array<{
    companyName: string | null;
    companyCode: string | null;
    collectedAmount: number;
    refundAmount: number;
  }>;
  claims: LossClaim[];
  claimShortfallWarning: number | null;
  ownerCaseByCase: boolean;
  unresolvedAssetCount: number;
  assetsBlockingSettlement: boolean;
}

const CLAIM_CATEGORIES = [
  'property_damage',
  'lost_equipment',
  'cash_shortage',
  'other_company_loss',
] as const;

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exitReasonLabel(reason: string): string {
  return th.exitCase.reasons[reason as keyof typeof th.exitCase.reasons] ?? reason;
}

function statusLabel(status: string): string {
  return th.exitCase.statuses[status as keyof typeof th.exitCase.statuses] ?? status;
}

function assetStatusLabel(status: string): string {
  return th.exitCase.assetStatuses[status as keyof typeof th.exitCase.assetStatuses] ?? status;
}

function depositStatusLabel(status: string): string {
  return th.exitCase.depositSettlementStatuses[status as keyof typeof th.exitCase.depositSettlementStatuses] ?? status;
}

function finalSettlementStatusLabel(status: string): string {
  return th.exitCase.finalSettlementStatuses[status as keyof typeof th.exitCase.finalSettlementStatuses] ?? status;
}

function claimCategoryLabel(category: string): string {
  return th.exitCase.claimCategories[category as keyof typeof th.exitCase.claimCategories] ?? category;
}

function settlementLineRows(settlement: FinalSettlementRecord) {
  return [
    { key: 'salaryProrate', value: settlement.salaryProrateAmount, credit: true },
    { key: 'unpaidSalary', value: settlement.unpaidSalaryAmount, credit: true },
    { key: 'pendingOt', value: settlement.pendingOtAmount, credit: true },
    { key: 'pendingCommission', value: settlement.pendingCommissionAmount, credit: true },
    { key: 'pendingBonus', value: settlement.pendingBonusAmount, credit: true },
    { key: 'advanceDeduction', value: settlement.advanceDeductionAmount, credit: false },
    { key: 'equipmentDeduction', value: settlement.equipmentDeductionAmount, credit: false },
    { key: 'penaltyDeduction', value: settlement.penaltyDeductionAmount, credit: false },
    { key: 'depositReturn', value: settlement.depositReturnAmount, credit: true },
    { key: 'otherAdjustment', value: settlement.otherAdjustmentAmount, credit: true },
  ] as const;
}

export default function ExitCasePage() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const [exitCase, setExitCase] = useState<ExitCaseDetail | null>(null);
  const [assets, setAssets] = useState<ExitAsset[]>([]);
  const [claims, setClaims] = useState<LossClaim[]>([]);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [finalSettlement, setFinalSettlement] = useState<FinalSettlementRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = can('employee:write');
  const businessRole = user?.businessRole ?? null;
  const canManageSettlement = canWrite && (businessRole === 'owner' || businessRole === 'secretary');
  const canApproveSettlement = canWrite && businessRole === 'owner';

  const [claimCategory, setClaimCategory] = useState<string>('property_damage');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDescription, setClaimDescription] = useState('');
  const [claimEvidence, setClaimEvidence] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [bonusAdjust, setBonusAdjust] = useState('');
  const [otherAdjust, setOtherAdjust] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const detail = await apiGet<ExitCaseDetail>(`/exit-cases/${id}`);
      setExitCase(detail);

      const showSettlement = ['pending_settlement', 'settled', 'closed'].includes(detail.status);
      const showAssetsClaims = !['pending_leader_review', 'draft'].includes(detail.status);

      if (showAssetsClaims) {
        const [assetRows, claimRows] = await Promise.all([
          apiGet<ExitAsset[]>(`/exit-cases/${id}/assets`),
          apiGet<LossClaim[]>(`/exit-cases/${id}/loss-claims`),
        ]);
        setAssets(assetRows);
        setClaims(claimRows);
      } else {
        setAssets([]);
        setClaims([]);
      }

      if (showSettlement) {
        const prev = await apiPost<SettlementPreview>(`/exit-cases/${id}/settlement/preview`, {});
        setPreview(prev);
      } else {
        setPreview(null);
      }

      if (!['draft', 'cancelled'].includes(detail.status)) {
        try {
          const settlement = await fetchFinalSettlement(id);
          setFinalSettlement(settlement);
          setBonusAdjust(String(settlement.pendingBonusAmount));
          setOtherAdjust(String(settlement.otherAdjustmentAmount));
          setSettlementNotes(settlement.notes ?? '');
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            setFinalSettlement(null);
          } else {
            throw err;
          }
        }
      } else {
        setFinalSettlement(null);
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      setFlash(message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function updateAssetStatus(assignmentId: string, status: string) {
    await runAction(
      () => apiPatch(`/exit-cases/${id}/assets/${assignmentId}`, { status }),
      th.common.save,
    );
  }

  async function addClaim() {
    if (!claimAmount || !claimDescription) return;
    await runAction(
      () => apiPost(`/exit-cases/${id}/loss-claims`, {
        category: claimCategory,
        amount: Number(claimAmount),
        description: claimDescription,
        evidenceUrl: claimEvidence || undefined,
      }),
      th.exitCase.claimForm.add,
    );
    setClaimAmount('');
    setClaimDescription('');
    setClaimEvidence('');
  }

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <WorkHQErrorState
        referenceCode={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => void load()}
      />
    );
  }
  if (!exitCase) return null;

  const canSettle = canWrite
    && exitCase.status === 'pending_settlement'
    && !(preview?.assetsBlockingSettlement);

  return (
    <WorkHQPage>
      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}
      <Link to={`/hr/employees/${exitCase.employeeId}`} className="whq-back-link">
        {th.exitCase.back}
      </Link>
      <h1 className="whq-page-title">{th.exitCase.title}</h1>
      <p className="whq-muted">
        {statusLabel(exitCase.status)}
        {exitCase.lifecycleStatus ? ` · ${th.exitCase.lifecycleStatuses[exitCase.lifecycleStatus as keyof typeof th.exitCase.lifecycleStatuses] ?? exitCase.lifecycleStatus}` : ''}
        {' · '}
        {exitReasonLabel(exitCase.exitReason)}
      </p>

      {exitCase.checklistItems && exitCase.checklistItems.length > 0 && (
        <WorkHQCard title={th.exitCase.checklistTitle} className="whq-detail-card whq-detail-card--full">
          <ul className="whq-checklist">
            {exitCase.checklistItems.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={busy || !canWrite || ['closed', 'cancelled'].includes(exitCase.status)}
                    onChange={(e) => void runAction(
                      () => apiPatch(`/exit-cases/${id}/checklist-items/${item.id}`, { completed: e.target.checked }),
                      th.exitCase.checklistUpdated,
                    )}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </WorkHQCard>
      )}

      <div className="whq-detail-grid">
        <WorkHQCard title={th.exitCase.stepsTitle} className="whq-detail-card">
          <ol className="whq-exit-steps">
            <li>{th.exitCase.leaderReview}</li>
            <li>{th.exitCase.ownerReview}</li>
            <li>{th.exitCase.depositReview}</li>
            <li>{th.exitCase.settlementSummary}</li>
          </ol>
          {canWrite && exitCase.status === 'pending_leader_review' && (
            <WorkHQButton type="button" variant="primary" disabled={busy}
              onClick={() => runAction(
                () => apiPost(`/exit-cases/${id}/leader-review`, { notes: 'อนุมัติ' }),
                th.exitCase.leaderApproved,
              )}>
              {th.exitCase.approveLeader}
            </WorkHQButton>
          )}
          {canWrite && exitCase.status === 'pending_owner_review' && (
            <WorkHQButton type="button" variant="primary" disabled={busy}
              onClick={() => runAction(
                () => apiPost(`/exit-cases/${id}/owner-review`, { notes: 'อนุมัติ' }),
                th.exitCase.ownerApproved,
              )}>
              {th.exitCase.approveOwner}
            </WorkHQButton>
          )}
          {canWrite && exitCase.status === 'pending_settlement' && (
            <div className="whq-btn-group">
              <WorkHQButton type="button" variant="primary" disabled={busy || !canSettle}
                onClick={() => runAction(
                  () => apiPost(`/exit-cases/${id}/settle`, {}),
                  th.exitCase.settled,
                )}>
                {th.exitCase.settle}
              </WorkHQButton>
            </div>
          )}
          {preview?.assetsBlockingSettlement && (
            <p className="whq-alert whq-alert--warning">{th.exitCase.assetsBlocking}</p>
          )}
          {canWrite && exitCase.status === 'settled' && (
            <WorkHQButton type="button" variant="primary" disabled={busy}
              onClick={() => runAction(
                () => apiPost(`/exit-cases/${id}/close`, {}),
                th.exitCase.closed,
              )}>
              {th.exitCase.closeCase}
            </WorkHQButton>
          )}
          {canWrite && !['closed', 'cancelled'].includes(exitCase.status) && (
            <div className="whq-detail-card-actions" style={{ marginTop: '1rem' }}>
              {!showCancelForm ? (
                <WorkHQButton type="button" variant="danger" disabled={busy}
                  onClick={() => setShowCancelForm(true)}>
                  {th.exitCase.cancelCase}
                </WorkHQButton>
              ) : (
                <div className="whq-form-stack">
                  <label className="whq-muted" htmlFor="cancel-reason">{th.exitCase.cancelReason}</label>
                  <textarea
                    id="cancel-reason"
                    className="whq-input"
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  <div className="whq-btn-group">
                    <WorkHQButton type="button" variant="danger" disabled={busy || !cancelReason.trim()}
                      onClick={() => {
                        void runAction(
                          () => apiPost(`/exit-cases/${id}/cancel`, { cancellationReason: cancelReason.trim() }),
                          th.exitCase.cancelledNotice,
                        ).then(() => {
                          setShowCancelForm(false);
                          setCancelReason('');
                        });
                      }}>
                      {th.exitCase.confirmCancel}
                    </WorkHQButton>
                    <WorkHQButton type="button" variant="secondary" disabled={busy}
                      onClick={() => { setShowCancelForm(false); setCancelReason(''); }}>
                      {th.common.cancel}
                    </WorkHQButton>
                  </div>
                </div>
              )}
            </div>
          )}
          {exitCase.status === 'cancelled' && exitCase.cancellationReason && (
            <p className="whq-muted">{th.exitCase.cancelReason}: {exitCase.cancellationReason}</p>
          )}
        </WorkHQCard>

        {preview && (
          <WorkHQCard title={th.exitCase.settlementSummary} className="whq-detail-card">
            <div className="whq-detail-card-body">
              <div className="whq-info-row">
                <span className="whq-info-label">{th.employeeDeposit.balanceTitle}</span>
                <span className="whq-info-value">฿{formatMoney(preview.depositBalance)}</span>
              </div>
              {preview.collectorBreakdown.map((c) => (
                <div key={c.companyCode ?? c.companyName} className="whq-info-row">
                  <span className="whq-info-label">{c.companyName ?? c.companyCode ?? th.employeeDeposit.company}</span>
                  <span className="whq-info-value">
                    ฿{formatMoney(c.collectedAmount)} → คืน ฿{formatMoney(c.refundAmount)}
                  </span>
                </div>
              ))}
              <div className="whq-info-row">
                <span className="whq-info-label">{th.employeeDeposit.refundable}</span>
                <span className="whq-info-value">฿{formatMoney(preview.refundAmount)}</span>
              </div>
              <div className="whq-info-row">
                <span className="whq-info-label">{th.exitCase.forfeited}</span>
                <span className="whq-info-value">฿{formatMoney(preview.forfeitAmount)}</span>
              </div>
              {preview.ownerCaseByCase && preview.claimShortfallWarning != null && (
                <div className="whq-info-row">
                  <span className="whq-info-label">{th.exitCase.ownerCaseByCase}</span>
                  <span className="whq-info-value whq-info-value--warning">
                    ฿{formatMoney(preview.claimShortfallWarning)}
                  </span>
                </div>
              )}
              {preview.legalReviewRequired && (
                <p className="whq-alert whq-alert--warning">{th.exitCase.legalReviewRequired}</p>
              )}
            </div>
          </WorkHQCard>
        )}
      </div>

      {!['draft', 'cancelled'].includes(exitCase.status) && (
        <WorkHQCard title={th.exitCase.finalSettlementTitle} className="whq-detail-card whq-detail-card--full">
          {!finalSettlement ? (
            <div className="whq-detail-card-body">
              <p className="whq-muted">ยังไม่มีร่างค่าจ้างสุดท้าย</p>
              {canManageSettlement && (
                <WorkHQButton type="button" variant="primary" disabled={busy}
                  onClick={() => void runAction(
                    () => createFinalSettlementDraft(id!),
                    th.exitCase.finalSettlementCreate,
                  )}>
                  {th.exitCase.finalSettlementCreate}
                </WorkHQButton>
              )}
            </div>
          ) : (
            <div className="whq-detail-card-body">
              <p className="whq-muted">{finalSettlementStatusLabel(finalSettlement.status)}</p>
              {settlementLineRows(finalSettlement).map((line) => (
                line.value !== 0 || line.key === 'pendingBonus' || line.key === 'otherAdjustment' ? (
                  <div key={line.key} className="whq-info-row">
                    <span className="whq-info-label">
                      {th.exitCase.finalSettlementLines[line.key]}
                    </span>
                    <span className={`whq-info-value${line.credit ? '' : ' whq-info-value--warning'}`}>
                      {line.credit ? '+' : '-'}฿{formatMoney(Math.abs(line.value))}
                    </span>
                  </div>
                ) : null
              ))}
              <div className="whq-info-row whq-info-row--emphasis">
                <span className="whq-info-label">{th.exitCase.finalSettlementNet}</span>
                <span className="whq-info-value">฿{formatMoney(finalSettlement.netPayableAmount)}</span>
              </div>

              <div className="whq-info-row" style={{ marginTop: '0.75rem' }}>
                <span className="whq-info-label">{th.exitCase.depositPreviewAmount}</span>
                <span className="whq-info-value">฿{formatMoney(finalSettlement.depositPreviewAmount)}</span>
              </div>
              {finalSettlement.depositSettledAmount != null && (
                <div className="whq-info-row">
                  <span className="whq-info-label">{th.exitCase.depositSettledAmount}</span>
                  <span className="whq-info-value">฿{formatMoney(finalSettlement.depositSettledAmount)}</span>
                </div>
              )}
              <p className="whq-muted">{depositStatusLabel(finalSettlement.depositSettlementStatus)}</p>

              {finalSettlement.status === 'draft' && canManageSettlement && (
                <div className="whq-form-stack" style={{ marginTop: '1rem' }}>
                  <label>
                    {th.exitCase.finalSettlementLines.pendingBonus}
                    <input type="number" step="0.01" className="whq-input"
                      value={bonusAdjust}
                      onChange={(e) => setBonusAdjust(e.target.value)} />
                  </label>
                  <label>
                    {th.exitCase.finalSettlementLines.otherAdjustment}
                    <input type="number" step="0.01" className="whq-input"
                      value={otherAdjust}
                      onChange={(e) => setOtherAdjust(e.target.value)} />
                  </label>
                  <label>
                    {th.exitCase.finalSettlementNotes}
                    <textarea className="whq-input" rows={2}
                      value={settlementNotes}
                      onChange={(e) => setSettlementNotes(e.target.value)} />
                  </label>
                  <div className="whq-btn-group">
                    <WorkHQButton type="button" variant="secondary" disabled={busy}
                      onClick={() => void runAction(
                        () => recalculateFinalSettlement(finalSettlement.id),
                        th.exitCase.finalSettlementRecalculated,
                      )}>
                      {th.exitCase.finalSettlementRecalculate}
                    </WorkHQButton>
                    <WorkHQButton type="button" variant="secondary" disabled={busy}
                      onClick={() => void runAction(
                        () => updateFinalSettlement(finalSettlement.id, {
                          pendingBonusAmount: Number(bonusAdjust),
                          otherAdjustmentAmount: Number(otherAdjust),
                          notes: settlementNotes || undefined,
                        }),
                        th.exitCase.finalSettlementSaved,
                      )}>
                      {th.common.save}
                    </WorkHQButton>
                    <WorkHQButton type="button" variant="primary" disabled={busy}
                      onClick={() => void runAction(
                        () => submitFinalSettlement(finalSettlement.id),
                        th.exitCase.finalSettlementSubmitted,
                      )}>
                      {th.exitCase.finalSettlementSubmit}
                    </WorkHQButton>
                    <WorkHQButton type="button" variant="danger" disabled={busy}
                      onClick={() => void runAction(
                        () => cancelFinalSettlement(finalSettlement.id),
                        th.exitCase.finalSettlementCancelled,
                      )}>
                      {th.exitCase.finalSettlementCancel}
                    </WorkHQButton>
                  </div>
                </div>
              )}

              {finalSettlement.status === 'pending_review' && canApproveSettlement && (
                <div className="whq-btn-group" style={{ marginTop: '1rem' }}>
                  <WorkHQButton type="button" variant="primary" disabled={busy}
                    onClick={() => void runAction(
                      () => approveFinalSettlement(finalSettlement.id),
                      th.exitCase.finalSettlementApproved,
                    )}>
                    {th.exitCase.finalSettlementApprove}
                  </WorkHQButton>
                </div>
              )}

              {finalSettlement.status === 'approved' && canManageSettlement && (
                <div className="whq-btn-group" style={{ marginTop: '1rem' }}>
                  <WorkHQButton type="button" variant="primary" disabled={busy}
                    onClick={() => void runAction(
                      () => markFinalSettlementPaid(finalSettlement.id),
                      th.exitCase.finalSettlementPaid,
                    )}>
                    {th.exitCase.finalSettlementMarkPaid}
                  </WorkHQButton>
                </div>
              )}

              {finalSettlement.notes && finalSettlement.status !== 'draft' && (
                <p className="whq-muted" style={{ marginTop: '1rem' }}>
                  {th.exitCase.finalSettlementNotes}: {finalSettlement.notes}
                </p>
              )}
              {finalSettlement.paidAt && (
                <p className="whq-muted">จ่ายเมื่อ {new Date(finalSettlement.paidAt).toLocaleString('th-TH')}</p>
              )}
            </div>
          )}
        </WorkHQCard>
      )}

      {assets.length > 0 && (
        <WorkHQCard title={th.exitCase.assetsTitle} className="whq-detail-card whq-detail-card--full">
          <table className="whq-table">
            <thead>
              <tr>
                <th>ทรัพย์สิน</th>
                <th>สถานะ</th>
                {canWrite && <th>ดำเนินการ</th>}
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.assignmentId}>
                  <td>{asset.assetName ?? asset.assetTag ?? asset.assetId.slice(0, 8)}</td>
                  <td>{assetStatusLabel(asset.status)}</td>
                  {canWrite && (
                    <td>
                      <div className="whq-btn-group whq-btn-group--compact">
                        {(['returned', 'damaged', 'lost', 'waived'] as const).map((s) => (
                          <WorkHQButton
                            key={s}
                            type="button"
                            variant={asset.status === s ? 'primary' : 'secondary'}
                            disabled={busy || exitCase.status === 'settled' || exitCase.status === 'closed'}
                            onClick={() => updateAssetStatus(asset.assignmentId, s)}
                          >
                            {assetStatusLabel(s)}
                          </WorkHQButton>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </WorkHQCard>
      )}

      {!['pending_leader_review', 'draft'].includes(exitCase.status) && (
        <WorkHQCard title={th.exitCase.claimsTitle} className="whq-detail-card whq-detail-card--full">
          {claims.length > 0 && (
            <table className="whq-table">
              <thead>
                <tr>
                  <th>{th.exitCase.claimForm.category}</th>
                  <th>{th.exitCase.claimForm.amount}</th>
                  <th>{th.exitCase.claimForm.description}</th>
                  <th>สถานะ</th>
                  {canWrite && <th>ดำเนินการ</th>}
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>{claimCategoryLabel(claim.category)}</td>
                    <td className="whq-table-num">฿{formatMoney(claim.amount)}</td>
                    <td>{claim.description}</td>
                    <td>
                      {claim.status === 'approved'
                        ? th.exitCase.claimForm.approved
                        : th.exitCase.claimForm.pending}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="whq-btn-group whq-btn-group--compact">
                          {claim.status === 'pending' && (
                            <>
                              <WorkHQButton type="button" variant="primary" disabled={busy}
                                onClick={() => runAction(
                                  () => apiPost(`/exit-cases/${id}/loss-claims/${claim.id}/approve`, {}),
                                  th.exitCase.claimForm.approved,
                                )}>
                                {th.exitCase.claimForm.approve}
                              </WorkHQButton>
                              <WorkHQButton type="button" variant="danger" disabled={busy}
                                onClick={() => runAction(
                                  () => apiDelete(`/exit-cases/${id}/loss-claims/${claim.id}`),
                                  th.exitCase.claimForm.delete,
                                )}>
                                {th.exitCase.claimForm.delete}
                              </WorkHQButton>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {canWrite && !['settled', 'closed'].includes(exitCase.status) && (
            <div className="whq-form whq-form--inline whq-detail-card-body">
              <label>
                {th.exitCase.claimForm.category}
                <select value={claimCategory} onChange={(e) => setClaimCategory(e.target.value)}>
                  {CLAIM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{claimCategoryLabel(c)}</option>
                  ))}
                </select>
              </label>
              <label>
                {th.exitCase.claimForm.amount}
                <input type="number" min="0" step="0.01" value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)} />
              </label>
              <label>
                {th.exitCase.claimForm.description}
                <input type="text" value={claimDescription}
                  onChange={(e) => setClaimDescription(e.target.value)} />
              </label>
              <label>
                {th.exitCase.claimForm.evidence}
                <input type="text" value={claimEvidence}
                  onChange={(e) => setClaimEvidence(e.target.value)} />
              </label>
              <WorkHQButton type="button" variant="primary" disabled={busy}
                onClick={() => void addClaim()}>
                {th.exitCase.claimForm.add}
              </WorkHQButton>
            </div>
          )}
        </WorkHQCard>
      )}
    </WorkHQPage>
  );
}
