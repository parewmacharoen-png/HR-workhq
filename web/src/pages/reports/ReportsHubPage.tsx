import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isMarketingEnabled } from '../../config/product';
import { AppPageLayout, WorkHQPageState, WorkHQPermissionDenied } from '../../components/workhq';

const REPORT_LINKS = [
  { label: 'HR Analytics', path: '/analytics/hr', desc: 'ภาพรวม HR รายวัน', perm: ['reporting:executive', 'reporting:owner', 'settings:read'] },
  { label: 'แดชบอร์ดผู้บริหาร', path: '/executive', desc: 'Executive summary', perm: ['reporting:executive', 'reporting:owner'] },
  { label: 'Audit Explorer', path: '/audit', desc: 'ประวัติการเปลี่ยนแปลง', perm: ['settings:read'] },
  { label: 'ภาพรวมการเงิน', path: '/finance', desc: 'Finance overview', perm: ['finance:read'] },
];

export default function ReportsHubPage() {
  const { canAny } = useAuth();
  const marketing = isMarketingEnabled();

  const visible = REPORT_LINKS.filter((l) => l.perm.some((p) => canAny(p)));
  if (marketing) {
    visible.push({ label: 'รายงานการตลาด', path: '/marketing/reports', desc: 'Marketing reports', perm: ['marketing:read'] });
  }

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'รายงาน' }]}
      title="📊 รายงาน"
      description="รายงานและข้อมูลเชิงลึกตามบทบาทของคุณ"
    >
      <WorkHQPageState
        state={visible.length ? 'success' : 'permissionDenied'}
        permissionDenied={<WorkHQPermissionDenied title="ไม่มีรายงานที่เข้าถึงได้" />}
      >
        <div className="whq-settings-grid">
          {visible.map((l) => (
            <Link key={l.path} to={l.path} className="whq-settings-card">
              <strong>{l.label}</strong>
              <span>{l.desc}</span>
            </Link>
          ))}
        </div>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
