// ============================================================================
// modules/telegram/domain/telegram-report.formatter.ts
// Pure formatters for /report command responses (unit-testable).
// ============================================================================

import type {
  CompanyDashboardPayload,
  EveningBriefPayload,
  ExecutiveDashboardPayload,
  MorningBriefPayload,
  OwnerDashboardPayload,
} from '../../reporting/domain/entities/dashboard-payloads';
import type { CommissionDashboardBlock } from '../../reporting/domain/entities/commission-executive-dashboard.types';

export interface PersonalAttendanceReport {
  workDate: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  lateMinutes: number;
}

function formatTime(d: Date | null): string {
  if (!d) return '-';
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}

/** Bullet list of employee names for Telegram briefs (HTML). */
export function formatNameBulletSection(
  title: string,
  names: string[],
  max = 20,
): string {
  if (names.length === 0) return `${title}\n  — ไม่มี`;
  const lines = names.slice(0, max).map((name) => `  • ${name}`);
  if (names.length > max) {
    lines.push(`  … และอีก ${names.length - max} คน`);
  }
  return `${title} (${names.length})\n${lines.join('\n')}`;
}

export function formatPersonalDailyReport(record: PersonalAttendanceReport): string {
  const lateLine = record.lateMinutes > 0
    ? `⚠️ สาย: ${record.lateMinutes} นาที`
    : '✅ ตรงเวลา';
  return (
    `📊 รายงานวันนี้ ${record.workDate}\n` +
    `⏰ เข้างาน: ${formatTime(record.checkInAt)}\n` +
    `🚪 ออกงาน: ${record.checkOutAt ? formatTime(record.checkOutAt) : 'ยังไม่ออก'}\n` +
    `⏱ ทำงาน: ${record.workedMinutes} นาที\n` +
    lateLine
  );
}

export function formatMorningReport(
  payload: MorningBriefPayload,
  companyName: string,
  notYetInNames: string[] = [],
): string {
  const names = notYetInNames.filter((line) => line !== 'ไม่มีรายการ');
  const sections = [
    `🌅 <b>รายงานเช้า — ${companyName}</b>`,
    `📅 ${payload.snapshotDate}`,
    `👥 คาดหวัง: ${payload.totalExpected}`,
    `✅ เข้างานแล้ว: ${payload.checkedIn}`,
    `❌ ยังไม่เข้า: ${payload.notYetIn}`,
    `⏰ สาย: ${payload.lateCount}`,
    `📊 อัตราเข้างาน: ${payload.checkInRate}%`,
  ];
  if (names.length > 0 || payload.notYetIn > 0) {
    sections.push('');
    sections.push(formatNameBulletSection('👤 รายชื่อที่ยังไม่เข้างาน', names));
  }
  return sections.join('\n');
}

export function formatEveningReport(
  payload: EveningBriefPayload,
  companyName: string,
  missingCheckoutNames: string[] = [],
): string {
  const names = missingCheckoutNames.filter((line) => line !== 'ไม่มีรายการ');
  const sections = [
    `🌙 <b>รายงานเย็น — ${companyName}</b>`,
    `📅 ${payload.snapshotDate}`,
    `⚠️ ยังไม่ออกงาน: ${payload.missingCheckout}`,
    `🔥 OT รออนุมัติ: ${payload.pendingOtCount}`,
    `❌ ขาดงาน: ${payload.absentCount}`,
    `🌴 ลารออนุมัติ: ${payload.pendingLeave}`,
    `📋 รออนุมัติทั้งหมด: ${payload.pendingApprovals}`,
  ];
  if (names.length > 0 || payload.missingCheckout > 0) {
    sections.push('');
    sections.push(formatNameBulletSection('👤 รายชื่อที่ยังไม่ออกงาน', names));
  }
  return sections.join('\n');
}

export function formatCompanySummary(payload: CompanyDashboardPayload, companyName: string): string {
  return [
    `🏢 <b>สรุปบริษัท — ${companyName}</b>`,
    `📅 ${payload.snapshotDate}`,
    `👥 พนักงาน: ${payload.headcountActive} (ทดลองงาน ${payload.headcountProbation})`,
    `📊 อัตราเข้างาน: ${payload.attendanceRate}%`,
    `📋 รออนุมัติ: ${payload.pendingApprovals}`,
    `💰 เงินเดือน: ${payload.payroll.cycleStatus} (สุทธิ ฿${payload.payroll.totalNet.toLocaleString('th-TH')})`,
    `💵 การเงิน: รายรับ ฿${payload.finance.revenuePosted.toLocaleString('th-TH')} / รายจ่าย ฿${payload.finance.expensePosted.toLocaleString('th-TH')}`,
    `📊 ค่าคอมรอ: ${payload.commission.onHoldCount} รายการ`,
  ].join('\n');
}

export function formatAnnouncementMessage(title: string, body: string): string {
  return `📢 <b>${title}</b>\n\n${body}\n\n—WorkHQ`;
}

// ── Executive sprint formatters ──────────────────────────────────────────────

export interface PayslipView {
  periodStart: string;
  periodEnd: string;
  gross: number;
  deductions: number;
  net: number;
  cycleStatus?: string;
}

export function formatPayslip(payslip: PayslipView): string {
  return [
    `💰 <b>สลิปเงินเดือน</b>`,
    `📅 ${payslip.periodStart} → ${payslip.periodEnd}`,
    payslip.cycleStatus ? `📋 สถานะรอบ: ${payslip.cycleStatus}` : null,
    `💵 รายได้รวม: ฿${payslip.gross.toLocaleString('th-TH')}`,
    `➖ หัก: ฿${payslip.deductions.toLocaleString('th-TH')}`,
    `✅ สุทธิ: ฿${payslip.net.toLocaleString('th-TH')}`,
  ].filter(Boolean).join('\n');
}

export function formatPayslipHistory(items: PayslipView[]): string {
  if (items.length === 0) return '💰 ไม่พบสลิปเงินเดือน';
  const lines = items.map(
    (p, i) => `${i + 1}. ${p.periodStart} → ${p.periodEnd}: ฿${p.net.toLocaleString('th-TH')}`,
  );
  return `💰 <b>สลิปย้อนหลัง</b>\n${lines.join('\n')}`;
}

export interface CommissionSummaryView {
  cycleLabel: string;
  pending: number;
  qualified: number;
  hold: number;
  pendingAmount: number;
  qualifiedAmount: number;
  holdAmount: number;
}

export function formatCommissionSummary(view: CommissionSummaryView): string {
  return [
    `📊 <b>สรุปค่าคอมมิชชั่น</b>`,
    `🔄 รอบ: ${view.cycleLabel}`,
    `⏳ รอดำเนินการ: ${view.pending} รายการ (฿${view.pendingAmount.toLocaleString('th-TH')})`,
    `✅ ผ่านเกณฑ์: ${view.qualified} รายการ (฿${view.qualifiedAmount.toLocaleString('th-TH')})`,
    `🔒 Hold: ${view.hold} รายการ (฿${view.holdAmount.toLocaleString('th-TH')})`,
  ].join('\n');
}

export interface ReferralStatusView {
  pending: number;
  qualified: number;
  paid: number;
  pendingReward: number;
  qualifiedReward: number;
  paidReward: number;
}

export function formatReferralStatus(view: ReferralStatusView): string {
  return [
    `🤝 <b>สถานะแนะนำเพื่อน</b>`,
    `⏳ รอดำเนินการ: ${view.pending} (฿${view.pendingReward.toLocaleString('th-TH')})`,
    `✅ ผ่านเกณฑ์: ${view.qualified} (฿${view.qualifiedReward.toLocaleString('th-TH')})`,
    `💵 จ่ายแล้ว: ${view.paid} (฿${view.paidReward.toLocaleString('th-TH')})`,
  ].join('\n');
}

export interface TeamAttendanceMember {
  name: string;
  detail?: string;
}

export function formatTeamAttendanceDashboard(
  notCheckedIn: TeamAttendanceMember[],
  notCheckedOut: TeamAttendanceMember[],
  lateArrivals: TeamAttendanceMember[],
  date: string,
): string {
  const list = (title: string, items: TeamAttendanceMember[]) => {
    if (items.length === 0) return `${title}\n  — ไม่มี`;
    return `${title}\n${items.map((m) => `  • ${m.name}${m.detail ? ` (${m.detail})` : ''}`).join('\n')}`;
  };
  return [
    `👥 <b>แดชบอร์ดทีม — ${date}</b>`,
    list(`❌ ยังไม่เข้างาน (${notCheckedIn.length})`, notCheckedIn.slice(0, 8)),
    list(`⚠️ ยังไม่ออกงาน (${notCheckedOut.length})`, notCheckedOut.slice(0, 8)),
    list(`⏰ มาสาย (${lateArrivals.length})`, lateArrivals.slice(0, 8)),
  ].join('\n\n');
}

export function formatOwnerCompanySummary(payload: OwnerDashboardPayload): string {
  const companyLines = payload.companies.slice(0, 5).map(
    (c) => `• ${c.companyName}: 👥${c.headcountActive} 📊${c.attendanceRate}% 📋${c.pendingApprovals}`,
  );
  return [
    `👑 <b>สรุปบริษัททั้งหมด</b>`,
    `📅 ${payload.snapshotDate}`,
    ...companyLines,
    payload.companies.length > 5 ? `… และอีก ${payload.companies.length - 5} บริษัท` : null,
    `—`,
    `👥 รวม: ${payload.totals.headcount}`,
    `📋 รออนุมัติ: ${payload.totals.pendingApprovals}`,
    `💵 สุทธิรวม: ฿${payload.totals.net.toLocaleString('th-TH')}`,
    `—`,
    `🔄 เลื่อนวันลาเดือนนี้: ${payload.leaveReschedule.countMtd}`,
    `✅ อัตราอนุมัติเลื่อนวันลา: ${payload.leaveReschedule.approvalRate}%`,
    payload.leaveReschedule.topEmployees.length > 0
      ? `👤 ขอเลื่อนบ่อย: ${payload.leaveReschedule.topEmployees.slice(0, 3).map((e) => `${e.employeeName} (${e.count})`).join(', ')}`
      : null,
  ].filter(Boolean).join('\n');
}

export function formatOwnerFinanceSummary(payload: OwnerDashboardPayload): string {
  return [
    `👑 <b>สรุปการเงิน</b>`,
    `📅 ${payload.snapshotDate}`,
    `📈 รายรับรวม: ฿${payload.totals.revenuePosted.toLocaleString('th-TH')}`,
    `📉 รายจ่ายรวม: ฿${payload.totals.expensePosted.toLocaleString('th-TH')}`,
    `💵 สุทธิรวม: ฿${payload.totals.net.toLocaleString('th-TH')}`,
  ].join('\n');
}

export function formatOwnerPayrollSummary(payload: ExecutiveDashboardPayload): string {
  return [
    `👑 <b>สรุปเงินเดือน</b>`,
    `📅 ${payload.snapshotDate}`,
    `🔄 รอบ: ${payload.period.start} → ${payload.period.end}`,
    `📋 สถานะ: ${payload.payroll.cycleStatus}`,
    `💵 รายได้รวม: ฿${payload.payroll.totalGross.toLocaleString('th-TH')}`,
    `✅ สุทธิรวม: ฿${payload.payroll.totalNet.toLocaleString('th-TH')}`,
  ].join('\n');
}

export interface RecruitmentSummaryView {
  total: number;
  byStage: Record<string, number>;
  uniqueCounted: number;
}

export function formatOwnerRecruitmentSummary(view: RecruitmentSummaryView): string {
  const stageLines = Object.entries(view.byStage)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => `• ${stage}: ${count}`);
  return [
    `👑 <b>สรุปการสรรหา</b>`,
    `👥 ผู้สมัครทั้งหมด: ${view.total}`,
    `🎯 นับ Unique: ${view.uniqueCounted}`,
    ...stageLines,
  ].join('\n');
}

function formatTopList(title: string, items: Array<{ employeeName: string; amount: number }>, limit = 5): string {
  if (items.length === 0) return `${title}\n  — ไม่มีข้อมูล`;
  return `${title}\n${items.slice(0, limit).map((e, i) =>
    `  ${i + 1}. ${e.employeeName} — ฿${e.amount.toLocaleString('th-TH')}`,
  ).join('\n')}`;
}

export function formatOwnerCommissionSummary(block: CommissionDashboardBlock, snapshotDate?: string): string {
  const { marketing, admin, referral, recruitment, executiveSummary } = block;
  return [
    `👑 <b>Dashboard ค่าคอมมิชชั่น</b>`,
    snapshotDate ? `📅 ${snapshotDate}` : null,
    '',
    `📈 <b>Marketing</b>`,
    `• Pool: ฿${marketing.overview.teamCommissionPool.toLocaleString('th-TH')}`,
    `• จ่ายแล้ว: ฿${marketing.overview.paidCommission.toLocaleString('th-TH')}`,
    `• Hold: ฿${marketing.overview.holdAmount.toLocaleString('th-TH')}`,
    `• Big Leader: ฿${marketing.overview.bigLeaderCommission.toLocaleString('th-TH')}`,
    '',
    `🏛 <b>Admin</b>`,
    `• Pool: ฿${admin.overview.adminPool.toLocaleString('th-TH')}`,
    `• จ่ายได้: ฿${admin.overview.totalPayable.toLocaleString('th-TH')}`,
    `• หักโทษ: ฿${admin.overview.totalPenalties.toLocaleString('th-TH')}`,
    '',
    `🤝 <b>Referral</b>`,
    `• รอดำเนินการ: ${referral.overview.pendingReferrals}`,
    `• จ่ายแล้ว: ฿${referral.financial.paidRewards.toLocaleString('th-TH')}`,
    `• ต้นทุนรวม: ฿${referral.financial.totalReferralCost.toLocaleString('th-TH')}`,
    '',
    `👥 <b>Recruitment</b>`,
    `• ผ่านเกณฑ์: ${recruitment.overview.recruitersQualified}`,
    `• Hold: ${recruitment.overview.recruitersOnHold}`,
    `• ค่าคอมจ่าย: ฿${recruitment.commissionMetrics.paidCommission.toLocaleString('th-TH')}`,
    '',
    `💰 <b>สรุปรวม</b>`,
    `• ค่าใช้จ่ายรวม: ฿${executiveSummary.totalCommissionExpense.toLocaleString('th-TH')}`,
    `• จ่ายแล้ว: ฿${executiveSummary.totalPaid.toLocaleString('th-TH')}`,
    `• รอจ่าย: ฿${executiveSummary.totalPending.toLocaleString('th-TH')}`,
    `• Hold: ฿${executiveSummary.totalHold.toLocaleString('th-TH')}`,
    '',
    formatTopList('🏆 Marketing Top 5', executiveSummary.topMarketingEarners),
    formatTopList('🏆 Recruiter Top 5', executiveSummary.topRecruiters),
    formatTopList('🏆 Admin Top 5', executiveSummary.highestAdminCommission),
    formatTopList('🏆 Referral Top 5', executiveSummary.highestReferralEarners),
  ].filter((line) => line !== null).join('\n');
}

export interface MarketingKpiView {
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  targetCount: number;
  remainingCount: number;
  conversionRatePercent: number;
  qualified: boolean;
  cycleLabel?: string | null;
}

export function formatMyMarketingKpi(view: MarketingKpiView): string {
  const status = view.qualified ? 'ผ่าน KPI ✅' : 'ยังไม่ผ่าน KPI';
  return [
    '📈 <b>KPI ของฉัน</b>',
    view.cycleLabel ? `🔄 รอบ: ${view.cycleLabel}` : null,
    '',
    `ยอดทักรวม\n${view.contactedCount.toLocaleString('th-TH')}`,
    '',
    `สมาชิกใหม่\n${view.newMemberCount.toLocaleString('th-TH')}`,
    '',
    `ยอดฝาก\n${view.depositAmount.toLocaleString('th-TH')}`,
    '',
    `เด็กลงงาน\n${view.startedWorkCount} / ${view.targetCount}`,
    '',
    `เหลืออีก\n${view.remainingCount} คน`,
    '',
    `Conversion\n${view.conversionRatePercent}%`,
    '',
    `สถานะ\n${status}`,
  ].filter((line) => line !== null).join('\n');
}

export interface MarketingDailyReportSummaryView {
  reportDate: string;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
}

export function formatMarketingDailyReportSummary(view: MarketingDailyReportSummaryView): string {
  return [
    `รายงานวันที่ ${view.reportDate}`,
    '',
    `ยอดทักเด็ก: ${view.contactedCount.toLocaleString('th-TH')}`,
    `สมาชิกใหม่: ${view.newMemberCount.toLocaleString('th-TH')}`,
    `ยอดฝาก: ${view.depositAmount.toLocaleString('th-TH')}`,
    `เด็กลงงาน: ${view.startedWorkCount.toLocaleString('th-TH')}`,
  ].join('\n');
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'ฉบับร่าง',
  submitted: 'ส่งแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  voided: 'ยกเลิก',
};

export interface MyLatestMarketingReportView {
  reportDate: string;
  status: string;
  submittedAt: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
}

export function formatMyLatestMarketingReport(view: MyLatestMarketingReportView): string {
  const status = STATUS_LABELS[view.status] ?? view.status;
  const submitted = view.submittedAt
    ? new Date(view.submittedAt).toLocaleString('th-TH')
    : '-';
  return [
    '<b>📋 รายงานล่าสุดของฉัน</b>',
    '',
    `วันที่: ${view.reportDate}`,
    `สถานะ: ${status}`,
    `ส่งเมื่อ: ${submitted}`,
    '',
    `ยอดทักเด็ก: ${view.contactedCount.toLocaleString('th-TH')}`,
    `สมาชิกใหม่: ${view.newMemberCount.toLocaleString('th-TH')}`,
    `ยอดฝาก: ${view.depositAmount.toLocaleString('th-TH')}`,
    `เด็กลงงาน: ${view.startedWorkCount.toLocaleString('th-TH')}`,
  ].join('\n');
}

export interface MarketingExpenseSummaryView {
  totalExpense: number;
  costPerContact: number | null;
  costPerNewMember: number | null;
  costPerStartedWork: number | null;
  depositRoi: number | null;
  byCategory: Record<string, number>;
}

export function formatMarketingExpenseSummary(view: MarketingExpenseSummaryView): string {
  const topCategories = Object.entries(view.byCategory)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amount]) => `• ${cat}: ${amount.toLocaleString('th-TH')} บาท`);

  return [
    '<b>💰 สรุปรายจ่ายการตลาด</b>',
    '',
    `รวม (อนุมัติแล้ว): ${view.totalExpense.toLocaleString('th-TH')} บาท`,
    `ต้นทุนต่อทัก: ${view.costPerContact?.toLocaleString('th-TH') ?? '-'} บาท`,
    `ต้นทุนต่อสมาชิกใหม่: ${view.costPerNewMember?.toLocaleString('th-TH') ?? '-'} บาท`,
    `ต้นทุนต่อเด็กลงงาน: ${view.costPerStartedWork?.toLocaleString('th-TH') ?? '-'} บาท`,
    `Deposit ROI: ${view.depositRoi?.toFixed(2) ?? '-'}`,
    '',
    topCategories.length > 0 ? '<b>หมวดหลัก</b>' : '',
    ...topCategories,
  ].filter(Boolean).join('\n');
}

export interface ExecutiveBriefSectionView {
  label: string;
  headline: {
    headcountActive: number;
    attendanceRate: number;
    financeNet: number;
    payrollNet: number;
    pendingApprovals: number;
    riskAlertCount: number;
    commissionOnHold: number;
  };
  financeNet: number;
  recommendations: string[];
}

export function formatExecutiveBriefSection(view: ExecutiveBriefSectionView): string {
  const recLines = view.recommendations.slice(0, 3).map((r) => `• ${r}`);
  return [
    `📈 <b>Executive Brief — ${view.label}</b>`,
    `👥 พนักงาน: ${view.headline.headcountActive}`,
    `📊 การเข้างาน: ${view.headline.attendanceRate}%`,
    `💵 กำไรสุทธิ: ฿${view.financeNet.toLocaleString('th-TH')}`,
    `💰 เงินเดือนสุทธิ: ฿${view.headline.payrollNet.toLocaleString('th-TH')}`,
    `⏳ รออนุมัติ: ${view.headline.pendingApprovals}`,
    `⚠️ ความเสี่ยง: ${view.headline.riskAlertCount}`,
    recLines.length > 0 ? '' : null,
    recLines.length > 0 ? '<b>คำแนะนำ</b>' : null,
    ...recLines,
  ].filter((line) => line !== null).join('\n');
}
