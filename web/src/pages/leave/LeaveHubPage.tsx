import { Link } from 'react-router-dom';
import { AppPageLayout } from '../../components/workhq';
import { WorkHQButton } from '../../components/ui';

const LINKS = [
  { label: 'คำขอลา', path: '/leave/requests', desc: 'ยื่นและติดตามการลา' },
  { label: 'ปฏิทินทีม', path: '/calendar/team', desc: 'ใครลาวันไหน' },
  { label: 'เลื่อนวันลา', path: '/leave/reschedule', desc: 'ขอเลื่อนวันลา' },
  { label: 'สลับกะ', path: '/leave/shift-swaps', desc: 'สลับกะกับเพื่อนร่วมทีม' },
];

export default function LeaveHubPage() {
  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'วันลา / วันหยุด' }]}
      title="🏖️ วันลา / วันหยุด"
      description="จัดการการลา ปฏิทินทีม และการสลับกะ"
      primaryAction={<WorkHQButton to="/leave/requests" variant="primary">ดูคำขอลา</WorkHQButton>}
      quickActions={<WorkHQButton to="/requests/create" variant="secondary">+ สร้างคำขอลา</WorkHQButton>}
    >
      <div className="whq-settings-grid">
        {LINKS.map((l) => (
          <Link key={l.path} to={l.path} className="whq-settings-card">
            <strong>{l.label}</strong>
            <span>{l.desc}</span>
          </Link>
        ))}
      </div>
    </AppPageLayout>
  );
}
