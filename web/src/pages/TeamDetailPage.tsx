import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';

interface TeamDetail {
  id: string;
  companyId: string;
  code: string;
  name: string;
  level: string;
  bigLeaderEmployeeId: string | null;
  subLeaderEmployeeId: string | null;
  isActive: boolean;
}

interface TeamMember {
  id: string;
  employeeId: string;
  role: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export default function TeamDetailPage() {
  const { id } = useParams();
  const companyId = useCompanyId();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiGet<TeamDetail>(`/marketing/teams/${id}`),
      apiGet<TeamMember[]>(`/marketing/teams/${id}/members`),
    ])
      .then(([teamData, memberData]) => {
        setTeam(teamData);
        setMembers(memberData);
        setError('');
      })
      .catch((err) => setError((err as Error).message));
  }, [id]);

  return (
    <div className="card">
      <p><Link to="/marketing/teams">← Back to teams</Link></p>
      <h1>{team?.name ?? 'Team Detail'}</h1>
      {error && <p className="error">{error}</p>}
      {team && (
        <dl>
          <dt>Code</dt><dd>{team.code}</dd>
          <dt>Level</dt><dd>{team.level}</dd>
          <dt>Company</dt><dd>{team.companyId || companyId}</dd>
          <dt>Big Leader</dt><dd>{team.bigLeaderEmployeeId ?? '-'}</dd>
          <dt>Sub Leader</dt><dd>{team.subLeaderEmployeeId ?? '-'}</dd>
          <dt>Status</dt><dd>{team.isActive ? 'Active' : 'Inactive'}</dd>
        </dl>
      )}
      <h2>Active Members</h2>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Role</th>
            <th>From</th>
            <th>To</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.employeeId}</td>
              <td>{member.role}</td>
              <td>{member.effectiveFrom}</td>
              <td>{member.effectiveTo ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
