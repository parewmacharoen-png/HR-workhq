import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useCompanyId } from '../../context/AuthContext';
import { WorkHQCard, WorkHQButton } from '../../components/ui';

interface TrainingCourse {
  id: string;
  title: string;
  status: string;
  category: string | null;
}

interface TrainingDashboard {
  overdue: number;
  completionRate: number;
  draftCourses: number;
}

export default function TrainingPage() {
  const companyId = useCompanyId();
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [dash, setDash] = useState<TrainingDashboard | null>(null);
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    const [c, d] = await Promise.all([
      apiGet<TrainingCourse[]>('/training/courses', { companyId }),
      apiGet<TrainingDashboard>('/training/dashboard', { companyId }),
    ]);
    setCourses(c);
    setDash(d);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function createCourse() {
    if (!companyId || !title.trim()) return;
    await apiPost('/training/courses', { title, companyId });
    setTitle('');
    await load();
  }

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">📚 Training Library</h1>
      {dash && (
        <div className="whq-detail-grid">
          <WorkHQCard title="ค้างเรียน"><p>{dash.overdue}</p></WorkHQCard>
          <WorkHQCard title="อัตราเรียนจบ"><p>{dash.completionRate}%</p></WorkHQCard>
          <WorkHQCard title="ร่างคอร์ส"><p>{dash.draftCourses}</p></WorkHQCard>
        </div>
      )}
      <WorkHQCard title="สร้างคอร์ส" className="whq-detail-card">
        <input className="whq-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อคอร์ส" />
        <WorkHQButton onClick={createCourse}>สร้าง</WorkHQButton>
      </WorkHQCard>
      <WorkHQCard title="คอร์สทั้งหมด" className="whq-detail-card">
        <table className="whq-table">
          <thead><tr><th>ชื่อ</th><th>หมวด</th><th>สถานะ</th></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}><td>{c.title}</td><td>{c.category ?? '—'}</td><td>{c.status}</td></tr>
            ))}
          </tbody>
        </table>
      </WorkHQCard>
    </div>
  );
}
