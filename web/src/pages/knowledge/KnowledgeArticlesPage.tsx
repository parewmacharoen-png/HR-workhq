import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';

interface ArticleRow {
  id: string;
  title: string;
  isPublished: boolean;
  tags: string[];
  updatedAt: string;
}

export default function KnowledgeArticlesPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      setRows(await apiGet<ArticleRow[]>('/knowledge/articles', { companyId }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function reindex() {
    if (!companyId) return;
    await apiPost(`/knowledge/reindex?companyId=${companyId}`);
    await load();
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Knowledge Base</h1>
        <div className="toolbar">
          {can('knowledge:write') && (
            <>
              <Link to="/knowledge/articles/new"><button type="button">New article</button></Link>
              <button type="button" className="secondary" onClick={reindex}>Reindex</button>
            </>
          )}
          <button type="button" className="secondary" onClick={load}>Refresh</button>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Title</th><th>Status</th><th>Tags</th><th>Updated</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td><StatusBadge status={row.isPublished ? 'approved' : 'draft'} /></td>
              <td>{row.tags?.join(', ') || '—'}</td>
              <td>{new Date(row.updatedAt).toLocaleString()}</td>
              <td><Link to={`/knowledge/articles/${row.id}`}>Edit</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
