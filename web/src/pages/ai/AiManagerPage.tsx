import { useEffect, useState } from 'react';
import { aiManagerBriefHistory, aiManagerDashboard } from '../../api/phase2-hr-os';
import { useCompanyId } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

export default function AiManagerPage() {
  const companyId = useCompanyId();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    Promise.all([
      aiManagerDashboard(companyId),
      aiManagerBriefHistory(companyId),
    ])
      .then(([dash, briefs]) => {
        setData(dash);
        setHistory(briefs);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const critical = (data.criticalRisks as Array<Record<string, unknown>>) ?? [];
  const latest = history[0];

  return (
    <div className="card">
      <h1>AI Manager</h1>
      <div className="grid-stats">
        <div className="stat"><span>Insight เปิด</span><strong>{String(data.openInsights)}</strong></div>
        <div className="stat"><span>รออนุมัติ</span><strong>{String(data.overdueApprovals)}</strong></div>
        <div className="stat"><span>ความเสี่ยงวิกฤต</span><strong>{critical.length}</strong></div>
      </div>

      <h2>Morning Brief ล่าสุด</h2>
      {latest ? (
        <div>
          <p><strong>สถานะส่ง:</strong> {String(latest.deliveryStatus)}</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(latest.summaryText)}</pre>
        </div>
      ) : (
        <p>ยังไม่มี brief วันนี้</p>
      )}

      <h2>ประวัติ Brief</h2>
      <ul>
        {history.slice(0, 10).map((b) => (
          <li key={String(b.id)}>
            {new Date(String(b.generatedAt)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
            {' — '}
            {String(b.deliveryStatus)}
          </li>
        ))}
      </ul>

      <h2>ความเสี่ยงวิกฤต</h2>
      <ul>
        {critical.map((c) => (
          <li key={String(c.id)}><strong>{String(c.title)}</strong> — {String(c.summary)}</li>
        ))}
      </ul>
      {!critical.length && <p>ไม่มีความเสี่ยงวิกฤตในขณะนี้</p>}
    </div>
  );
}
