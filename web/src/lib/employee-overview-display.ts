import type { EmployeeDetailTabId } from '../components/hr/employee-detail/employee-detail-tabs';
import type { EmployeeOverviewResponse } from '../api/employee-overview';
import { NO_DATA } from './employee-date-utils';
import { employmentStatusLabel } from '../i18n/th-labels';

export function formatBirthdayCountdown(summary: EmployeeOverviewResponse['summary']): string {
  if (!summary.dateOfBirth) return NO_DATA;
  if (summary.isBirthdayToday) return 'วันนี้วันเกิด 🎂';
  if (summary.birthdayInDays != null) return `อีก ${summary.birthdayInDays} วันถึงวันเกิด`;
  return NO_DATA;
}

export function formatAnniversaryCountdown(summary: EmployeeOverviewResponse['summary']): string {
  if (summary.isAnniversaryToday) return 'วันนี้ครบรอบงาน 🎉';
  if (summary.workAnniversaryInDays != null) return `อีก ${summary.workAnniversaryInDays} วันถึงครบรอบงาน`;
  return NO_DATA;
}

export function telegramStatusLabel(
  status: EmployeeOverviewResponse['summary']['telegramStatus'],
): string {
  switch (status) {
    case 'linked':
      return 'เชื่อมแล้ว';
    case 'pending_review':
      return 'รอ HR ตรวจสอบ';
    case 'invitation_sent':
      return 'ส่งลิงก์แล้ว';
    case 'expired':
      return 'ลิงก์หมดอายุ';
    case 'rejected':
      return 'ไม่ผ่านการอนุมัติ';
    default:
      return 'ยังไม่เชื่อม';
  }
}

export function attendanceTodayLabel(status: string | undefined | null): string {
  switch (status) {
    case 'working':
      return 'กำลังทำงาน';
    case 'completed':
      return 'เสร็จสิ้นแล้ว';
    case 'incomplete':
      return 'บันทึกไม่ครบ';
    case 'off':
      return 'ยังไม่เข้างาน';
    default:
      return NO_DATA;
  }
}

export interface SummaryCardModel {
  id: string;
  icon: string;
  label: string;
  value: string;
  trend?: string;
  trendTone?: 'warning' | 'neutral';
  tone: 'green' | 'cool' | 'warm' | 'lavender';
  tab: EmployeeDetailTabId;
  opensTelegram?: boolean;
}

export function buildSummaryCards(overview: EmployeeOverviewResponse): SummaryCardModel[] {
  const { summary, attendance, leave, payroll, kpi } = overview;

  const employmentValue = employmentStatusLabel(summary.employmentStatus);
  const employmentTrend = summary.tenureDisplay !== NO_DATA ? summary.tenureDisplay : undefined;

  const attendanceValue = attendance
    ? attendanceTodayLabel(attendance.todayStatus)
    : NO_DATA;
  const attendanceTrend = attendance
    ? [
        `มา ${attendance.presentDaysMonth} วัน (เดือนนี้)`,
        attendance.lateCountMonth > 0 ? `สาย ${attendance.lateCountMonth} วัน` : null,
      ].filter(Boolean).join(' · ')
    : undefined;

  let leaveValue = NO_DATA;
  let leaveTrend: string | undefined;
  if (leave?.onLeaveToday) {
    leaveValue = `ลา${leave.onLeaveToday.leaveTypeName}`;
    leaveTrend = 'วันนี้';
  } else if (leave?.balances.length) {
    const top = leave.balances[0];
    leaveValue = `${top.remaining} วัน`;
    leaveTrend = top.leaveTypeName;
  } else if (leave?.upcomingLeave.length) {
    leaveValue = leave.upcomingLeave[0].leaveTypeName;
    leaveTrend = `เริ่ม ${leave.upcomingLeave[0].startDate}`;
  }

  let payrollValue = NO_DATA;
  let payrollTrend: string | undefined;
  if (payroll?.canViewSalary) {
    if (payroll.currentSalary != null) {
      payrollValue = `${payroll.currentSalary.toLocaleString('th-TH')} บาท`;
      payrollTrend = payroll.bankAccountMasked ? 'มีบัญชีแล้ว' : 'ยังไม่มีบัญชี';
    } else {
      payrollValue = NO_DATA;
      payrollTrend = payroll.bankAccountMasked ? 'มีบัญชีแล้ว' : undefined;
    }
  } else {
    payrollValue = 'ไม่มีสิทธิ์ดู';
  }

  const telegramValue = telegramStatusLabel(summary.telegramStatus);
  const telegramTrend = summary.telegramUsername
    ? `@${summary.telegramUsername}`
    : undefined;

  let performanceValue = NO_DATA;
  let performanceTrend: string | undefined;
  if (kpi?.latestScore != null) {
    performanceValue = String(kpi.latestScore);
    performanceTrend = kpi.latestPeriod ?? undefined;
  } else if (kpi?.latestPeriod) {
    performanceValue = kpi.latestPeriod;
    performanceTrend = kpi.status ?? undefined;
  }

  return [
    {
      id: 'employment',
      icon: '💼',
      label: 'การจ้างงาน',
      value: employmentValue,
      trend: employmentTrend,
      tone: 'green',
      tab: 'employment',
    },
    {
      id: 'attendance',
      icon: '⏰',
      label: 'เวลาเข้างาน',
      value: attendanceValue,
      trend: attendanceTrend,
      trendTone: attendance && attendance.lateCountMonth > 0 ? 'warning' : 'neutral',
      tone: 'cool',
      tab: 'attendance',
    },
    {
      id: 'leave',
      icon: '🏖',
      label: 'วันลา',
      value: leaveValue,
      trend: leaveTrend,
      tone: 'warm',
      tab: 'leave',
    },
    {
      id: 'payroll',
      icon: '💰',
      label: 'เงินเดือน',
      value: payrollValue,
      trend: payrollTrend,
      tone: 'lavender',
      tab: 'payroll',
    },
    {
      id: 'telegram',
      icon: '✈',
      label: 'Telegram',
      value: telegramValue,
      trend: telegramTrend,
      tone: 'cool',
      tab: 'personal',
      opensTelegram: summary.telegramStatus === 'not_linked'
        || summary.telegramStatus === 'expired',
    },
    {
      id: 'performance',
      icon: '📊',
      label: 'Performance',
      value: performanceValue,
      trend: performanceTrend,
      tone: 'green',
      tab: 'performance',
    },
  ];
}
