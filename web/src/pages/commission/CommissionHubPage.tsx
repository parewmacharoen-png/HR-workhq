import { Link } from 'react-router-dom';
import { AppPageLayout } from '../../components/workhq';

const LINKS = [
  { label: 'รอบค่าคอม', path: '/commission/cycles', desc: 'รอบคำนวณค่าคอมมิชชั่น' },
  { label: 'ค่าคอมแอดมิน', path: '/commission/admin', desc: 'คำนวณค่าคอมแอดมินต่อบริษัทจากกำไรสุทธิ' },
  { label: 'การปรับยอด', path: '/commission/adjustments', desc: 'ปรับยอดค่าคอม' },
  { label: 'การประกาศ', path: '/commission/declarations', desc: 'ประกาศค่าคอม' },
];

export default function CommissionHubPage() {
  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'คอมมิชชั่น' }]}
      title="💎 คอมมิชชั่น"
      description="ติดตามรอบค่าคอม การปรับยอด และการประกาศ"
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
