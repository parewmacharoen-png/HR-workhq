// ============================================================================
// Back-office permission matrix — every assignable key with Thai labels.
// ============================================================================

import { ONBOARDING_INVITE_PERMISSIONS } from '../../../employee-onboarding/domain/onboarding-invite-permissions';

export interface BackofficeModuleItem {
  id: string;
  label: string;
  permission: string;
  /** Plain-language effect — what the user can do */
  description: string;
  /** Menu / page this permission unlocks */
  menuHint: string;
}

export interface BackofficeModule {
  id: string;
  label: string;
  icon: string;
  items: BackofficeModuleItem[];
}

export const BACKOFFICE_STAFF_ROLES = [
  'owner',
  'secretary',
  'big_leader',
  'sub_leader',
  'admin_manager',
  'admin',
] as const;

export type BackofficeStaffRole = typeof BACKOFFICE_STAFF_ROLES[number];

function p(
  id: string,
  label: string,
  permission: string,
  description: string,
  menuHint: string,
): BackofficeModuleItem {
  return { id, label, permission, description, menuHint };
}

export const BACKOFFICE_ACCESS_MODULES: BackofficeModule[] = [
  {
    id: 'dashboard',
    label: 'ภาพรวม / แดชบอร์ด',
    icon: '🏠',
    items: [
      p('reporting_read', 'ดูแดชบอร์ดภาพรวม', 'reporting:read', 'เห็นหน้าภาพรวม สรุปคนเข้างาน และการ์ดติดตาม', 'เมนู ภาพรวม'),
      p('reporting_executive', 'รายงานผู้บริหาร', 'reporting:executive', 'เห็นรายงานสรุประดับผู้บริหาร', 'เมนู รายงาน'),
      p('reporting_owner', 'รายงานเจ้าของ', 'reporting:owner', 'เห็นรายงานเชิงลึกสำหรับเจ้าของ', 'เมนู รายงาน'),
    ],
  },
  {
    id: 'workflow',
    label: 'คำขอ / อนุมัติ',
    icon: '📋',
    items: [
      p('workflow_read', 'ดูคำขอทั้งหมด', 'workflow:read', 'เห็นรายการคำขอ งานของฉัน และสถานะ', 'เมนู งานของฉัน / คำขอ'),
      p('workflow_act', 'อนุมัติ / ปฏิเสธคำขอ', 'workflow:act', 'กดอนุมัติหรือปฏิเสธคำขอของคนอื่น', 'เมนู อนุมัติ'),
      p('workflow_write', 'จัดการ Workflow', 'workflow:write', 'สร้าง แก้ไข หรือยกเลิก workflow', 'ตั้งค่า Workflow'),
    ],
  },
  {
    id: 'employee',
    label: 'พนักงาน',
    icon: '👥',
    items: [
      p('employee_read', 'ดูรายชื่อพนักงาน', 'employee:read', 'เห็นรายชื่อ โปรไฟล์ และข้อมูลทั่วไป', 'เมนู พนักงาน'),
      p('employee_write', 'แก้ไขข้อมูลพนักงาน', 'employee:write', 'เพิ่ม แก้ไข หรือปรับสถานะพนักงาน', 'เมนู พนักงาน → แก้ไข'),
      p('employee_sensitive', 'ข้อมูลละเอียดอ่อน', 'employee:sensitive:read', 'เห็นเลขบัตร บัญชีธนาคาร ที่อยู่ และข้อมูลส่วนตัว', 'โปรไฟล์พนักงาน → แท็บละเอียดอ่อน'),
    ],
  },
  {
    id: 'onboarding',
    label: 'เชิญพนักงาน / Telegram',
    icon: '📲',
    items: [
      p('onb_view', 'ดูลิงก์เชิญ', ONBOARDING_INVITE_PERMISSIONS.view, 'เห็นลิงก์เชิญและสถานะการลงทะเบียน', 'พนักงาน → เชิญ Telegram'),
      p('onb_create', 'สร้างลิงก์เชิญ', ONBOARDING_INVITE_PERMISSIONS.create, 'สร้างลิงก์เชิญพนักงานใหม่', 'พนักงาน → สร้างลิงก์เชิญ'),
      p('onb_manage', 'จัดการลิงก์เชิญ', ONBOARDING_INVITE_PERMISSIONS.manage, 'แก้ไขหรือจัดการลิงก์ที่มีอยู่', 'พนักงาน → จัดการเชิญ'),
      p('onb_cancel', 'ยกเลิกลิงก์เชิญ', ONBOARDING_INVITE_PERMISSIONS.cancel, 'ยกเลิกลิงก์เชิญที่ยังไม่ใช้', 'พนักงาน → ยกเลิกเชิญ'),
      p('onb_regen', 'สร้างลิงก์ใหม่', ONBOARDING_INVITE_PERMISSIONS.regenerate, 'ออกลิงก์เชิญใหม่แทนลิงก์เดิม', 'พนักงาน → สร้างลิงก์ใหม่'),
      p('onb_link', 'เชื่อม Telegram คนเดิม', ONBOARDING_INVITE_PERMISSIONS.linkExisting, 'ผูก Telegram ให้พนักงานที่มีอยู่แล้ว', 'พนักงาน → เชื่อม Telegram'),
      p('onb_new', 'เชิญพนักงานใหม่', ONBOARDING_INVITE_PERMISSIONS.newEmployee, 'เริ่มกระบวนการเชิญพนักงานใหม่', 'พนักงาน → เชิญใหม่'),
    ],
  },
  {
    id: 'attendance',
    label: 'เวลาเข้างาน',
    icon: '⏰',
    items: [
      p('attendance_read', 'ดูเวลาเข้างาน', 'attendance:read', 'เห็นปฏิทิน สรุป และรายละเอียดการเข้างาน', 'เมนู เวลาเข้างาน'),
      p('attendance_write', 'แก้ไข / บันทึกเวลา', 'attendance:write', 'แก้ไขเวลา บันทึกย้อนหลัง หรือปรับสถานะ', 'เวลาเข้างาน → แก้ไข'),
    ],
  },
  {
    id: 'leave',
    label: 'วันลา / วันหยุด',
    icon: '🏖️',
    items: [
      p('leave_read', 'ดูวันลา', 'leave:read', 'เห็นประวัติลา ยอดคงเหลือ และปฏิทิน', 'เมนู วันลา / วันหยุด'),
      p('leave_write', 'จัดการวันลา', 'leave:write', 'อนุมัติลา ปรับยอด หรือบันทึกลาให้พนักงาน', 'วันลา → จัดการ'),
    ],
  },
  {
    id: 'payroll',
    label: 'เงินเดือน / สลิป',
    icon: '💰',
    items: [
      p('payroll_read', 'ดูรอบเงินเดือน', 'payroll:read', 'เห็นรอบจ่าย สรุป และสลิปเงินเดือน', 'เมนู เงินเดือน'),
      p('payroll_write', 'จัดการเงินเดือน', 'payroll:write', 'สร้างรอบ แก้ไขรายการ ออกสลิป และปิดรอบ', 'เงินเดือน → จัดการรอบ'),
      p('salary_read', 'ดูเงินเดือนคนอื่น', 'salary:read', 'เห็นยอดเงินเดือนของพนักงานคนอื่น (ไม่ใช่แค่ตัวเอง)', 'เงินเดือน / โปรไฟล์พนักงาน'),
    ],
  },
  {
    id: 'finance',
    label: 'การเงิน / ค่าใช้จ่าย',
    icon: '🧾',
    items: [
      p('finance_read', 'ดูข้อมูลการเงิน', 'finance:read', 'เห็นรายการการเงินและค่าใช้จ่าย', 'ตั้งค่า / การเงิน'),
      p('finance_write', 'จัดการการเงิน', 'finance:write', 'สร้างหรือแก้ไขรายการการเงิน', 'การเงิน → แก้ไข'),
      p('finance_approve', 'อนุมัติการเงิน', 'finance:approve', 'อนุมัติรายการที่รอการเงิน', 'การเงิน → อนุมัติ'),
    ],
  },
  {
    id: 'commission',
    label: 'คอมมิชชั่น',
    icon: '💎',
    items: [
      p('commission_read', 'ดูคอมมิชชั่น', 'commission:read', 'เห็นยอดคอมและรายละเอียด', 'เมนู คอมมิชชั่น'),
      p('commission_write', 'จัดการคอมมิชชั่น', 'commission:write', 'ปรับยอด บันทึก หรือแก้ไขคอม', 'คอมมิชชั่น → จัดการ'),
      p('comm_decl_review', 'ตรวจสอบประกาศคอม', 'commission:declaration:review', 'ตรวจสอบประกาศคอมก่อนอนุมัติ', 'คอมมิชชั่น → ประกาศ'),
      p('comm_decl_approve', 'อนุมัติประกาศคอม', 'commission:declaration:approve', 'อนุมัติประกาศคอมให้มีผล', 'คอมมิชชั่น → ประกาศ'),
      p('comm_decl_reject', 'ปฏิเสธประกาศคอม', 'commission:declaration:reject', 'ปฏิเสธประกาศคอมที่ไม่ถูกต้อง', 'คอมมิชชั่น → ประกาศ'),
    ],
  },
  {
    id: 'performance',
    label: 'ประเมินผล / KPI',
    icon: '🎯',
    items: [
      p('performance_read', 'ดู KPI', 'performance:read', 'เห็นแบบประเมิน คะแนน และผล', 'เมนู ประเมินผล / KPI'),
      p('performance_write', 'จัดการ KPI', 'performance:write', 'สร้างรอบ กำหนดเป้า หรือบันทึกผล', 'ประเมินผล → จัดการ'),
      p('performance_score', 'ให้คะแนน KPI', 'performance:score', 'กรอกหรือให้คะแนนประเมิน', 'ประเมินผล → ให้คะแนน'),
      p('performance_configure', 'ตั้งค่า KPI', 'performance:configure', 'ตั้งค่าแบบประเมิน เกณฑ์ และรอบ', 'ตั้งค่า KPI'),
      p('performance_finalize', 'อนุมัติผลประเมิน', 'performance:finalize', 'ล็อกหรืออนุมัติผลประเมินขั้นสุดท้าย', 'ประเมินผล → อนุมัติ'),
    ],
  },
  {
    id: 'referral',
    label: 'แนะนำเพื่อน / สมัครงาน',
    icon: '🤝',
    items: [
      p('referral_read', 'ดูแนะนำเพื่อน', 'referral:read', 'เห็นรายการแนะนำและสถานะ', 'เมนู แนะนำเพื่อน'),
      p('referral_write', 'จัดการแนะนำเพื่อน', 'referral:write', 'บันทึกหรือแก้ไขข้อมูลแนะนำ', 'แนะนำเพื่อน → จัดการ'),
      p('referral_qualify', 'อนุมัติสิทธิ์แนะนำ', 'referral:qualify', 'ตรวจว่าผู้แนะนำมีสิทธิ์ได้โบนัส', 'แนะนำเพื่อน → อนุมัติสิทธิ์'),
      p('referral_pay', 'จ่ายโบนัสแนะนำ', 'referral:pay', 'อนุมัติหรือจ่ายโบนัสแนะนำเพื่อน', 'แนะนำเพื่อน → จ่ายโบนัส'),
      p('recruitment_read', 'ดูสมัครงาน', 'recruitment:read', 'เห็นใบสมัครและข้อมูลผู้สมัคร', 'เมนู สมัครงาน'),
      p('recruitment_write', 'จัดการสมัครงาน', 'recruitment:write', 'แก้ไขสถานะหรือจัดการผู้สมัคร', 'สมัครงาน → จัดการ'),
    ],
  },
  {
    id: 'document',
    label: 'เอกสาร',
    icon: '📄',
    items: [
      p('document_read', 'ดูเอกสาร', 'document:read', 'เปิดดูและดาวน์โหลดเอกสาร', 'เมนู เอกสาร / โปรไฟล์พนักงาน'),
      p('document_write', 'จัดการเอกสาร', 'document:write', 'อัปโหลด ลบ หรือจัดหมวดเอกสาร', 'เอกสาร → จัดการ'),
    ],
  },
  {
    id: 'organization',
    label: 'องค์กร / โครงสร้าง',
    icon: '🏢',
    items: [
      p('organization_read', 'ดูโครงสร้างองค์กร', 'organization:read', 'เห็นบริษัท แผนก ทีม และ dropdown บริษัท', 'เมนู องค์กร / แถบเลือกบริษัท'),
      p('organization_write', 'แก้ไขโครงสร้าง', 'organization:write', 'สร้างหรือแก้ไขบริษัท แผนก ทีม', 'ตั้งค่า องค์กร'),
    ],
  },
  {
    id: 'assets',
    label: 'ทรัพย์สิน / อุปกรณ์',
    icon: '📦',
    items: [
      p('asset_read', 'ดูทรัพย์สิน', 'asset:read', 'เห็นรายการทรัพย์สินที่มอบให้พนักงาน', 'โปรไฟล์พนักงาน → ทรัพย์สิน'),
      p('asset_write', 'จัดการทรัพย์สิน', 'asset:write', 'มอบ คืน หรือแก้ไขทรัพย์สิน', 'ทรัพย์สิน → จัดการ'),
    ],
  },
  {
    id: 'warnings',
    label: 'ใบเตือน / วินัย',
    icon: '⚠️',
    items: [
      p('warning_read', 'ดูใบเตือน', 'warning:read', 'เห็นประวัติใบเตือนและวินัย', 'โปรไฟล์พนักงาน → ใบเตือน'),
      p('warning_write', 'ออกใบเตือน', 'warning:write', 'สร้างหรือแก้ไขใบเตือน', 'ใบเตือน → สร้าง'),
    ],
  },
  {
    id: 'knowledge',
    label: 'ความรู้ / คู่มือ',
    icon: '📚',
    items: [
      p('knowledge_read', 'ดูคู่มือ', 'knowledge:read', 'อ่านบทความและคู่มือในระบบ', 'เมนู ความรู้'),
      p('knowledge_write', 'จัดการคู่มือ', 'knowledge:write', 'สร้างหรือแก้ไขเนื้อหาคู่มือ', 'ความรู้ → จัดการ'),
    ],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าระบบ',
    icon: '⚙️',
    items: [
      p('settings_read', 'ดูตั้งค่า', 'settings:read', 'เข้าหน้าตั้งค่าระบบทั้งหมด', 'เมนู ตั้งค่า'),
      p('settings_write', 'แก้ไขตั้งค่า', 'settings:write', 'เปลี่ยนค่าตั้งค่า กฎ และนโยบาย', 'ตั้งค่า → บันทึก'),
      p('permission_read', 'ดูสิทธิ์ผู้ใช้', 'permission:read', 'เห็นรายชื่อผู้ใช้หลังบ้านและสิทธิ์', 'ตั้งค่า → ผู้ใช้หลังบ้าน'),
      p('permission_write', 'จัดการสิทธิ์ผู้ใช้', 'permission:write', 'สร้างผู้ใช้ แก้ไข และกำหนดสิทธิ์', 'ตั้งค่า → ผู้ใช้หลังบ้าน'),
    ],
  },
  {
    id: 'security',
    label: 'ความปลอดภัย / Telegram',
    icon: '🔐',
    items: [
      p('security_read', 'ดูความปลอดภัย', 'security:read', 'เห็นการตั้งค่า Telegram และ audit', 'ตั้งค่า → Telegram / ความปลอดภัย'),
      p('security_write', 'จัดการความปลอดภัย', 'security:write', 'เปลี่ยนการตั้งค่า bot และความปลอดภัย', 'ตั้งค่า → Telegram'),
    ],
  },
  {
    id: 'access_control',
    label: 'สิทธิ์ขั้นสูง',
    icon: '🛡️',
    items: [
      p('role_assign', 'มอบหมายบทบาท', 'role:assign', 'เปลี่ยนบทบาทธุรกิจของพนักงาน', 'พนักงาน → บทบาท'),
      p('scope_grant', 'กำหนดขอบเขตบริษัท/ทีม', 'scope:grant', 'กำหนดว่าเห็นข้อมูลบริษัทหรือทีมไหน', 'สิทธิ์ → ขอบเขต'),
      p('impersonation', 'สวมสิทธิ์ผู้ใช้', 'impersonation:use', 'ล็อกอินแทนผู้ใช้อื่นเพื่อแก้ปัญหา (อันตราย)', 'เครื่องมือผู้ดูแล'),
    ],
  },
  {
    id: 'ai',
    label: 'AI / ผู้ช่วย',
    icon: '🤖',
    items: [
      p('ai_chat', 'ใช้ AI Chat', 'ai:chat', 'เปิดใช้แชท AI ในระบบ', 'แชท AI'),
    ],
  },
  {
    id: 'marketing',
    label: 'การตลาด (ถ้าเปิดใช้)',
    icon: '📊',
    items: [
      p('marketing_read', 'ดูข้อมูลการตลาด', 'marketing:read', 'เห็นรายงาน KPI และค่าใช้จ่ายการตลาด', 'เมนู การตลาด'),
      p('marketing_write', 'จัดการการตลาด', 'marketing:write', 'บันทึกหรือแก้ไขข้อมูลการตลาด', 'การตลาด → จัดการ'),
      p('marketing_approve', 'อนุมัติการตลาด', 'marketing:approve', 'อนุมัติรายการการตลาด', 'การตลาด → อนุมัติ'),
      p('marketing_audit', 'ตรวจสอบการตลาด', 'marketing:audit', 'ดู audit log การตลาด', 'การตลาด → Audit'),
      p('marketing_lock', 'ล็อกรอบการตลาด', 'marketing:lock', 'ล็อกรอบไม่ให้แก้ไข', 'การตลาด → ล็อกรอบ'),
    ],
  },
];

export function allMatrixPermissionKeys(): string[] {
  const keys = new Set<string>();
  for (const mod of BACKOFFICE_ACCESS_MODULES) {
    for (const item of mod.items) keys.add(item.permission);
  }
  return [...keys];
}

export function matrixPermissionLabels(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const mod of BACKOFFICE_ACCESS_MODULES) {
    for (const item of mod.items) map[item.permission] = `${mod.label} — ${item.label}`;
  }
  return map;
}
