import { useEffect, useState } from 'react';
import { useCompanyId } from '../../context/AuthContext';
import { listMyDocuments, listDocumentCenterKnowledge } from '../../api/document-center';
import { getAuthToken } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';

interface DocRow {
  id: string;
  docType: string;
  fileName: string;
  uploadedAt: string;
  expiresAt?: string;
}

interface ArticleRow {
  id: string;
  title: string;
  category?: string;
}

export default function MyDocumentsPage() {
  const companyId = useCompanyId();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      const [myDocs, knowledge] = await Promise.all([
        listMyDocuments(),
        companyId ? listDocumentCenterKnowledge(companyId) : Promise.resolve([]),
      ]);
      setDocs(myDocs);
      setArticles(knowledge);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>เอกสารของฉัน</h1>
        <button type="button" className="secondary" onClick={load}>Refresh</button>
      </div>

      <h2>เอกสาร</h2>
      {!docs.length ? (
        <EmptyState title="ยังไม่มีเอกสาร" />
      ) : (
        <table>
          <thead>
            <tr><th>ชื่อไฟล์</th><th>ประเภท</th><th>อัปโหลด</th><th>หมดอายุ</th></tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <a
                    href={`/api/v1/documents/${d.id}/download`}
                    onClick={(e) => {
                      const token = getAuthToken();
                      if (token) {
                        e.preventDefault();
                        fetch(`/api/v1/documents/${d.id}/download`, {
                          headers: { Authorization: `Bearer ${token}` },
                        })
                          .then((r) => r.blob())
                          .then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = d.fileName;
                            a.click();
                            URL.revokeObjectURL(url);
                          });
                      }
                    }}
                  >
                    {d.fileName}
                  </a>
                </td>
                <td>{d.docType}</td>
                <td>{new Date(d.uploadedAt).toLocaleString()}</td>
                <td>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: '2rem' }}>ศูนย์ความรู้</h2>
      {!articles.length ? (
        <EmptyState title="ไม่มีบทความ" />
      ) : (
        <ul>
          {articles.map((a) => (
            <li key={a.id}>{a.title}{a.category ? ` (${a.category})` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
