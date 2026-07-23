/** Visual grouping for back-office permission editor — mirrors sidebar flow. */
export const BACKOFFICE_PERMISSION_SECTIONS: Array<{
  id: string;
  label: string;
  description: string;
  moduleIds: string[];
}> = [
  {
    id: 'core',
    label: 'หลัก — ภาพรวมและคน',
    description: 'แดชบอร์ด คำขอ พนักงาน และการเชิญ Telegram',
    moduleIds: ['dashboard', 'workflow', 'employee', 'onboarding'],
  },
  {
    id: 'operations',
    label: 'การทำงานประจำวัน',
    description: 'เวลาเข้างาน วันลา เงินเดือน และการเงิน',
    moduleIds: ['attendance', 'leave', 'payroll', 'finance'],
  },
  {
    id: 'rewards',
    label: 'ผลงานและค่าตอบแทน',
    description: 'คอมมิชชั่น KPI และแนะนำเพื่อน',
    moduleIds: ['commission', 'performance', 'referral'],
  },
  {
    id: 'org',
    label: 'ข้อมูลองค์กร',
    description: 'เอกสาร โครงสร้าง ทรัพย์สิน ใบเตือน และคู่มือ',
    moduleIds: ['document', 'organization', 'assets', 'warnings', 'knowledge'],
  },
  {
    id: 'system',
    label: 'ระบบและความปลอดภัย',
    description: 'ตั้งค่า สิทธิ์ Telegram และสิทธิ์ขั้นสูง',
    moduleIds: ['settings', 'security', 'access_control', 'ai'],
  },
  {
    id: 'marketing',
    label: 'การตลาด (ถ้าเปิดใช้)',
    description: 'รายงาน KPI และค่าใช้จ่ายการตลาด',
    moduleIds: ['marketing'],
  },
];
