import { useState } from 'react';
import { apiPost, apiGet } from '../../api/client';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { WorkHQCard, WorkHQButton } from '../../components/ui';

interface KnowledgeResult {
  answer: string;
  sources: Array<{ title: string; sourceType: string; excerpt: string }>;
  confidence: number;
  deniedReason?: string | null;
}

interface UnresolvedQuestion {
  id?: string;
  question?: string;
}

export default function KnowledgeAssistantPage() {
  const { can } = useAuth();
  const companyId = useCompanyId();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<KnowledgeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [unresolved, setUnresolved] = useState<UnresolvedQuestion[]>([]);

  if (!can('ai:chat')) {
    return <p className="whq-muted">ไม่มีสิทธิ์ใช้งานผู้ช่วยความรู้</p>;
  }

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const res = await apiPost<KnowledgeResult>('/ai/knowledge-assistant', {
        question,
        channel: 'web',
      });
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  async function loadUnresolved() {
    if (!companyId) return;
    setUnresolved(await apiGet<UnresolvedQuestion[]>('/ai/knowledge-assistant/unresolved', { companyId }));
  }

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">🤖 WorkHQ Knowledge Assistant</h1>
      <p className="whq-page-subtitle">ถามนโยบายและข้อมูล HR — มีการอ้างอิงแหล่งข้อมูล</p>

      <WorkHQCard title="ถามคำถาม" className="whq-detail-card">
        <textarea
          className="whq-input"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="เช่น ลาป่วยได้กี่วัน / ขอ OT ยังไง"
        />
        <div style={{ marginTop: 12 }}>
          <WorkHQButton onClick={ask} disabled={loading}>{loading ? 'กำลังคิด...' : 'ถาม'}</WorkHQButton>
        </div>
      </WorkHQCard>

      {result && (
        <WorkHQCard title={`คำตอบ (ความมั่นใจ ${result.confidence}%)`} className="whq-detail-card">
          <p style={{ whiteSpace: 'pre-wrap' }}>{result.answer}</p>
          {result.sources.length > 0 && (
            <>
              <h3>แหล่งอ้างอิง</h3>
              <ul>
                {result.sources.map((s, i) => (
                  <li key={i}><strong>{s.title}</strong> ({s.sourceType}) — {s.excerpt.slice(0, 120)}…</li>
                ))}
              </ul>
            </>
          )}
          {result.deniedReason && <p className="whq-muted">ปฏิเสธ: {result.deniedReason}</p>}
        </WorkHQCard>
      )}

      {companyId && (
        <WorkHQCard title="คำถามที่ยังไม่มีคำตอบ" className="whq-detail-card">
          <WorkHQButton onClick={loadUnresolved}>โหลดรายการ</WorkHQButton>
          {unresolved.length > 0 && (
            <ul>{unresolved.map((u, i) => (
              <li key={u.id ?? i}>{u.question}</li>
            ))}</ul>
          )}
        </WorkHQCard>
      )}
    </div>
  );
}
