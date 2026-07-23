import { Link } from 'react-router-dom';
import { WorkHQButton, WorkHQCard, WorkHQSectionTitle } from '../ui';

export interface DashboardTask {
  id: string;
  title: string;
  count?: number;
  path: string;
  urgent?: boolean;
}

interface PracticalDashboardTasksProps {
  tasks: DashboardTask[];
  roleHint?: 'owner' | 'secretary' | 'leader' | 'employee';
}

export function PracticalDashboardTasks({ tasks, roleHint }: PracticalDashboardTasksProps) {
  const urgent = tasks.filter((t) => t.urgent);
  const normal = tasks.filter((t) => !t.urgent);

  return (
    <WorkHQCard title="📋 วันนี้ต้องทำอะไร" className="whq-detail-card">
      {roleHint === 'owner' && (
        <p className="whq-muted" style={{ marginBottom: '0.75rem' }}>
          โฟกัส: อนุมัติ · เงินเดือน · ความเสี่ยง · วันเกิด/ครบรอบ
        </p>
      )}
      {roleHint === 'secretary' && (
        <p className="whq-muted" style={{ marginBottom: '0.75rem' }}>
          โฟกัส: งานวันนี้ · เชิญพนักงาน · เอกสารขาด · ตรวจ payroll
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="whq-muted">✨ ไม่มีงานด่วนตอนนี้ — ดีมาก!</p>
      ) : (
        <>
          {urgent.length > 0 && (
            <>
              <WorkHQSectionTitle>ด่วน</WorkHQSectionTitle>
              <ul className="whq-task-list">
                {urgent.map((t) => (
                  <li key={t.id} className="whq-task-item">
                    <span className="whq-task-priority urgent" aria-hidden />
                    <Link to={t.path} style={{ flex: 1, fontWeight: 600 }}>
                      {t.title}
                      {t.count != null && t.count > 0 ? ` (${t.count})` : ''}
                    </Link>
                    <WorkHQButton to={t.path} variant="secondary">ทำเลย</WorkHQButton>
                  </li>
                ))}
              </ul>
            </>
          )}
          {normal.length > 0 && (
            <>
              <WorkHQSectionTitle>อื่นๆ</WorkHQSectionTitle>
              <ul className="whq-task-list">
                {normal.map((t) => (
                  <li key={t.id} className="whq-task-item">
                    <span className="whq-task-priority normal" aria-hidden />
                    <Link to={t.path} style={{ flex: 1 }}>
                      {t.title}
                      {t.count != null && t.count > 0 ? ` (${t.count})` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="whq-quick-actions">
        <WorkHQButton to="/my-work" variant="primary">ดูงานของฉันทั้งหมด</WorkHQButton>
        <WorkHQButton to="/approvals" variant="secondary">อนุมัติ</WorkHQButton>
        <WorkHQButton to="/requests/create" variant="secondary">+ สร้างคำขอ</WorkHQButton>
        <WorkHQButton to="/hr/invitation" variant="secondary">เชิญพนักงาน</WorkHQButton>
      </div>
    </WorkHQCard>
  );
}
