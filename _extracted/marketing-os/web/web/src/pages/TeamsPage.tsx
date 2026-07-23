import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface TeamTreeNode {
  id: string;
  code: string;
  name: string;
  level: string;
  isActive: boolean;
  bigLeaderEmployeeId: string | null;
  subLeaderEmployeeId: string | null;
  memberCount: number;
  children: TeamTreeNode[];
}

function TeamNode({ node, depth = 0 }: { node: TeamTreeNode; depth?: number }) {
  return (
    <>
      <tr>
        <td style={{ paddingLeft: `${depth * 16}px` }}>
          <Link to={`/marketing/teams/${node.id}`}>{node.name}</Link>
        </td>
        <td>{node.code}</td>
        <td>{node.level}</td>
        <td>{node.memberCount}</td>
        <td>{node.isActive ? 'Active' : 'Inactive'}</td>
      </tr>
      {node.children.map((child) => (
        <TeamNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function TeamsPage() {
  const companyId = useCompanyId();
  const [tree, setTree] = useState<TeamTreeNode[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      setTree(await apiGet<TeamTreeNode[]>('/marketing/teams/tree', { companyId }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>Marketing Teams</h1>
      <div className="toolbar">
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Code</th>
            <th>Level</th>
            <th>Members</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tree.map((node) => <TeamNode key={node.id} node={node} />)}
        </tbody>
      </table>
    </div>
  );
}
