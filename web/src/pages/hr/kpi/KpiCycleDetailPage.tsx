import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchEmployeeList } from '../../../api/employees';
import {
  assignKpiCycle,
  fetchKpiCycleAssignments,
  fetchKpiCycles,
  fetchKpiTemplates,
  finalizeKpiAssignment,
  submitKpiAssignment,
  updateKpiScores,
  type KpiAssignment,
  type KpiCycle,
  type KpiTemplate,
} from '../../../api/kpi';
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

type ScoreDraft = Record<string, { rawValue: string; score: string }>;

function formatScore(score: number | null | undefined): string {
  if (score == null) return th.common.dash;
  return score.toFixed(1);
}

function buildScoreDraft(assignment: KpiAssignment): ScoreDraft {
  const draft: ScoreDraft = {};
  for (const item of assignment.score?.items ?? []) {
    draft[item.metricId] = {
      rawValue: item.rawValue ?? '',
      score: item.score != null ? String(item.score) : '',
    };
  }
  return draft;
}

export default function KpiCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const companyId = useCompanyId();
  const { can } = useAuth();
  const canWrite = can('performance:write');
  const canFinalize = can('performance:finalize');

  const [cycle, setCycle] = useState<KpiCycle | null>(null);
  const [assignments, setAssignments] = useState<KpiAssignment[]>([]);
  const [templates, setTemplates] = useState<KpiTemplate[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [employeeComment, setEmployeeComment] = useState('');
  const [reviewerComment, setReviewerComment] = useState('');

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.status === 'active'),
    [templates],
  );

  const load = useCallback(async () => {
    if (!id || !companyId) return;
    setLoading(true);
    try {
      const [cycleRows, assignmentRows, templateRows, employeeRows] = await Promise.all([
        fetchKpiCycles(companyId),
        fetchKpiCycleAssignments(id),
        fetchKpiTemplates(companyId),
        fetchEmployeeList({ companyId, status: 'active' }),
      ]);
      setCycle(cycleRows.find((row) => row.id === id) ?? null);
      setAssignments(assignmentRows);
      setTemplates(templateRows);
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

  function expandAssignment(row: KpiAssignment) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    setScoreDrafts((drafts) => ({
      ...drafts,
      [row.id]: buildScoreDraft(row),
    }));
    setEmployeeComment(row.score?.employeeComment ?? '');
    setReviewerComment(row.score?.reviewerComment ?? '');
  }

  function updateScoreField(assignmentId: string, metricId: string, field: 'rawValue' | 'score', value: string) {
    setScoreDrafts((drafts) => ({
      ...drafts,
      [assignmentId]: {
        ...drafts[assignmentId],
        [metricId]: {
          ...drafts[assignmentId]?.[metricId],
          [field]: value,
        },
      },
    }));
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !templateId || selectedEmployeeIds.length === 0) return;
    setAssignBusy(true);
    try {
      await assignKpiCycle(id, { templateId, employeeIds: selectedEmployeeIds });
      setSelectedEmployeeIds([]);
      setTemplateId('');
      setFlash(th.kpi.assignSuccess);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setAssignBusy(false);
    }
  }

  async function saveScores(assignment: KpiAssignment) {
    const draft = scoreDrafts[assignment.id] ?? buildScoreDraft(assignment);
    setBusyId(assignment.id);
    try {
      await updateKpiScores(assignment.id, {
        items: (assignment.score?.items ?? []).map((item) => ({
          metricId: item.metricId,
          rawValue: draft[item.metricId]?.rawValue || undefined,
          score: draft[item.metricId]?.score ? Number(draft[item.metricId].score) : undefined,
        })),
        employeeComment: employeeComment.trim() || undefined,
        reviewerComment: reviewerComment.trim() || undefined,
      });
      setFlash(th.kpi.scoresSaved);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmit(assignmentId: string) {
    setBusyId(assignmentId);
    try {
      await submitKpiAssignment(assignmentId);
      setFlash(th.kpi.submitted);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleFinalize(assignmentId: string) {
    setBusyId(assignmentId);
    try {
      await finalizeKpiAssignment(assignmentId);
      setFlash(th.kpi.finalized);
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
        <WorkHQCard title={th.kpi.cycleNotFound}>
          <Link to="/hr/kpi/cycles" className="whq-link">{th.kpi.backToCycles}</Link>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={cycle.name}
        subtitle={`${cycle.periodStart} → ${cycle.periodEnd}`}
        actions={(
          <Link to="/hr/kpi/cycles" className="whq-link">{th.kpi.backToCycles}</Link>
        )}
      />

      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}

      <WorkHQCard title={th.kpi.cycleSummaryTitle}>
        <div className="whq-form-row">
          <div><strong>{th.payrollOverview.colStatus}:</strong> <WorkHQBadge status={cycle.status} /></div>
          <div><strong>{th.kpi.colAssignments}:</strong> {assignments.length}</div>
        </div>
      </WorkHQCard>

      {canWrite && (
        <WorkHQCard title={th.kpi.assignTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleAssign(e)}>
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colTemplate}</span>
              <select className="whq-input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">{th.kpi.selectTemplate}</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            {activeTemplates.length === 0 && (
              <p className="whq-muted">{th.kpi.noActiveTemplates}</p>
            )}
            <div>
              <span className="whq-field-label">{th.kpi.selectEmployees}</span>
              <div className="whq-checkbox-list">
                {employees.map((emp) => (
                  <label key={emp.id} className="whq-checkbox-item">
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
            <WorkHQButton
              type="submit"
              variant="primary"
              disabled={assignBusy || !templateId || selectedEmployeeIds.length === 0}
            >
              {th.kpi.assignEmployees}
            </WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.kpi.assignmentsTitle}>
        {assignments.length === 0 ? (
          <p className="whq-muted">{th.kpi.emptyAssignments}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.payrollCycle.colEmployee}</th>
                  <th>{th.kpi.colTemplate}</th>
                  <th>{th.kpi.colScore}</th>
                  <th>{th.kpi.colGrade}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <Link to={`/hr/employees/${row.employeeId}`} className="whq-link">{row.employeeName}</Link>
                        <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                      </td>
                      <td>{row.templateName}</td>
                      <td>{formatScore(row.score?.totalScore)}</td>
                      <td>{row.score?.grade ?? th.common.dash}</td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>
                        <WorkHQButton type="button" variant="secondary" onClick={() => expandAssignment(row)}>
                          {expandedId === row.id ? th.kpi.hideScores : th.kpi.enterScores}
                        </WorkHQButton>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr>
                        <td colSpan={6}>
                          <ScoreEntryPanel
                            assignment={row}
                            draft={scoreDrafts[row.id] ?? buildScoreDraft(row)}
                            employeeComment={employeeComment}
                            reviewerComment={reviewerComment}
                            canWrite={canWrite}
                            canFinalize={canFinalize}
                            busy={busyId === row.id}
                            onDraftChange={(metricId, field, value) => updateScoreField(row.id, metricId, field, value)}
                            onEmployeeCommentChange={setEmployeeComment}
                            onReviewerCommentChange={setReviewerComment}
                            onSave={() => void saveScores(row)}
                            onSubmit={() => void handleSubmit(row.id)}
                            onFinalize={() => void handleFinalize(row.id)}
                          />
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

function ScoreEntryPanel({
  assignment,
  draft,
  employeeComment,
  reviewerComment,
  canWrite,
  canFinalize,
  busy,
  onDraftChange,
  onEmployeeCommentChange,
  onReviewerCommentChange,
  onSave,
  onSubmit,
  onFinalize,
}: {
  assignment: KpiAssignment;
  draft: ScoreDraft;
  employeeComment: string;
  reviewerComment: string;
  canWrite: boolean;
  canFinalize: boolean;
  busy: boolean;
  onDraftChange: (metricId: string, field: 'rawValue' | 'score', value: string) => void;
  onEmployeeCommentChange: (v: string) => void;
  onReviewerCommentChange: (v: string) => void;
  onSave: () => void;
  onSubmit: () => void;
  onFinalize: () => void;
}) {
  const editable = canWrite && assignment.status !== 'finalized';
  const canSubmit = editable && ['pending', 'in_progress'].includes(assignment.status);
  const canFinalizeNow = canFinalize && ['submitted', 'reviewed'].includes(assignment.status);

  return (
    <div className="whq-form-stack whq-score-panel">
      <div className="whq-table-wrap">
        <table className="whq-table">
          <thead>
            <tr>
              <th>{th.kpi.colMetricName}</th>
              <th>{th.kpi.colWeight}</th>
              <th>{th.kpi.colRawValue}</th>
              <th>{th.kpi.colScore}</th>
            </tr>
          </thead>
          <tbody>
            {(assignment.score?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.metricName}</td>
                <td>{item.weight}</td>
                <td>
                  {editable ? (
                    <input
                      className="whq-input"
                      value={draft[item.metricId]?.rawValue ?? ''}
                      onChange={(e) => onDraftChange(item.metricId, 'rawValue', e.target.value)}
                    />
                  ) : (
                    item.rawValue ?? th.common.dash
                  )}
                </td>
                <td>
                  {editable ? (
                    <input
                      className="whq-input"
                      type="number"
                      min={0}
                      step={0.1}
                      value={draft[item.metricId]?.score ?? ''}
                      onChange={(e) => onDraftChange(item.metricId, 'score', e.target.value)}
                    />
                  ) : (
                    formatScore(item.score)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="whq-form-row">
        <label className="whq-field">
          <span className="whq-field-label">{th.kpi.employeeComment}</span>
          <textarea
            className="whq-input"
            rows={2}
            value={employeeComment}
            onChange={(e) => onEmployeeCommentChange(e.target.value)}
            readOnly={!editable}
            disabled={!editable}
          />
        </label>
        <label className="whq-field">
          <span className="whq-field-label">{th.kpi.reviewerComment}</span>
          <textarea
            className="whq-input"
            rows={2}
            value={reviewerComment}
            onChange={(e) => onReviewerCommentChange(e.target.value)}
            readOnly={!editable}
            disabled={!editable}
          />
        </label>
      </div>

      {editable && (
        <div className="whq-btn-group">
          <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={onSave}>
            {th.kpi.saveScores}
          </WorkHQButton>
          {canSubmit && (
            <WorkHQButton type="button" variant="primary" disabled={busy} onClick={onSubmit}>
              {th.kpi.submitScores}
            </WorkHQButton>
          )}
          {canFinalizeNow && (
            <WorkHQButton type="button" variant="primary" disabled={busy} onClick={onFinalize}>
              {th.kpi.finalizeScores}
            </WorkHQButton>
          )}
        </div>
      )}
    </div>
  );
}
