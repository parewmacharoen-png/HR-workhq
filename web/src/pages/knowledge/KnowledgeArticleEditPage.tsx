import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPatch, apiPost } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

export default function KnowledgeArticleEditPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const companyId = useCompanyId();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (isNew || !id) return;
    apiGet<{ title: string; body: string; tags: string[] }>(`/knowledge/articles/${id}`)
      .then((article) => {
        setTitle(article.title);
        setBody(article.body);
        setTags(article.tags?.join(', ') ?? '');
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id, isNew]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    const payload = {
      companyId,
      title,
      body,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (isNew) {
      const created = await apiPost<{ id: string }>('/knowledge/articles', payload);
      navigate(`/knowledge/articles/${created.id}`);
    } else if (id) {
      await apiPatch(`/knowledge/articles/${id}`, payload);
    }
  }

  async function togglePublish(publish: boolean) {
    if (!id || isNew) return;
    await apiPost(`/knowledge/articles/${id}/${publish ? 'publish' : 'unpublish'}`);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="card">
      <h1>{isNew ? 'New Article' : 'Edit Article'}</h1>
      <form onSubmit={save} className="form-grid">
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label>Tags (comma-separated)<input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        <label>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} required /></label>
        <div className="toolbar">
          {can('knowledge:write') && <button type="submit">Save</button>}
          {!isNew && can('knowledge:write') && (
            <>
              <button type="button" className="secondary" onClick={() => togglePublish(true)}>Publish</button>
              <button type="button" className="secondary" onClick={() => togglePublish(false)}>Unpublish</button>
            </>
          )}
        </div>
      </form>
      {body && (
        <section className="preview-panel">
          <h2>Preview</h2>
          <pre>{body}</pre>
        </section>
      )}
    </div>
  );
}
