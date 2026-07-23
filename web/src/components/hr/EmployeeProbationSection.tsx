import { useEffect, useState } from 'react';
import {
  createProbationReview,
  fetchEmployeeProbationReviews,
  resolveProbationReview,
  type ProbationReviewRecord,
  type ResolveProbationInput,
} from '../../api/performance';
import { useAuth } from '../../context/AuthContext';
import { WorkHQButton, WorkHQCard } from '../ui';
import { formatEmployeeDateDdMmYyyy } from '../../i18n/employee-dates';
import { th } from '../../i18n/th-labels';

interface Props {
  employeeId: string;
  companyId: string;
  hireDate?: string;
  probationEndDate?: string | null;
}

function outcomeLabel(outcome: string): string {
  return th.employeeProbation.outcomes[outcome as keyof typeof th.employeeProbation.outcomes] ?? outcome;
}

export function EmployeeProbationSection({ employeeId, companyId, hireDate, probationEndDate }: Props) {
  const { canAny } = useAuth();
  const [reviews, setReviews] = useState<ProbationReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [extensionDays, setExtensionDays] = useState(30);
  const canWrite = canAny('performance:finalize');

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchEmployeeProbationReviews(employeeId);
      setReviews(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [employeeId]);

  async function ensureReview(): Promise<ProbationReviewRecord | null> {
    const pending = reviews.find((r) => r.outcome === 'pending');
    if (pending) return pending;
    if (!hireDate || !probationEndDate) return null;
    return createProbationReview({
      employeeId,
      companyId,
      probationStartDate: hireDate,
      probationEndDate,
    });
  }

  async function resolve(outcome: ResolveProbationInput['outcome']) {
    const review = await ensureReview();
    if (!review) return;
    await resolveProbationReview(review.id, {
      outcome,
      notes: notes.trim() || undefined,
      ...(outcome === 'EXTEND' || outcome === 'extended' ? { extensionDays } : {}),
    });
    setNotes('');
    await load();
  }

  const pending = reviews.find((r) => r.outcome === 'pending');

  return (
    <WorkHQCard title={th.employeeProbation.title} className="whq-detail-card whq-detail-card--wide">
      {loading ? (
        <p className="whq-muted">{th.common.loading}</p>
      ) : reviews.length === 0 && !pending ? (
        <p className="whq-muted">{th.employeeProbation.noReviews}</p>
      ) : (
        <div className="whq-table-wrap">
          <table className="whq-table">
            <thead>
              <tr>
                <th>{th.employeeProbation.colEndDate}</th>
                <th>{th.employeeProbation.colOutcome}</th>
                <th>{th.employeeProbation.colExtendedUntil}</th>
                <th>{th.employeeProbation.colReviewer}</th>
                <th>{th.employeeProbation.colNotes}</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((row) => (
                <tr key={row.id}>
                  <td>{formatEmployeeDateDdMmYyyy(row.probationEndDate)}</td>
                  <td>{outcomeLabel(row.outcome)}</td>
                  <td>{formatEmployeeDateDdMmYyyy(row.extendedUntil)}</td>
                  <td>{row.reviewerName ?? th.common.dash}</td>
                  <td>{row.notes ?? th.common.dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <div className="whq-detail-card-body whq-probation-actions">
          <label className="whq-field">
            <span className="whq-field-label">{th.employeeProbation.notes}</span>
            <textarea
              className="whq-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="whq-field">
            <span className="whq-field-label">{th.employeeProbation.extensionDays}</span>
            <input
              className="whq-input"
              type="number"
              min={1}
              max={365}
              value={extensionDays}
              onChange={(e) => setExtensionDays(Number(e.target.value) || 30)}
            />
          </label>
          <div className="whq-detail-card-actions">
            <WorkHQButton type="button" variant="primary" onClick={() => void resolve('PASS')}>
              {th.employeeProbation.pass}
            </WorkHQButton>
            <WorkHQButton type="button" variant="secondary" onClick={() => void resolve('EXTEND')}>
              {th.employeeProbation.extend}
            </WorkHQButton>
            <WorkHQButton type="button" variant="danger" onClick={() => void resolve('FAIL')}>
              {th.employeeProbation.fail}
            </WorkHQButton>
          </div>
        </div>
      )}
    </WorkHQCard>
  );
}
