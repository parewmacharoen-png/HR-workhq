import { useState } from 'react';
import { graphQuery } from '../../api/phase2-hr-os';
import { useCompanyId } from '../../context/AuthContext';

const EXAMPLES = [
  'ใคร KPI ต่ำกว่า 70 และยังไม่เรียน SOP',
  'Critical role ไม่มี successor',
  'ใครมี competency gap',
  'ใครยังไม่รับทราบนโยบายใหม่',
];

export default function KnowledgeGraphPage() {
  const companyId = useCompanyId();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q: string) {
    if (!companyId || !q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await graphQuery(companyId, q);
      setRows(res.rows);
      setIntent(res.intent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>HR Knowledge Graph</h1>
      <p>ถามคำถาม HR เป็นภาษาธรรมชาติ — ผลลัพธ์จะถูกกรองตามสิทธิ์</p>
      <div className="form-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ถามคำถาม HR..." />
        <button type="button" disabled={loading} onClick={() => run(query)}>ค้นหา</button>
      </div>
      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => { setQuery(ex); run(ex); }}>{ex}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {intent && <p className="hint">Intent: {intent}</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr>{Object.keys(rows[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
