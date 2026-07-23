/** Thai labels for payroll item types shown in employee detail. */
export const PAYROLL_ITEM_TYPE_LABELS: Record<string, string> = {
  salary: 'เงินเดือน',
  meal_allowance: 'ค่าอาหาร (วันออฟฟิศ)',
  cross_border: 'ค่าข้าม',
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

export function payrollItemTypeLabel(itemType: string): string {
  return PAYROLL_ITEM_TYPE_LABELS[itemType] ?? itemType;
}

function formatMoneyPart(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} บาท`;
  const digits = Number.isInteger(n) ? 0 : 2;
  return `${n.toLocaleString('th-TH', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })} บาท`;
}

function formatDetailLine(line: string): string {
  // 2026-07-04:฿91.66(พักรวม 67 นาที · หักจากส่วนที่เกินสิทธิ์พัก)
  // 2026-07-04:฿92(พัก 67 นาที) — legacy
  const withReason = line.match(/^(\d{4}-\d{2}-\d{2}):฿?([\d.]+)\((.+)\)$/);
  if (withReason) {
    let reason = withReason[3]
      .replace(/แจ้งไม่ครบ7วัน/g, 'แจ้งไม่ครบ 7 วัน')
      .replace(/,(\d+(?:\.\d+)?)x/gi, ', คิด $1 เท่า')
      .replace(/(\d+)d/gi, '$1 วัน')
      .replace(/แรง/g, ' แรง')
      .replace(/^พัก (\d+) นาที$/, 'พักรวม $1 นาที · หักจากส่วนที่เกินสิทธิ์พัก')
      .replace(/^เข้างานสาย$/, 'เข้างานสาย (คนละรายการกับพักเกิน)');
    return `• ${withReason[1]} — ${formatMoneyPart(withReason[2])} (${reason})`;
  }

  // 2026-07-04:฿91.66
  const simple = line.match(/^(\d{4}-\d{2}-\d{2}):฿?([\d.]+)$/);
  if (simple) {
    return `• ${simple[1]} — ${formatMoneyPart(simple[2])}`;
  }

  // OT date only
  const dateOnly = line.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `• ${dateOnly[1]}`;

  return `• ${line}`;
}

/**
 * Turn stored payroll notes into short Thai explanations for people (not engineers).
 */
export function humanizePayrollNote(note: string | null | undefined): string {
  if (!note?.trim()) return '—';

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

  if (text.includes(' | ')) {
    const parts = text.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      const [head, ...rest] = parts;
      const details = rest.map((part) => {
        // Already a full sentence — keep as bullet without date parser
        if (!/^\d{4}-\d{2}-\d{2}/.test(part) && !/^OT/i.test(part)) {
          return `• ${part}`;
        }
        return formatDetailLine(part);
      });
      return [head, ...details].join('\n');
    }
  }

  // Single date:amount left in text
  text = text.replace(
    /(\d{4}-\d{2}-\d{2}):฿?([\d.]+)/g,
    (_, date: string, amount: string) => `${date} (${formatMoneyPart(amount)})`,
  );

  return text.trim() || '—';
}
