// ============================================================================
// Thai labels and note humanization for payslip PDF / employee-facing views
// ============================================================================

const PAYROLL_ITEM_TYPE_LABELS: Record<string, string> = {
  salary: 'เงินเดือน',
  meal_allowance: 'ค่าอาหาร (วันออฟฟิศ)',
  cross_border: 'ค่าข้าม (วันออฟฟิศ)',
  leave_bonus: 'โบนัสวันหยุดเหลือ',
  deposit: 'หักประกัน',
  late_deduction: 'หักเข้างานสาย',
  absence_deduction: 'หักขาดงาน',
  excess_off_deduction: 'หักวันหยุด / ลาแจ้งล่วงหน้าน้อย',
  break_deduction: 'หักพักเกินเวลา',
  consecutive_leave_deduction: 'หักลาติดต่อกัน',
  ot: 'ค่าล่วงเวลา (OT)',
  bonus: 'โบนัส',
  commission: 'คอมมิชชั่น',
  commission_adjustment: 'ปรับคอมมิชชั่น',
  referral: 'ค่าแนะนำ',
  manual_adjustment: 'ปรับด้วยมือ',
};

export function payrollItemTypeLabelTh(itemType: string): string {
  return PAYROLL_ITEM_TYPE_LABELS[itemType] ?? itemType;
}

/** Strip builder prefix and keep a short Thai explanation for payslip lines. */
export function humanizePayrollNoteTh(note: string | null | undefined): string {
  if (!note?.trim()) return '';

  let text = note
    .replace(/^payroll_builder\s*\|\s*/i, '')
    .replace(/\[[0-9a-f-]{36}\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const replacements: Array<[RegExp, string]> = [
    [/Prorated salary \((\d+) days?\)/gi, 'คิดตามจำนวนวันในรอบนี้ ($1 วัน)'],
    [/Meal allowance \((\d+) days?\s*[x×]\s*฿?([\d.]+)\)/gi, 'ค่าอาหาร $1 วัน × $2 บาท'],
    [/office (\d+)\s*\/\s*wfh (\d+)/gi, 'ออฟฟิศ $1 วัน · WFH $2 วัน'],
    [/Leave bonus \((\d+) days?\s*[x×]\s*฿?([\d.]+)\)/gi, 'โบนัสจากวันหยุดที่ยังไม่ได้ใช้ $1 วัน × $2 บาท'],
    [/normal cap applied/gi, 'คิดตามเพดานปกติ'],
    [/Monthly deposit/gi, 'หักประกันรายเดือน'],
    [/Late deduction \((\d+) days?\)/gi, 'หักเข้างานสาย $1 วัน'],
    [/Absence deduction \((\d+) days?\)/gi, 'หักขาดงาน $1 วัน'],
    [/Absence deduction/gi, 'หักขาดงาน'],
    [/Late deduction/gi, 'หักเข้างานสาย'],
    [/หักมาสาย/g, 'หักเข้างานสาย'],
    [/พัก (\d+) นาที/g, 'พักรวม $1 นาที · หักจากส่วนที่เกินสิทธิ์พัก'],
    [/OT approved \(([^)]+)\)/gi, 'OT ที่อนุมัติแล้ว ($1)'],
    [/OT approved/gi, 'OT ที่อนุมัติแล้ว'],
    [/Excess off-day deduction/gi, 'หักวันหยุดประจำเดือน'],
    [/Short-notice leave deduction/gi, 'หักลาแจ้งล่วงหน้าน้อย'],
    [/แจ้งไม่ครบ7วัน/g, 'แจ้งไม่ครบ 7 วัน'],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  // Keep first clause + short extras (avoid huge notes on PDF)
  if (text.includes(' | ')) {
    const parts = text.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    text = parts.slice(0, 3).join(' · ');
  }

  return text.trim();
}
