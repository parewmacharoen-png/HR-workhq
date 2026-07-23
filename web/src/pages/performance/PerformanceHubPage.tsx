import { Link } from 'react-router-dom';
import { AppPageLayout } from '../../components/workhq';

const LINKS = [
  { label: 'KPI — รอบประเมิน', path: '/hr/kpi/cycles', desc: 'รอบ KPI ที่เปิดอยู่' },
  { label: 'KPI — แม่แบบ', path: '/hr/kpi/templates', desc: 'ตั้งค่าแม่แบบ KPI' },
  { label: 'ประเมินผลงาน', path: '/hr/performance/reviews', desc: 'รอบประเมินผลงาน' },
  { label: 'โครงสร้างตำแหน่ง', path: '/hr/position-framework', desc: 'กรอบตำแหน่ง' },
  { label: 'ปรับเงินเดือน/เลื่อนตำแหน่ง', path: '/hr/compensation-reviews', desc: 'Compensation review' },
];

export default function PerformanceHubPage() {
  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'ประเมินผล / KPI' }]}
      title="🎯 ประเมินผล / KPI"
      description="KPI ประเมินผล และการพัฒนาตำแหน่ง"
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
