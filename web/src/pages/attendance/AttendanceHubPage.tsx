import { Link } from 'react-router-dom';
import { AppPageLayout } from '../../components/workhq';
import { WorkHQButton } from '../../components/ui';
import { useCompanyScope } from '../../hooks/useCompanyScope';

const LINKS = [
  {
    label: 'ศูนย์บัญชาการเข้างาน',
    path: '/attendance/command-center',
    desc: 'ดูสถานะทีมวันนี้ทั้งองค์กร — ใครเข้างาน สาย ลา OT',
    icon: '🎯',
  },
  {
    label: 'บันทึกประจำวัน',
    path: '/attendance/daily',
    desc: 'รายชื่อพนักงานทั้งหมดพร้อมเวลาเช็กอิน–เช็กเอาต์',
    icon: '📋',
  },
  {
    label: 'ตรวจสอบขาดงาน',
    path: '/attendance/absences',
    desc: 'รายการขาดงานที่ระบบจับได้ — อนุมัติหรือยกเลิกได้',
    icon: '🚫',
  },
  {
    label: 'อนุมัติ OT',
    path: '/attendance/overtime',
    desc: 'คำขอทำงานล่วงเวลาที่รออนุมัติ',
    icon: '🌙',
  },
];

export default function AttendanceHubPage() {
  const { companyLabel, isAllCompanies, scopedCompanyIds, hasCompanyScope } = useCompanyScope();

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'เวลาเข้างาน' }]}
      title="เวลาเข้างาน"
      description={
        hasCompanyScope
          ? `กำลังดู: ${companyLabel}${isAllCompanies ? ` · ${scopedCompanyIds.length} บริษัท` : ''} — เลือกเมนูด้านล่างเพื่อดูรายละเอียด`
          : 'เลือกบริษัทจากแถบด้านบน (หรือทุกบริษัท) เพื่อเริ่มดูข้อมูลทีม'
      }
      primaryAction={(
        <WorkHQButton to="/attendance/daily" variant="primary">
          ดูบันทึกวันนี้
        </WorkHQButton>
      )}
      quickActions={(
        <WorkHQButton to="/attendance/command-center" variant="secondary">
          ศูนย์บัญชาการ
        </WorkHQButton>
      )}
    >
      <div className="whq-att-hub-grid">
        {LINKS.map((link) => (
          <Link key={link.path} to={link.path} className="whq-att-hub-card">
            <span className="whq-att-hub-card__icon" aria-hidden>{link.icon}</span>
            <div className="whq-att-hub-card__body">
              <strong>{link.label}</strong>
              <span>{link.desc}</span>
              <em>เปิดดู →</em>
            </div>
          </Link>
        ))}
      </div>
    </AppPageLayout>
  );
}
