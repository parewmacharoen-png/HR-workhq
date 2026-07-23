// ============================================================================
// modules/reporting/domain/services/dashboard-builder.service.unit.spec.ts
// ============================================================================

import { DashboardBuilderService } from './dashboard-builder.service';
import type {
  AttendanceMetrics, WorkflowMetrics, PayrollMetrics,
  FinanceMetrics, HeadcountMetrics, CommissionMetrics,
} from '../repositories/reporting.repository';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const COMPANY = { id: 'co-001', name: 'Test Company' };
const DATE = new Date('2024-06-01T09:00:00.000Z');
const PERIOD = { start: new Date('2024-05-25'), end: new Date('2024-06-23') };

const ATT: AttendanceMetrics = {
  totalExpected: 50,
  checkedIn: 40,
  checkedOut: 35,
  absent: 5,
  lateCount: 3,
  missingCheckout: 5,
  checkInRate: 80,
};

const WF: WorkflowMetrics = {
  pendingTotal: 10,
  byType: { leave: 4, overtime: 3, advance: 2, deposit_refund: 1 },
  overdueCount: 2,
};

const PAY: PayrollMetrics = { cycleStatus: 'open', totalGross: 500000, totalNet: 420000 };

const FIN: FinanceMetrics = { revenuePosted: 1000000, expensePosted: 700000, net: 300000, advancePending: 3 };

const HC: HeadcountMetrics = { active: 48, probation: 5, terminatedMtd: 1 };

const COM: CommissionMetrics = { onHoldCount: 2, qualifiedRate: 75 };

const ALL_CLEAR_ATT: AttendanceMetrics = { ...ATT, missingCheckout: 0 };
const ALL_CLEAR_WF: WorkflowMetrics = { pendingTotal: 0, byType: {}, overdueCount: 0 };
const ALL_CLEAR_COM: CommissionMetrics = { onHoldCount: 0, qualifiedRate: 90 };
const ALL_CLEAR_FIN: FinanceMetrics = { ...FIN, advancePending: 0 };
const ALL_CLEAR_HC: HeadcountMetrics = { active: 48, probation: 2, terminatedMtd: 2 };
const LEAVE_RESCHEDULE = { countMtd: 4, approvalRate: 75, topEmployees: [] };

describe('DashboardBuilderService', () => {
  const builder = new DashboardBuilderService();

  // ── morningBrief ──────────────────────────────────────────────────────────

  describe('morningBrief', () => {
    it('returns correctly computed notYetIn', () => {
      const p = builder.morningBrief(DATE, COMPANY, ATT);
      expect(p.notYetIn).toBe(10); // 50 - 40
    });

    it('carries attendance metrics through', () => {
      const p = builder.morningBrief(DATE, COMPANY, ATT);
      expect(p.totalExpected).toBe(50);
      expect(p.checkedIn).toBe(40);
      expect(p.lateCount).toBe(3);
      expect(p.checkInRate).toBe(80);
    });

    it('sets snapshotDate to YYYY-MM-DD format', () => {
      const p = builder.morningBrief(DATE, COMPANY, ATT);
      expect(p.snapshotDate).toBe('2024-06-01');
    });

    it('sets companyId and companyName from company row', () => {
      const p = builder.morningBrief(DATE, COMPANY, ATT);
      expect(p.companyId).toBe('co-001');
      expect(p.companyName).toBe('Test Company');
    });

    it('generatedAt is a valid ISO string', () => {
      const p = builder.morningBrief(DATE, COMPANY, ATT);
      expect(new Date(p.generatedAt).getTime()).not.toBeNaN();
    });

    it('notYetIn is 0 when all expected are checked in', () => {
      const fullAtt = { ...ATT, totalExpected: 40, checkedIn: 40 };
      const p = builder.morningBrief(DATE, COMPANY, fullAtt);
      expect(p.notYetIn).toBe(0);
    });

    it('handles 0 expected employees', () => {
      const emptyAtt: AttendanceMetrics = { ...ATT, totalExpected: 0, checkedIn: 0 };
      const p = builder.morningBrief(DATE, COMPANY, emptyAtt);
      expect(p.totalExpected).toBe(0);
      expect(p.notYetIn).toBe(0);
    });
  });

  // ── eveningBrief ──────────────────────────────────────────────────────────

  describe('eveningBrief', () => {
    it('maps missingCheckout, absentCount from attendance', () => {
      const p = builder.eveningBrief(DATE, COMPANY, ATT, WF);
      expect(p.missingCheckout).toBe(5);
      expect(p.absentCount).toBe(5);
    });

    it('maps pendingOtCount from wf.byType.overtime', () => {
      const p = builder.eveningBrief(DATE, COMPANY, ATT, WF);
      expect(p.pendingOtCount).toBe(3);
    });

    it('maps pendingApprovals from wf.pendingTotal', () => {
      const p = builder.eveningBrief(DATE, COMPANY, ATT, WF);
      expect(p.pendingApprovals).toBe(10);
    });

    it('maps pendingLeave from wf.byType.leave', () => {
      const p = builder.eveningBrief(DATE, COMPANY, ATT, WF);
      expect(p.pendingLeave).toBe(4);
    });

    it('pendingOtCount is 0 when no overtime in byType', () => {
      const wfNoOt: WorkflowMetrics = { ...WF, byType: { leave: 2 } };
      const p = builder.eveningBrief(DATE, COMPANY, ATT, wfNoOt);
      expect(p.pendingOtCount).toBe(0);
    });

    it('pendingLeave is 0 when no leave in byType', () => {
      const wfNoLeave: WorkflowMetrics = { ...WF, byType: { overtime: 2 } };
      const p = builder.eveningBrief(DATE, COMPANY, ATT, wfNoLeave);
      expect(p.pendingLeave).toBe(0);
    });
  });

  // ── companyDashboard ──────────────────────────────────────────────────────

  describe('companyDashboard', () => {
    it('includes all nested sections', () => {
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, PAY, FIN, HC, COM, PERIOD);
      expect(p.payroll).toBeDefined();
      expect(p.finance).toBeDefined();
      expect(p.commission).toBeDefined();
    });

    it('maps headcount fields', () => {
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, PAY, FIN, HC, COM, PERIOD);
      expect(p.headcountActive).toBe(48);
      expect(p.headcountProbation).toBe(5);
    });

    it('maps attendanceRate from checkInRate', () => {
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, PAY, FIN, HC, COM, PERIOD);
      expect(p.attendanceRate).toBe(80);
    });

    it('defaults cycleStatus to "none" when payroll cycleStatus is null', () => {
      const payNull: PayrollMetrics = { ...PAY, cycleStatus: null };
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, payNull, FIN, HC, COM, PERIOD);
      expect(p.payroll.cycleStatus).toBe('none');
    });

    it('maps finance section correctly', () => {
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, PAY, FIN, HC, COM, PERIOD);
      expect(p.finance.revenuePosted).toBe(1000000);
      expect(p.finance.expensePosted).toBe(700000);
      expect(p.finance.net).toBe(300000);
      expect(p.finance.advancePending).toBe(3);
    });

    it('maps commission section correctly', () => {
      const p = builder.companyDashboard(DATE, COMPANY, ATT, WF, PAY, FIN, HC, COM, PERIOD);
      expect(p.commission.onHoldCount).toBe(2);
      expect(p.commission.qualifiedRate).toBe(75);
    });
  });

  // ── ownerDashboard ────────────────────────────────────────────────────────

  describe('ownerDashboard', () => {
    const company2 = { id: 'co-002', name: 'Second Company' };
    const att2: AttendanceMetrics = { ...ATT, totalExpected: 30, checkedIn: 27, checkInRate: 90 };
    const wf2: WorkflowMetrics = { pendingTotal: 5, byType: { leave: 5 }, overdueCount: 0 };
    const fin2: FinanceMetrics = { revenuePosted: 500000, expensePosted: 300000, net: 200000, advancePending: 1 };
    const hc2: HeadcountMetrics = { active: 28, probation: 2, terminatedMtd: 0 };

    const perCompany = [
      { company: COMPANY, att: ATT,  wf: WF,  fin: FIN,  hc: HC },
      { company: company2, att: att2, wf: wf2, fin: fin2, hc: hc2 },
    ];

    it('companyId and companyName are null for cross-company snapshot', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.companyId).toBeNull();
      expect(p.companyName).toBeNull();
    });

    it('produces an entry per company', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.companies).toHaveLength(2);
    });

    it('totals headcount across companies', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.totals.headcount).toBe(48 + 28); // 76
    });

    it('totals pendingApprovals across companies', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.totals.pendingApprovals).toBe(10 + 5); // 15
    });

    it('totals revenuePosted with rounding', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.totals.revenuePosted).toBe(1500000);
    });

    it('totals net income across companies', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.totals.net).toBe(300000 + 200000); // 500000
    });

    it('handles single company', () => {
      const p = builder.ownerDashboard(DATE, [{ company: COMPANY, att: ATT, wf: WF, fin: FIN, hc: HC }], LEAVE_RESCHEDULE);
      expect(p.companies).toHaveLength(1);
      expect(p.totals.headcount).toBe(48);
    });

    it('handles empty companies array', () => {
      const p = builder.ownerDashboard(DATE, [], LEAVE_RESCHEDULE);
      expect(p.companies).toHaveLength(0);
      expect(p.totals.headcount).toBe(0);
      expect(p.totals.net).toBe(0);
    });

    it('maps attendanceRate per company correctly', () => {
      const p = builder.ownerDashboard(DATE, perCompany, LEAVE_RESCHEDULE);
      expect(p.companies[0]!.attendanceRate).toBe(80);
      expect(p.companies[1]!.attendanceRate).toBe(90);
    });
  });

  // ── executiveDashboard ────────────────────────────────────────────────────

  describe('executiveDashboard', () => {
    it('companyId and companyName are null', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.companyId).toBeNull();
      expect(p.companyName).toBeNull();
    });

    it('formats period start and end as YYYY-MM-DD', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.period.start).toBe('2024-05-25');
      expect(p.period.end).toBe('2024-06-23');
    });

    it('maps headcount section', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.headcount.active).toBe(48);
      expect(p.headcount.probation).toBe(5);
      expect(p.headcount.terminatedMtd).toBe(1);
    });

    it('maps attendance section (rate, late, absent)', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.attendance.rate).toBe(80);
      expect(p.attendance.late).toBe(3);
      expect(p.attendance.absent).toBe(5);
    });

    it('maps finance section with revenue/expenses naming', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.finance.revenue).toBe(1000000);
      expect(p.finance.expenses).toBe(700000);
      expect(p.finance.net).toBe(300000);
    });

    it('maps commission qualifiedRate and onHold', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.commission.qualifiedRate).toBe(75);
      expect(p.commission.onHold).toBe(2);
    });

    it('maps workflows with pending count and byType map', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, PAY, FIN, HC, COM, WF);
      expect(p.workflows.pending).toBe(10);
      expect(p.workflows.byType['leave']).toBe(4);
      expect(p.workflows.byType['overtime']).toBe(3);
    });

    it('defaults cycleStatus to "none" when null', () => {
      const p = builder.executiveDashboard(DATE, PERIOD, ATT, { ...PAY, cycleStatus: null }, FIN, HC, COM, WF);
      expect(p.payroll.cycleStatus).toBe('none');
    });
  });

  // ── riskDashboard ─────────────────────────────────────────────────────────

  describe('riskDashboard', () => {
    it('generates no alerts when everything is within safe thresholds', () => {
      const p = builder.riskDashboard(DATE, 'co-001', 'Test', ALL_CLEAR_ATT, ALL_CLEAR_WF, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      expect(p.alerts).toHaveLength(0);
    });

    it('generates high attendance alert when missingCheckout > 5', () => {
      const att6missing = { ...ATT, missingCheckout: 6 }; // 6 > 5 → triggers alert
      const p = builder.riskDashboard(DATE, null, null, att6missing, ALL_CLEAR_WF, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      const attAlert = p.alerts.find(a => a.category === 'attendance');
      expect(attAlert).toBeDefined();
      expect(attAlert!.severity).toBe('high');
      expect(attAlert!.count).toBe(6);
    });

    it('does NOT generate attendance alert when missingCheckout = 5 (not > 5)', () => {
      const att5 = { ...ATT, missingCheckout: 5 };
      const p = builder.riskDashboard(DATE, null, null, att5, ALL_CLEAR_WF, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      const attAlert = p.alerts.find(a => a.category === 'attendance');
      expect(attAlert).toBeUndefined();
    });

    it('generates medium approval alert when overdueCount > 0 but ≤ 10', () => {
      const wfOverdue: WorkflowMetrics = { ...WF, overdueCount: 5 };
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, wfOverdue, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      const alert = p.alerts.find(a => a.category === 'approval');
      expect(alert!.severity).toBe('medium');
    });

    it('generates HIGH approval alert when overdueCount > 10', () => {
      const wfVeryOverdue: WorkflowMetrics = { ...WF, overdueCount: 11 };
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, wfVeryOverdue, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      const alert = p.alerts.find(a => a.category === 'approval');
      expect(alert!.severity).toBe('high');
    });

    it('generates medium commission alert when onHoldCount > 0', () => {
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, ALL_CLEAR_WF, COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      const alert = p.alerts.find(a => a.category === 'commission');
      expect(alert!.severity).toBe('medium');
      expect(alert!.count).toBe(2);
    });

    it('generates low finance alert when advancePending > 0', () => {
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, ALL_CLEAR_WF, ALL_CLEAR_COM, ALL_CLEAR_HC, FIN);
      const alert = p.alerts.find(a => a.category === 'finance');
      expect(alert!.severity).toBe('low');
      expect(alert!.count).toBe(3);
    });

    it('generates medium headcount alert when terminatedMtd > 3', () => {
      const hcHighTerm: HeadcountMetrics = { ...HC, terminatedMtd: 4 };
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, ALL_CLEAR_WF, ALL_CLEAR_COM, hcHighTerm, ALL_CLEAR_FIN);
      const alert = p.alerts.find(a => a.category === 'headcount');
      expect(alert!.severity).toBe('medium');
    });

    it('does NOT generate headcount alert when terminatedMtd = 3 (not > 3)', () => {
      const hc3 = { ...HC, terminatedMtd: 3 };
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, ALL_CLEAR_WF, ALL_CLEAR_COM, hc3, ALL_CLEAR_FIN);
      const alert = p.alerts.find(a => a.category === 'headcount');
      expect(alert).toBeUndefined();
    });

    it('can generate all 5 alerts simultaneously when all thresholds exceeded', () => {
      const p = builder.riskDashboard(DATE, null, null, ATT, WF, COM, { ...HC, terminatedMtd: 5 }, FIN);
      expect(p.alerts.length).toBeGreaterThanOrEqual(4); // at least attendance, approval, commission, finance
    });

    it('populates metrics section regardless of alerts', () => {
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, ALL_CLEAR_WF, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      expect(p.metrics.missingCheckouts).toBe(0);
      expect(p.metrics.overdueApprovals).toBe(0);
      expect(p.metrics.commissionOnHold).toBe(0);
    });

    it('metrics.pendingOt reads from wf.byType.overtime', () => {
      const p = builder.riskDashboard(DATE, null, null, ALL_CLEAR_ATT, WF, ALL_CLEAR_COM, ALL_CLEAR_HC, ALL_CLEAR_FIN);
      expect(p.metrics.pendingOt).toBe(3);
    });
  });

  // ── pendingApprovalDashboard ───────────────────────────────────────────────

  describe('pendingApprovalDashboard', () => {
    const items = [
      { instanceId: 'wi-001', entityType: 'leave', initiatedBy: 'emp-001', companyId: 'co-001', currentStep: 1, pendingHours: 2 },
    ];

    it('maps total from wf.pendingTotal', () => {
      const p = builder.pendingApprovalDashboard(DATE, 'co-001', 'Test', WF, items);
      expect(p.total).toBe(10);
    });

    it('maps each byType from wf.byType', () => {
      const p = builder.pendingApprovalDashboard(DATE, 'co-001', 'Test', WF, items);
      expect(p.byType.leave).toBe(4);
      expect(p.byType.overtime).toBe(3);
      expect(p.byType.advance).toBe(2);
      expect(p.byType.depositRefund).toBe(1);
    });

    it('computes other as pendingTotal minus all known byType values', () => {
      const p = builder.pendingApprovalDashboard(DATE, 'co-001', 'Test', WF, items);
      // pendingTotal=10, sum of byType values=4+3+2+1=10, other=0
      expect(p.byType.other).toBe(0);
    });

    it('other is positive when pendingTotal > sum of known types', () => {
      const wfWithUnknown: WorkflowMetrics = {
        pendingTotal: 15,
        byType: { leave: 4, overtime: 3, advance: 2, deposit_refund: 1 }, // sum=10
        overdueCount: 0,
      };
      const p = builder.pendingApprovalDashboard(DATE, null, null, wfWithUnknown, []);
      expect(p.byType.other).toBe(5); // 15 - 10
    });

    it('maps overdueCount from wf.overdueCount', () => {
      const p = builder.pendingApprovalDashboard(DATE, 'co-001', 'Test', WF, items);
      expect(p.overdueCount).toBe(2);
    });

    it('passes items through unchanged', () => {
      const p = builder.pendingApprovalDashboard(DATE, 'co-001', 'Test', WF, items);
      expect(p.items).toEqual(items);
    });

    it('handles zero pendingTotal with empty byType', () => {
      const p = builder.pendingApprovalDashboard(DATE, null, null, ALL_CLEAR_WF, []);
      expect(p.total).toBe(0);
      expect(p.byType.other).toBe(0);
    });

    it('byType defaults to 0 for unrepresented types', () => {
      const wfLeaveOnly: WorkflowMetrics = { pendingTotal: 4, byType: { leave: 4 }, overdueCount: 0 };
      const p = builder.pendingApprovalDashboard(DATE, null, null, wfLeaveOnly, []);
      expect(p.byType.overtime).toBe(0);
      expect(p.byType.advance).toBe(0);
      expect(p.byType.depositRefund).toBe(0);
      expect(p.byType.payrollAdjustment).toBe(0);
      expect(p.byType.performanceReview).toBe(0);
    });
  });
});
