import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isMarketingEnabled } from '../../config/product';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQPermissionDenied,
} from '../../components/workhq';

interface SettingsSection {
  slug: string;
  label: string;
  description: string;
  path: string;
  permissions?: string[];
  advanced?: boolean;
  marketingOnly?: boolean;
}

const SECTIONS: SettingsSection[] = [
  { slug: 'company', label: 'บริษัท', description: 'ข้อมูลบริษัท โซนเวลา สกุลเงิน', path: '/settings/system' },
  { slug: 'backoffice-users', label: 'ผู้ใช้หลังบ้าน', description: 'สร้างบัญชี login แยกจากพนักงาน — เลือกหัวข้อที่เห็นได้', path: '/settings/backoffice-users', permissions: ['permission:read', 'permission:write'] },
  { slug: 'roles', label: 'บทบาทและสิทธิ์ (ขั้นสูง)', description: 'กำหนดสิทธิ์รายคน ดูสิทธิ์เงินเดือน', path: '/settings/permissions', permissions: ['permission:read'], advanced: true },
  { slug: 'telegram', label: 'Telegram', description: 'บัญชี Telegram และรออนุมัติสมัคร', path: '/security/telegram-identities', permissions: ['security:read'] },
  { slug: 'request-types', label: 'ประเภทคำขอ', description: 'ตั้งค่าประเภทคำขอในระบบ', path: '/admin/request-types', permissions: ['workflow:write'], advanced: true },
  { slug: 'workflow', label: 'เวิร์กโฟลว์', description: 'สร้างและจัดการขั้นตอนอนุมัติ', path: '/settings/workflows', permissions: ['workflow:read', 'workflow:write'], advanced: true },
  { slug: 'formula', label: 'สูตรคำนวณ', description: 'ตั้งสูตรคำนวณเงินเดือนและหักเงิน', path: '/admin/formulas', permissions: ['settings:read'], advanced: true },
  { slug: 'payroll-rules', label: 'กฎเงินเดือน', description: 'รอบเงินเดือน เบี้ยเลี้ยง วันจ่าย', path: '/settings/payroll', permissions: ['settings:read'] },
  { slug: 'commission-admin', label: 'ค่าคอมแอดมิน', description: 'กรอกกำไรสุทธิคำนวณค่าคอมแอดมินรายบริษัท', path: '/commission/admin', permissions: ['commission:read', 'payroll:read'] },
  { slug: 'commission-admin-settings', label: 'ตั้งค่าสูตรค่าคอมแอดมิน', description: 'อัตรา pool และกฎแบ่ง front/back office', path: '/settings/commission/admin', permissions: ['settings:read'] },
  { slug: 'leave-rules', label: 'กฎการลา', description: 'วันหยุดประจำเดือน สิทธิ์ลา เลื่อนวันลา', path: '/settings/leave', permissions: ['settings:read'] },
  { slug: 'shift-rules', label: 'กฎเวลาเข้างาน', description: 'ตั้งกะงาน แจ้งเตือนเช็กอิน กฎสาย/OT', path: '/settings/attendance', permissions: ['settings:read'] },
  { slug: 'assets', label: 'อุปกรณ์ยืม / ทรัพย์สิน', description: 'บันทึกว่าพนักงานยืมอะไรไปบ้าง สรุปว่าของอยู่กับใคร', path: '/hr/assets', permissions: ['employee:read'] },
  { slug: 'audit', label: 'ตรวจสอบระบบ', description: 'ประวัติการเปลี่ยนแปลงและความปลอดภัย', path: '/audit', permissions: ['settings:read'], advanced: true },
  { slug: 'competency', label: 'ทักษะและสมรรถนะ', description: 'เมทริกซ์ทักษะพนักงาน (HR ขั้นสูง)', path: '/hr/competencies', permissions: ['employee:read'], advanced: true },
  { slug: 'succession', label: 'แผนทดแทน', description: 'วางแผนผู้สืบทอดตำแหน่ง (HR ขั้นสูง)', path: '/hr/succession', permissions: ['employee:read'], advanced: true },
];

export default function SettingsHubPage() {
  const { canAny, can } = useAuth();
  const marketing = isMarketingEnabled();

  const hasAccess = can('settings:read') || can('security:read') || can('workflow:write') || can('permission:read');

  const visible = SECTIONS.filter((s) => {
    if (s.marketingOnly && !marketing) return false;
    if (!s.permissions?.length) return true;
    return s.permissions.some((p) => canAny(p));
  });

  const practical = visible.filter((s) => !s.advanced);
  const advanced = visible.filter((s) => s.advanced);

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'ตั้งค่า' }]}
      title="⚙️ ตั้งค่า"
      description="ศูนย์รวมการตั้งค่าระบบ — กฎเงินเดือน การลา เวลาเข้างาน และเครื่องมือผู้ดูแล"
    >
      <WorkHQPageState
        state={hasAccess ? 'success' : 'permissionDenied'}
        permissionDenied={<WorkHQPermissionDenied />}
      >
        <h2 className="whq-section-title">การตั้งค่าทั่วไป</h2>
        <div className="whq-settings-grid">
          {practical.map((s) => (
            <Link key={s.slug} to={s.path} className="whq-settings-card">
              <strong>{s.label}</strong>
              <span>{s.description}</span>
            </Link>
          ))}
        </div>
        {advanced.length > 0 && (
          <>
            <h2 className="whq-section-title">ขั้นสูง / ผู้ดูแลระบบ</h2>
            <div className="whq-settings-grid">
              {advanced.map((s) => (
                <Link key={s.slug} to={s.path} className="whq-settings-card advanced">
                  <strong>{s.label}</strong>
                  <span>{s.description}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
