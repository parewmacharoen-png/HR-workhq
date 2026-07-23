import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchEmployeePerformanceReviews,
  type PerformanceReview,
} from '../../api/performance-review';
import { useAuth } from '../../context/AuthContext';
import { WorkHQBadge, WorkHQCard } from '../ui';
import { th } from '../../i18n/th-labels';

interface Props {
  employeeId: string;
  companyId: string;
}

function formatScore(score: number | null | undefined): string {
  if (score == null) return th.common.dash;
  return score.toFixed(1);
}

export function EmployeePerformanceReviewSection({ employeeId, companyId }: Props) {
  const { can } = useAuth();
  const canRead = can('performance:read');
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchEmployeePerformanceReviews(employeeId, companyId)
      .then((data) => setReviews(data.reviews))
      .finally(() => setLoading(false));
  }, [employeeId, companyId, canRead]);

  if (!canRead) return null;

  return (
    <WorkHQCard title={th.performanceReview.employeeHistoryTitle} className="whq-detail-card whq-detail-card--wide">
      {loading ? (
        <p className="whq-muted">{th.common.loading}</p>
      ) : reviews.length === 0 ? (
        <p className="whq-muted">{th.performanceReview.emptyEmployeeHistory}</p>
      ) : (
        <div className="whq-table-wrap">
          <table className="whq-table">
            <thead>
              <tr>
                <th>{th.kpi.colCycle}</th>
                <th>{th.performanceReview.colKpiScore}</th>
                <th>{th.performanceReview.colLeaderScore}</th>
                <th>{th.performanceReview.colSelfScore}</th>
                <th>{th.performanceReview.col360Score}</th>
                <th>{th.kpi.colScore}</th>
                <th>{th.kpi.colGrade}</th>
                <th>{th.payrollOverview.colStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reviews.map((row) => (
                <tr key={row.id}>
                  <td>{row.cycleName ?? row.cycleId}</td>
                  <td>{formatScore(row.kpiScore)}</td>
                  <td>{formatScore(row.leaderReviewScore)}</td>
                  <td>{formatScore(row.selfReviewScore)}</td>
                  <td>{formatScore(row.feedback360Score)}</td>
                  <td>{formatScore(row.finalScore)}</td>
                  <td>{row.grade ?? th.common.dash}</td>
                  <td><WorkHQBadge status={row.status} /></td>
                  <td>
                    <Link to={`/hr/performance/reviews/${row.cycleId}`} className="whq-link">
                      {th.kpi.viewCycle}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkHQCard>
  );
}
