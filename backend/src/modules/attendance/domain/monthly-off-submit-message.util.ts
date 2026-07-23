import type { OtBonusPreview } from '../../payroll/domain/services/off-day-ot-usage.service';
import { formatShortNoticeWarning, formatAdvanceNoticeDeductionLine } from '../../leave/domain/services/leave-notice.util';

export interface MonthlyOffSubmitPreview {
  periodLabel: string;
  submittedDayCount: number;
  monthlyOffAllowance: number;
  fullMonthlyOffAllowance?: number;
  offDayProrated?: boolean;
  eligibleEmploymentDays?: number;
  periodDays?: number;
  excessMonthlyOffDays: number;
  otPreview: OtBonusPreview;
  shortNoticeDates: string[];
  noticeDays: number;
}

export function buildMonthlyOffSubmitTelegramMessage(
  summaryLabel: string,
  preview: MonthlyOffSubmitPreview,
): string {
  const lines = [`✅ ส่งวันหยุดประจำเดือน ${summaryLabel} — รออนุมัติ`];

  const { otPreview, excessMonthlyOffDays, shortNoticeDates, noticeDays } = preview;

  lines.push('');
  lines.push(
    `📊 สรุปผลต่อโอทีวันหยุด (฿${otPreview.ratePerDay}/วัน สูงสุด ${otPreview.maxBonusDays} วัน/เดือน)`,
  );
  lines.push(`• ใช้สิทธิ์หยุดรวมหลังส่ง: ${otPreview.usedOffDayUnits} วัน`);
  lines.push(`• โอทีที่คาดว่าได้: ${otPreview.eligibleBonusDays} วัน (฿${otPreview.bonusAmount.toLocaleString('th-TH')})`);

  if (otPreview.usedOffDayUnits < 2) {
    lines.push(`• แนะนำหยุดอย่างน้อย 2 วัน/เดือน`);
  }

  const noticeWarn = formatShortNoticeWarning(shortNoticeDates, noticeDays);
  if (noticeWarn) {
    lines.push('');
    lines.push(noticeWarn);
    lines.push(formatAdvanceNoticeDeductionLine(noticeDays, false));
    lines.push(formatAdvanceNoticeDeductionLine(noticeDays, true));
  }

  if (excessMonthlyOffDays > 0) {
    lines.push('');
    lines.push(
      `⚠️ วันหยุดประจำเดือนเกินโควต้า ${preview.monthlyOffAllowance} วัน (เกิน ${excessMonthlyOffDays} วัน) — จะมีการหักเงินเดือน`,
    );
    lines.push(formatAdvanceNoticeDeductionLine(noticeDays, false));
    lines.push(formatAdvanceNoticeDeductionLine(noticeDays, true));
  }

  if (preview.offDayProrated && preview.fullMonthlyOffAllowance != null) {
    lines.push('');
    lines.push(
      `📅 สิทธิ์วันหยุดปรับตามวันทำงานในรอบ: ${preview.monthlyOffAllowance}/${preview.fullMonthlyOffAllowance} วัน`
      + (preview.eligibleEmploymentDays != null && preview.periodDays != null
        ? ` (ทำงาน ${preview.eligibleEmploymentDays}/${preview.periodDays} วัน)`
        : ''),
    );
  }

  lines.push('');
  lines.push('💡 ลาป่วย/ลากิจนับเป็นวันหยุดสำหรับโอที — ลาฉุกเฉินนับ 2 วันต่อ 1 วันลา');

  return lines.join('\n');
}
