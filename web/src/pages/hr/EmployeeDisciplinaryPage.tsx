import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { FlashMessage } from '../../components/FlashMessage';
import {
  WorkHQButton,
  WorkHQCard,
  WorkHQInput,
  WorkHQPage,
  WorkHQSelect,
} from '../../components/ui';
import {
  disciplinaryActionTypeLabel,
  th,
} from '../../i18n/th-labels';

type DisciplinaryActionType = 'verbal_warning' | 'warning_1' | 'warning_2' | 'termination';

interface DisciplinaryAction {
  id: string;
  employeeId: string;
  companyId: string;
  actionType: DisciplinaryActionType;
  reason: string;
  details: string | null;
  evidenceUrl: string | null;
  terminationReason: string | null;
  terminationNote: string | null;
  issuedBy: string;
  issuerName: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  acknowledged: boolean;
}

interface DisciplinaryListResponse {
  summary: {
    employeeId: string;
    verbalWarningCount: number;
    warning1Count: number;
    warning2Count: number;
    terminationCount: number;
    latestActionType: DisciplinaryActionType | null;
    latestActionAt: string | null;
    unacknowledgedCount: number;
    warningsNeverExpire: true;
  };
  items: DisciplinaryAction[];
}

const ACTION_TYPES: DisciplinaryActionType[] = [
  'verbal_warning',
  'warning_1',
  'warning_2',
  'termination',
];

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EmployeeDisciplinaryPage() {
  const { id } = useParams<{ id: string }>();
  const { can, companyId, user } = useAuth();
  const [data, setData] = useState<DisciplinaryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = can('employee:write');

  const [actionType, setActionType] = useState<DisciplinaryActionType>('verbal_warning');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationNote, setTerminationNote] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const response = await apiGet<DisciplinaryListResponse>(`/employees/${id}/disciplinary`);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  async function createAction() {
    if (!id || !companyId || !reason.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/employees/${id}/disciplinary`, {
        companyId,
        actionType,
        reason: reason.trim(),
        details: details.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
        terminationReason: actionType === 'termination' ? terminationReason.trim() : undefined,
        terminationNote: actionType === 'termination' ? terminationNote.trim() || undefined : undefined,
      });
      setReason('');
      setDetails('');
      setEvidenceUrl('');
      setTerminationReason('');
      setTerminationNote('');
      setFlash(th.employeeDisciplinary.created);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge(actionId: string) {
    setBusy(true);
    try {
      await apiPost(`/disciplinary-actions/${actionId}/acknowledge`, {});
      setFlash(th.employeeDisciplinary.acknowledged);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return null;

  const isSelf = user?.employeeId === id;

  return (
    <WorkHQPage>
      <Link to={`/hr/employees/${id}`} className="whq-back-link">{th.employeeDisciplinary.back}</Link>
      <h1 className="whq-page-title">{th.employeeDisciplinary.title}</h1>

      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}

      <WorkHQCard title={th.employeeDisciplinary.summaryTitle} className="whq-detail-card">
        <div className="whq-detail-card-body">
          <div className="whq-info-row">
            <span className="whq-info-label">{th.employeeDisciplinary.verbalWarning}</span>
            <span className="whq-info-value">{data.summary.verbalWarningCount}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.employeeDisciplinary.warning1}</span>
            <span className="whq-info-value">{data.summary.warning1Count}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.employeeDisciplinary.warning2}</span>
            <span className="whq-info-value">{data.summary.warning2Count}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.employeeDisciplinary.termination}</span>
            <span className="whq-info-value">{data.summary.terminationCount}</span>
          </div>
          <p className="whq-muted">{th.employeeDisciplinary.neverExpireNote}</p>
        </div>
      </WorkHQCard>

      {canWrite && (
        <WorkHQCard title={th.employeeDisciplinary.createTitle} className="whq-detail-card whq-detail-card--full">
          <div className="whq-form-stack">
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDisciplinary.actionType}</span>
              <WorkHQSelect
                value={actionType}
                onChange={(e) => setActionType(e.target.value as DisciplinaryActionType)}
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>{disciplinaryActionTypeLabel(type)}</option>
                ))}
              </WorkHQSelect>
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDisciplinary.reason}</span>
              <WorkHQInput value={reason} onChange={(e) => setReason(e.target.value)} required />
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDisciplinary.details}</span>
              <textarea
                className="whq-input"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
              />
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.employeeDisciplinary.evidence}</span>
              <WorkHQInput value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
            </label>
            {actionType === 'termination' && (
              <>
                <label className="whq-field">
                  <span className="whq-field-label">{th.employeeDisciplinary.terminationReason}</span>
                  <WorkHQInput
                    value={terminationReason}
                    onChange={(e) => setTerminationReason(e.target.value)}
                    required
                  />
                </label>
                <label className="whq-field">
                  <span className="whq-field-label">{th.employeeDisciplinary.terminationNote}</span>
                  <textarea
                    className="whq-input"
                    value={terminationNote}
                    onChange={(e) => setTerminationNote(e.target.value)}
                    rows={2}
                  />
                </label>
              </>
            )}
            <WorkHQButton
              type="button"
              variant="primary"
              disabled={busy || !reason.trim() || (actionType === 'termination' && !terminationReason.trim())}
              onClick={() => void createAction()}
            >
              {th.employeeDisciplinary.submit}
            </WorkHQButton>
          </div>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.employeeDisciplinary.timelineTitle} className="whq-detail-card whq-detail-card--full">
        {data.items.length === 0 ? (
          <p className="whq-muted">{th.common.noData}</p>
        ) : (
          <div className="whq-stack whq-stack--gap-md">
            {data.items.map((item) => (
              <div key={item.id} className="whq-detail-card-body whq-detail-card-body--bordered">
                <h3 className="whq-section-title">
                  {disciplinaryActionTypeLabel(item.actionType)}
                </h3>
                  <div className="whq-info-row">
                    <span className="whq-info-label">{th.employeeDisciplinary.date}</span>
                    <span className="whq-info-value">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <div className="whq-info-row">
                    <span className="whq-info-label">{th.employeeDisciplinary.issuer}</span>
                    <span className="whq-info-value">{item.issuerName ?? item.issuedBy.slice(0, 8)}</span>
                  </div>
                  <div className="whq-info-row">
                    <span className="whq-info-label">{th.employeeDisciplinary.reason}</span>
                    <span className="whq-info-value">{item.reason}</span>
                  </div>
                  {item.details && (
                    <div className="whq-info-row">
                      <span className="whq-info-label">{th.employeeDisciplinary.details}</span>
                      <span className="whq-info-value">{item.details}</span>
                    </div>
                  )}
                  {item.evidenceUrl && (
                    <div className="whq-info-row">
                      <span className="whq-info-label">{th.employeeDisciplinary.evidence}</span>
                      <span className="whq-info-value">
                        <a href={item.evidenceUrl} target="_blank" rel="noreferrer">{item.evidenceUrl}</a>
                      </span>
                    </div>
                  )}
                  {item.actionType === 'termination' && item.terminationReason && (
                    <div className="whq-info-row">
                      <span className="whq-info-label">{th.employeeDisciplinary.terminationReason}</span>
                      <span className="whq-info-value">{item.terminationReason}</span>
                    </div>
                  )}
                  <div className="whq-info-row">
                    <span className="whq-info-label">{th.employeeDisciplinary.ackStatus}</span>
                    <span className="whq-info-value">
                      {item.acknowledged
                        ? `${th.employeeDisciplinary.acknowledgedYes} (${formatDateTime(item.acknowledgedAt!)})`
                        : th.employeeDisciplinary.acknowledgedNo}
                    </span>
                  </div>
                  {isSelf && !item.acknowledged && (
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void acknowledge(item.id)}
                    >
                      {th.employeeDisciplinary.acknowledge}
                    </WorkHQButton>
                  )}
              </div>
            ))}
          </div>
        )}
      </WorkHQCard>
    </WorkHQPage>
  );
}
