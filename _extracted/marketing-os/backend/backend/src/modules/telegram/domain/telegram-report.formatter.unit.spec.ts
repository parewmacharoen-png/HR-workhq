// ============================================================================
// modules/telegram/domain/telegram-report.formatter.unit.spec.ts
// ============================================================================

import {
  formatAnnouncementMessage,
  formatCommissionSummary,
  formatCompanySummary,
  formatEveningReport,
  formatMorningReport,
  formatOwnerCompanySummary,
  formatPersonalDailyReport,
  formatReferralStatus,
  formatTeamAttendanceDashboard,
} from './telegram-report.formatter';
import type {
  CompanyDashboardPayload,
  EveningBriefPayload,
  MorningBriefPayload,
  OwnerDashboardPayload,
} from '../../reporting/domain/entities/dashboard-payloads';

describe('telegram-report.formatter', () => {
  it('formatPersonalDailyReport shows on-time when not late', () => {
    const text = formatPersonalDailyReport({
      workDate: '2026-06-20',
      checkInAt: new Date('2026-06-20T02:00:00.000Z'),
      checkOutAt: null,
      workedMinutes: 120,
      lateMinutes: 0,
    });
    expect(text).toContain('รายงานวันนี้ 2026-06-20');
    expect(text).toContain('ยังไม่ออก');
    expect(text).toContain('✅ ตรงเวลา');
  });

  it('formatPersonalDailyReport shows late minutes', () => {
    const text = formatPersonalDailyReport({
      workDate: '2026-06-20',
      checkInAt: new Date('2026-06-20T02:30:00.000Z'),
      checkOutAt: new Date('2026-06-20T10:00:00.000Z'),
      workedMinutes: 450,
      lateMinutes: 15,
    });
    expect(text).toContain('⚠️ สาย: 15 นาที');
  });

  it('formatMorningReport includes company metrics', () => {
    const payload: MorningBriefPayload = {
      generatedAt: '2026-06-20T02:00:00.000Z',
      snapshotDate: '2026-06-20',
      companyId: 'co-1',
      companyName: 'SB',
      totalExpected: 50,
      checkedIn: 40,
      notYetIn: 10,
      lateCount: 3,
      checkInRate: 80,
    };
    const text = formatMorningReport(payload, 'SB Company');
    expect(text).toContain('รายงานเช้า');
    expect(text).toContain('80%');
  });

  it('formatEveningReport includes pending counts', () => {
    const payload: EveningBriefPayload = {
      generatedAt: '2026-06-20T16:00:00.000Z',
      snapshotDate: '2026-06-20',
      companyId: 'co-1',
      companyName: 'SB',
      missingCheckout: 5,
      pendingOtCount: 2,
      absentCount: 1,
      pendingApprovals: 7,
      pendingLeave: 3,
    };
    const text = formatEveningReport(payload, 'SB Company');
    expect(text).toContain('รายงานเย็น');
    expect(text).toContain('OT รออนุมัติ: 2');
  });

  it('formatCompanySummary includes payroll and finance', () => {
    const payload: CompanyDashboardPayload = {
      generatedAt: '2026-06-20T02:00:00.000Z',
      snapshotDate: '2026-06-20',
      companyId: 'co-1',
      companyName: 'SB',
      headcountActive: 48,
      headcountProbation: 5,
      attendanceRate: 85,
      pendingApprovals: 4,
      payroll: { cycleStatus: 'open', totalGross: 500000, totalNet: 420000 },
      finance: { revenuePosted: 1000000, expensePosted: 700000, net: 300000, advancePending: 2 },
      commission: { onHoldCount: 1, qualifiedRate: 75 },
    };
    const text = formatCompanySummary(payload, 'SB Company');
    expect(text).toContain('สรุปบริษัท');
    expect(text).toContain('open');
  });

  it('formatCommissionSummary shows cycle breakdown', () => {
    const text = formatCommissionSummary({
      cycleLabel: '2026-06-01 → 2026-06-30',
      pending: 2,
      qualified: 3,
      hold: 1,
      pendingAmount: 1000,
      qualifiedAmount: 5000,
      holdAmount: 500,
    });
    expect(text).toContain('รอบ: 2026-06-01');
    expect(text).toContain('Hold: 1');
  });

  it('formatReferralStatus shows status counts', () => {
    const text = formatReferralStatus({
      pending: 1,
      qualified: 2,
      paid: 3,
      pendingReward: 2000,
      qualifiedReward: 4000,
      paidReward: 6000,
    });
    expect(text).toContain('รอดำเนินการ: 1');
    expect(text).toContain('จ่ายแล้ว: 3');
  });

  it('formatTeamAttendanceDashboard lists attendance buckets', () => {
    const text = formatTeamAttendanceDashboard(
      [{ name: 'A' }],
      [{ name: 'B' }],
      [{ name: 'C', detail: '10 นาที' }],
      '2026-06-20',
    );
    expect(text).toContain('ยังไม่เข้างาน');
    expect(text).toContain('มาสาย');
  });

  it('formatOwnerCompanySummary aggregates totals', () => {
    const payload: OwnerDashboardPayload = {
      generatedAt: '2026-06-20',
      snapshotDate: '2026-06-20',
      companyId: null,
      companyName: null,
      companies: [{
        companyId: 'c1',
        companyName: 'SB',
        headcountActive: 10,
        attendanceRate: 90,
        pendingApprovals: 2,
        revenuePosted: 100000,
        expensePosted: 50000,
        net: 50000,
      }],
      totals: {
        headcount: 10,
        pendingApprovals: 2,
        revenuePosted: 100000,
        expensePosted: 50000,
        net: 50000,
      },
      leaveReschedule: {
        countMtd: 2,
        approvalRate: 50,
        topEmployees: [{ employeeId: 'e1', employeeName: 'Test User', count: 2 }],
      },
    };
    const text = formatOwnerCompanySummary(payload);
    expect(text).toContain('SB');
    expect(text).toContain('รวม: 10');
  });
});
