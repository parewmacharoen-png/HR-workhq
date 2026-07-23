import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { WorkHQCard } from '../ui';

interface LeaveRow {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  leaveType?: { name?: string; code?: string };
}

export function EmployeeLeaveCalendarSection({
  employeeId,
  companyId,
}: {
  employeeId: string;
  companyId: string;
}) {
  const [upcoming, setUpcoming] = useState<LeaveRow[]>([]);
  const [history, setHistory] = useState<LeaveRow[]>([]);

  useEffect(() => {
    void (async () => {
      const rows = await apiGet<LeaveRow[]>('/leave/requests', {
        companyId,
        employeeId,
      }).catch(() => []);
      const today = new Date().toISOString().slice(0, 10);
      const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));
      setUpcoming(sorted.filter((r) => r.endDate >= today && r.status === 'approved').slice(0, 5));
      setHistory(sorted.filter((r) => r.endDate < today || r.status !== 'approved').slice(0, 10));
    })();
  }, [employeeId, companyId]);

  return (
    <div className="whq-detail-grid">
      <WorkHQCard title="Upcoming Leave" className="whq-detail-card">
        {upcoming.length === 0 ? (
          <p className="whq-muted">No upcoming approved leave</p>
        ) : (
          <ul>
            {upcoming.map((r) => (
              <li key={r.id}>
                {r.startDate} — {r.endDate} ({r.leaveType?.name ?? r.leaveType?.code ?? 'leave'})
              </li>
            ))}
          </ul>
        )}
        <Link to="/calendar/team">Team calendar →</Link>
      </WorkHQCard>
      <WorkHQCard title="Leave History" className="whq-detail-card">
        {history.length === 0 ? (
          <p className="whq-muted">No leave history</p>
        ) : (
          <ul>
            {history.map((r) => (
              <li key={r.id}>
                {r.startDate} — {r.endDate} · {r.status}
              </li>
            ))}
          </ul>
        )}
      </WorkHQCard>
    </div>
  );
}
