import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchEmployeeList } from '../../../api/employees';
import {
  add360Feedback,
  assignReviewCycle,
  finalizePerformanceReview,
  fetchCycleReviews,
  fetchReviewCycles,
  submitPerformanceReview,
  updateReviewScores,
  type PerformanceReview,
  type PerformanceReviewCycle,
} from '../../../api/performance-review';
import { useAuth, useCompanyId } from '../../../context/AuthContext';
import { ErrorState } from '../../../components/ErrorState';
import { FlashMessage } from '../../../components/FlashMessage';
import { LoadingState } from '../../../components/LoadingState';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
} from '../../../components/ui';
import { th } from '../../../i18n/th-labels';

function formatScore(score: number | null | undefined): string {
  if (score == null) return th.common.dash;
  return score.toFixed(1);
}

function formatWeightPct(weight: number): string {
  return `${(weight * 100).toFixed(0)}%`;
}

export default function PerformanceReviewCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = useCompanyId();
  const { can } = useAuth();
  const canWrite = can('performance:write');

  const [cycle, setCycle] = useState<PerformanceReviewCycle | null>(null);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leaderScore, setLeaderScore] = useState('');
  const [selfScore, setSelfScore] = useState('');
  const [leaderComment, setLeaderComment] = useState('');
  const [selfComment, setSelfComment] = useState('');
  const [feedback360Score, setFeedback360Score] = useState('');
  const [feedback360Comment, setFeedback360Comment] = useState('');

  const load = useCallback(async () => {
    if (!id || !companyId) return;
    setLoading(true);
    try {
      const [cycleRows, reviewRows, employeeRows] = await Promise.all([
        fetchReviewCycles(companyId),
        fetchCycleReviews(id),
        fetchEmployeeList({ companyId, status: 'active' }),
      ]);
      setCycle(cycleRows.find((row) => row.id === id) ?? null);
      setReviews(reviewRows);
      setEmployees(employeeRows.items.map((e) => ({
        id: e.id,
        label: `${e.firstName} ${e.lastName}`.trim(),
      })));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, companyId]);

  useEffect(() => { void load(); }, [load]);

  function toggleEmployee(employeeId: string) {
    setSelectedEmployeeIds((ids) => (
      ids.includes(employeeId) ? ids.filter((x) => x !== employeeId) : [...ids, employeeId]
    ));
  }

  function expandReview(row: PerformanceReview) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setLeaderScore(row.leaderReviewScore != null ? String(row.leaderReviewScore) : '');
    setSelfScore(row.selfReviewScore != null ? String(row.selfReviewScore) : '');
    setLeaderComment(row.leaderComment ?? '');
    setSelfComment(row.selfComment ?? '');
    setFeedback360Score('');
    setFeedback360Comment('');
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!id || selectedEmployeeIds.length === 0) return;
    setAssignBusy(true);
    try {
      await assignReviewCycle(id, { employeeIds: selectedEmployeeIds });
      setSelectedEmployeeIds([]);
      setFlash(th.performanceReview.assignSuccess);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setAssignBusy(false);
    }
  }

  async function saveScores(reviewId: string) {
    setBusyId(reviewId);
    try {
      await updateReviewScores(reviewId, {
        leaderReviewScore: leaderScore ? Number(leaderScore) : undefined,
        selfReviewScore: selfScore ? Number(selfScore) : undefined,
        leaderComment: leaderComment.trim() || undefined,
        selfComment: selfComment.trim() || undefined,
      });
      setFlash(th.performanceReview.scoresSaved);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview(reviewId: string) {
    setBusyId(reviewId);
    try {
      await submitPerformanceReview(reviewId);
      setFlash(th.performanceReview.submitted);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function finalizeReview(reviewId: string) {
    setBusyId(reviewId);
    try {
      await finalizePerformanceReview(reviewId);
      setFlash(th.performanceReview.finalized);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function submit360(reviewId: string) {
    if (!feedback360Score) return;
    setBusyId(reviewId);
    try {
      await add360Feedback(reviewId, {
        score: Number(feedback360Score),
        comment: feedback360Comment.trim() || undefined,
      });
      setFeedback360Score('');
      setFeedback360Comment('');
      setFlash(th.performanceReview.feedback360Saved);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  if (!can('performance:read')) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.kpi.accessDeniedTitle}>
          <p>{th.kpi.accessDeniedDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (!companyId) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.employees.selectCompanyTitle}>
          <p>{th.employees.selectCompanyDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  if (!cycle) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.performanceReview.cycleNotFound}>
          <Link to="/hr/performance/reviews">{th.performanceReview.backToCycles}</Link>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={cycle.name}
        subtitle={`${cycle.periodStart} — ${cycle.periodEnd}`}
        actions={
          <Link to="/hr/performance/reviews" className="whq-link">{th.performanceReview.backToCycles}</Link>
        }
      />

      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}

      <WorkHQCard title={th.performanceReview.cycleSummaryTitle}>
        <div className="whq-info-grid">
          <div>
            <span className="whq-info-label">{th.payrollOverview.colStatus}</span>
            <WorkHQBadge status={cycle.status} />
          </div>
          <div>
            <span className="whq-info-label">{th.performanceReview.colWeightProfile}</span>
            <span>{cycle.weightProfileName ?? cycle.weightProfileId}</span>
          </div>
          <div>
            <span className="whq-info-label">{th.kpi.colAssignments}</span>
            <span>{reviews.length}</span>
          </div>
        </div>
      </WorkHQCard>

      {canWrite && (
        <WorkHQCard title={th.performanceReview.assignTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleAssign(e)}>
            <div className="whq-field">
              <span className="whq-field-label">{th.kpi.selectEmployees}</span>
              <div className="whq-checkbox-list">
                {employees.map((emp) => (
                  <label key={emp.id} className="whq-checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                    />
                    {emp.label}
                  </label>
                ))}
              </div>
            </div>
            <WorkHQButton type="submit" variant="primary" disabled={assignBusy || selectedEmployeeIds.length === 0}>
              {th.performanceReview.assignEmployees}
            </WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.performanceReview.reviewsTitle}>
        {reviews.length === 0 ? (
          <p className="whq-muted">{th.performanceReview.emptyReviews}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.performanceReview.colEmployee}</th>
                  <th>{th.performanceReview.colKpiScore}</th>
                  <th>{th.performanceReview.colLeaderScore}</th>
                  <th>{th.performanceReview.colSelfScore}</th>
                  <th>{th.performanceReview.col360Score}</th>
                  <th>{th.kpi.colScore}</th>
                  <th>{th.kpi.colGrade}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  {canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {reviews.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>{row.employeeName ?? row.employeeId}</td>
                      <td>{formatScore(row.kpiScore)}</td>
                      <td>{formatScore(row.leaderReviewScore)}</td>
                      <td>{formatScore(row.selfReviewScore)}</td>
                      <td>{formatScore(row.feedback360Score)}</td>
                      <td>{formatScore(row.finalScore)}</td>
                      <td>{row.grade ?? th.common.dash}</td>
                      <td><WorkHQBadge status={row.status} /></td>
                      {canWrite && (
                        <td>
                          <WorkHQButton type="button" variant="secondary" onClick={() => expandReview(row)}>
                            {expandedId === row.id ? th.kpi.hideScores : th.performanceReview.enterScores}
                          </WorkHQButton>
                        </td>
                      )}
                    </tr>
                    {expandedId === row.id && (
                      <tr>
                        <td colSpan={canWrite ? 9 : 8}>
                          <div className="whq-form-stack whq-score-panel">
                            <div className="whq-form-row">
                              <label className="whq-field">
                                <span className="whq-field-label">{th.performanceReview.colLeaderScore}</span>
                                <input className="whq-input" type="number" min={0} max={100} step={0.1} value={leaderScore} onChange={(e) => setLeaderScore(e.target.value)} />
                              </label>
                              <label className="whq-field">
                                <span className="whq-field-label">{th.performanceReview.colSelfScore}</span>
                                <input className="whq-input" type="number" min={0} max={100} step={0.1} value={selfScore} onChange={(e) => setSelfScore(e.target.value)} />
                              </label>
                            </div>
                            <label className="whq-field">
                              <span className="whq-field-label">{th.performanceReview.leaderComment}</span>
                              <textarea className="whq-input" rows={2} value={leaderComment} onChange={(e) => setLeaderComment(e.target.value)} />
                            </label>
                            <label className="whq-field">
                              <span className="whq-field-label">{th.performanceReview.selfComment}</span>
                              <textarea className="whq-input" rows={2} value={selfComment} onChange={(e) => setSelfComment(e.target.value)} />
                            </label>

                            <h4>{th.performanceReview.feedback360Title}</h4>
                            {row.feedback360 && row.feedback360.length > 0 && (
                              <ul className="whq-muted">
                                {row.feedback360.map((fb) => (
                                  <li key={fb.id}>
                                    {fb.reviewerName ?? fb.reviewerId}: {formatScore(fb.score)}
                                    {fb.comment && ` — ${fb.comment}`}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="whq-form-row">
                              <label className="whq-field">
                                <span className="whq-field-label">{th.performanceReview.col360Score}</span>
                                <input className="whq-input" type="number" min={0} max={100} step={0.1} value={feedback360Score} onChange={(e) => setFeedback360Score(e.target.value)} />
                              </label>
                              <label className="whq-field">
                                <span className="whq-field-label">{th.performanceReview.feedback360Comment}</span>
                                <input className="whq-input" value={feedback360Comment} onChange={(e) => setFeedback360Comment(e.target.value)} />
                              </label>
                              <WorkHQButton type="button" variant="secondary" disabled={busyId === row.id || !feedback360Score} onClick={() => void submit360(row.id)}>
                                {th.performanceReview.add360Feedback}
                              </WorkHQButton>
                            </div>

                            {row.breakdown && (
                              <div className="whq-breakdown-panel">
                                <h4>{th.performanceReview.breakdownTitle}</h4>
                                <p className="whq-muted">{th.performanceReview.breakdownHint}</p>
                                <div className="whq-info-grid">
                                  <div>
                                    <span className="whq-info-label">{th.performanceReview.colKpiScore}</span>
                                    <span>{formatScore(row.breakdown.kpiScore)} × {formatWeightPct(row.breakdown.kpiWeight)}</span>
                                  </div>
                                  <div>
                                    <span className="whq-info-label">{th.performanceReview.colLeaderScore}</span>
                                    <span>{formatScore(row.breakdown.leaderReviewScore)} × {formatWeightPct(row.breakdown.leaderReviewWeight)}</span>
                                  </div>
                                  <div>
                                    <span className="whq-info-label">{th.performanceReview.colSelfScore}</span>
                                    <span>{formatScore(row.breakdown.selfReviewScore)} × {formatWeightPct(row.breakdown.selfReviewWeight)}</span>
                                  </div>
                                  <div>
                                    <span className="whq-info-label">{th.performanceReview.col360Score}</span>
                                    <span>{formatScore(row.breakdown.feedback360Score)} × {formatWeightPct(row.breakdown.feedback360Weight)}</span>
                                  </div>
                                  <div>
                                    <span className="whq-info-label">{th.kpi.colScore}</span>
                                    <strong>{formatScore(row.breakdown.finalScore)}</strong>
                                    {row.breakdown.grade && ` (${row.breakdown.grade})`}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="whq-btn-group">
                              <WorkHQButton type="button" variant="primary" disabled={busyId === row.id} onClick={() => void saveScores(row.id)}>
                                {th.kpi.saveScores}
                              </WorkHQButton>
                              {row.status !== 'finalized' && (
                                <WorkHQButton type="button" variant="secondary" disabled={busyId === row.id} onClick={() => void submitReview(row.id)}>
                                  {th.performanceReview.submitReview}
                                </WorkHQButton>
                              )}
                              {row.status !== 'finalized' && (
                                <WorkHQButton type="button" variant="primary" disabled={busyId === row.id} onClick={() => void finalizeReview(row.id)}>
                                  {th.performanceReview.finalizeReview}
                                </WorkHQButton>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkHQCard>
    </WorkHQPage>
  );
}
