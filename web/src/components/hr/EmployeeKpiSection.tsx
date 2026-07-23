import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEmployeeKpi, type KpiAssignment } from '../../api/kpi';
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

export function EmployeeKpiSection({ employeeId, companyId }: Props) {
  const { can } = useAuth();
  const canRead = can('performance:read');
  const [assignments, setAssignments] = useState<KpiAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchEmployeeKpi(employeeId, companyId)
      .then((data) => setAssignments(data.assignments))
      .finally(() => setLoading(false));
  }, [employeeId, companyId, canRead]);

  if (!canRead) return null;

  return (
    <WorkHQCard title={th.kpi.employeeHistoryTitle} className="whq-detail-card whq-detail-card--wide">
      {loading ? (
        <p className="whq-muted">{th.common.loading}</p>
      ) : assignments.length === 0 ? (
        <p className="whq-muted">{th.kpi.emptyEmployeeHistory}</p>
      ) : (
        <div className="whq-table-wrap">
          <table className="whq-table">
            <thead>
              <tr>
                <th>{th.kpi.colCycle}</th>
                <th>{th.kpi.colTemplate}</th>
                <th>{th.kpi.colScore}</th>
                <th>{th.kpi.colGrade}</th>
                <th>{th.payrollOverview.colStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => (
                <tr key={row.id}>
                  <td>{row.cycleName}</td>
                  <td>{row.templateName}</td>
                  <td>{formatScore(row.score?.totalScore)}</td>
                  <td>{row.score?.grade ?? th.common.dash}</td>
                  <td><WorkHQBadge status={row.status} /></td>
                  <td>
                    <Link to={`/hr/kpi/cycles/${row.cycleId}`} className="whq-link">
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
