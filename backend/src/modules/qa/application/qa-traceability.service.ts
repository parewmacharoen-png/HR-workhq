// ============================================================================
// QA-003 Requirements Traceability & Business Rule Verification
// ============================================================================

import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';

export interface BusinessRule {
  id: string;
  category: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  owner: string;
  implemented: boolean;
  verified: boolean;
  evidenceLevel: string;
  risk: string;
  trace: {
    policy: string[];
    database: string[];
    backend: string[];
    api: string[];
    web: string[];
    telegram: string[];
    permission: string[];
    audit: string[];
    unitTest: string[];
    integrationTest: string[];
    uat: string;
  };
}

export interface RtmRow {
  requirementId: string;
  requirement: string;
  policySection: string;
  database: string;
  migration: string;
  entity: string;
  repository: string;
  service: string;
  controller: string;
  api: string;
  webScreen: string;
  telegramFlow: string;
  permission: string;
  audit: string;
  unitTest: string;
  integrationTest: string;
  uat: string;
  evidenceLevel: string;
  status: 'verified' | 'partial' | 'unverified' | 'gap';
}

export interface ModuleConfidence {
  module: string;
  policy: number;
  implementation: number;
  permission: number;
  audit: number;
  telegram: number;
  tests: number;
  evidence: number;
  uat: number;
  overall: number;
}

export interface OrphanItem {
  kind: 'rule_no_impl' | 'impl_no_test' | 'api_no_ui' | 'telegram_no_menu' | 'policy_gap';
  id: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface TraceabilityDashboard {
  generatedAt: string;
  businessRuleCoveragePercent: number;
  requirementCoveragePercent: number;
  policyCoveragePercent: number;
  productionConfidencePercent: number;
  enterpriseReady: boolean;
  goNoGo: 'go' | 'conditional' | 'no-go';
  criticalGaps: string[];
  rules: BusinessRule[];
  rtmSample: RtmRow[];
  moduleConfidence: ModuleConfidence[];
  orphans: OrphanItem[];
  unverifiedRules: string[];
  missingTests: string[];
}

function rule(
  id: string, category: string, description: string, priority: BusinessRule['priority'],
  implemented: boolean, verified: boolean, evidenceLevel: string,
  policy: string[], database: string[], backend: string[], api: string[], web: string[],
  telegram: string[], permission: string[], audit: string[], unitTest: string[], integrationTest: string[], uat: string,
): BusinessRule {
  const risk = priority === 'critical' ? 'critical' : priority === 'high' ? 'high' : 'medium';
  return {
    id, category, description, priority, owner: 'Owner', implemented, verified,
    evidenceLevel, risk,
    trace: { policy, database, backend, api, web, telegram, permission, audit, unitTest, integrationTest, uat },
  };
}

/** Curated business rules — sourced from WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md + MASTER_POLICY */
const BUSINESS_RULES: BusinessRule[] = [
  rule('ATT-001', 'Attendance', 'Daily check-in/out via Telegram and API', 'critical', true, true, 'E4',
    ['ATT-001'], ['attendance_records'], ['attendance.service.ts'], ['POST /attendance/check-in'], ['/attendance/daily'], ['attendance:menu'], ['attendance:write'], ['check_in'], ['attendance-rules.service.unit.spec.ts'], ['attendance.integration.spec.ts'], 'Pending'),
  rule('PAY-003', 'Payroll', 'Approved OT at configured hourly rate', 'critical', true, true, 'E4',
    ['PAY-003'], ['overtime_records'], ['attendance.service.ts'], ['POST /attendance/check-out'], ['/attendance/overtime'], ['request:menu'], ['attendance:write'], ['overtime_created'], ['attendance-rules.service.unit.spec.ts'], ['ot-workflow.integration.spec.ts'], 'Pending'),
  rule('PAY-005b', 'Payroll', 'Final payroll settlement on exit', 'critical', true, true, 'E4',
    ['PAY-005b'], ['final_payroll_settlements'], ['final-settlement.service.ts'], ['POST /exit/final-settlements'], ['/me/final-settlement'], ['unified:inbox'], ['payroll:write'], ['final_settlement_*'], [], ['final-settlement-pay005c.integration.spec.ts'], 'Pending'),
  rule('PAY-005', 'Payroll', 'Advance pay Owner approval', 'critical', true, false, 'E3',
    ['PAY-005'], ['advance_pay_records'], ['request-integration.service.ts'], ['POST /requests'], ['/requests'], ['unified:inbox'], ['payroll:write'], ['request_approved'], [], [], 'Pending'),
  rule('PAY-002', 'Payroll', 'Leave bonus formula min(2,4-used)×600', 'high', true, true, 'E4',
    ['PAY-002'], ['payroll_items'], ['leave-bonus.service.ts'], ['POST /payroll/cycles/:id/build'], ['/payroll/cycles/:id'], ['N/A'], ['payroll:write'], ['payroll_build'], ['leave-bonus.service.unit.spec.ts'], ['payroll-leave-bonus.integration.spec.ts'], 'Pending'),
  rule('ABS-002', 'Attendance', 'Role-based absence penalty amounts', 'high', true, true, 'E4',
    ['ABS-002'], ['absence_records'], ['absence-record.service.ts'], ['POST /attendance/absences/:id/approve'], ['/attendance/absences'], ['N/A'], ['attendance:write'], ['approve_absence'], ['absence-penalty.service.unit.spec.ts'], ['absence-record.integration.spec.ts'], 'Pending'),
  rule('LV-001', 'Leave', 'Leave request with approval workflow', 'critical', true, true, 'E4',
    ['LV-001'], ['leave_requests'], ['leave.service.ts'], ['POST /leave/employees/:id/requests'], ['/leave/requests'], ['leave:menu'], ['leave:write'], ['leave_request_*'], [], ['leave-workflow.integration.spec.ts'], 'Pending'),
  rule('LR-001', 'Leave', 'Leave reschedule workflow', 'high', true, true, 'E4',
    ['LR-001'], ['leave_requests'], ['leave-reschedule.service.ts'], ['POST /leave/reschedule'], ['/leave/reschedule'], ['leave_reschedule:*'], ['leave:write'], ['leave_reschedule'], [], ['leave-reschedule-workflow.integration.spec.ts'], 'Pending'),
  rule('SEC-001', 'Security', 'Employee access audit on sensitive reads', 'critical', true, true, 'E4',
    ['SEC-001'], ['audit_logs'], ['employee-access.service.ts'], ['GET /employees/:id'], ['/hr/employees/:id'], ['employee:profile'], ['employee:read'], ['employee_read'], ['employee-access.service.unit.spec.ts'], ['employee-access-audit.integration.spec.ts'], 'Pending'),
  rule('REQ-005b', 'Workflow', 'Unified Telegram approval inbox', 'critical', true, true, 'E4',
    ['REQ-005b'], ['workflow_instances'], ['unified-approval-inbox.handler.ts'], ['GET /workflow/inbox'], ['/approvals'], ['unified:inbox'], ['workflow:read'], ['workflow_action'], [], ['approval-inbox.integration.spec.ts'], 'Pending'),
  rule('REC-002', 'Referral', 'Referral bonus after probation', 'high', true, false, 'E4',
    ['REC-002'], ['employee_referrals'], ['employee-referral.service.ts'], ['POST /employee-referrals'], ['/hr/referrals'], ['referral:my:list'], ['referral:pay'], ['referral_*'], [], ['referral.integration.spec.ts'], 'Pending'),
  rule('EMP-010', 'Probation', 'Probation review PASS/EXTEND/FAIL', 'high', true, true, 'E4',
    ['EMP-010'], ['probation_reviews'], ['performance.service.ts'], ['POST /performance/probation'], ['/hr/performance/reviews'], ['probation:pass:*'], ['performance:write'], ['probation_*'], ['performance.service.probation.unit.spec.ts'], ['probation-review.integration.spec.ts'], 'Pending'),
  rule('EMP-012', 'Exit', 'Exit case checklist and approval', 'critical', true, true, 'E4',
    ['EMP-012'], ['employee_exit_cases'], ['exit-case.service.ts'], ['POST /exit/cases'], ['/hr/exit/:id'], ['unified:inbox'], ['employee:write'], ['exit_*'], ['exit-case.service.unit.spec.ts'], ['employee-exit-deposit.integration.spec.ts'], 'Pending'),
  rule('SAL-001', 'Compensation', 'Salary review workflow', 'critical', true, true, 'E4',
    ['SAL-001'], ['salary_reviews'], ['compensation-review.service.ts'], ['POST /compensation-reviews'], ['/hr/compensation-reviews'], ['unified:inbox'], ['payroll:write'], ['salary_review_*'], [], ['compensation-review.integration.spec.ts'], 'Pending'),
  rule('KPI-003', 'Performance', 'Weighted performance score', 'high', true, false, 'E3',
    ['KPI-003'], ['performance_reviews'], ['performance-review.service.ts'], ['PATCH /performance-reviews/:id/scores'], ['/hr/performance/reviews/:id'], ['performance:my'], ['performance:score'], ['scores_updated'], ['performance-score.service.unit.spec.ts'], [], 'Pending'),
  rule('ATT-010', 'Attendance', 'Attendance alert engine + escalation', 'high', true, true, 'E3',
    ['ATT-010'], ['attendance_reminders'], ['attendance-alert.service.ts'], ['GET /attendance/alerts'], ['/attendance/daily'], ['attendance:alerts'], ['attendance:read'], ['attendance_alert'], ['attendance-alert.scheduler.unit.spec.ts'], [], 'Pending'),
  rule('DOC-001', 'Documents', 'Document center upload/download', 'medium', true, false, 'E3',
    ['DOC-001'], ['employee_documents'], ['document-center.service.ts'], ['GET /documents/my'], ['/documents/my'], ['document-center:my'], ['document:read'], ['document_*'], ['document-center.service.unit.spec.ts'], [], 'Pending'),
  rule('ANN-001', 'Announcement', 'Publish + acknowledge tracking', 'medium', true, false, 'E3',
    ['ANN-001'], ['announcements'], ['announcement.service.ts'], ['POST /announcements'], ['/announcements'], ['announcement:list'], ['employee:read'], ['announcement_*'], ['announcement.service.unit.spec.ts'], [], 'Pending'),
  rule('REF-001', 'Referral', '90-day eligibility discretion', 'medium', true, false, 'E3',
    ['REF-001'], ['referral_programs'], ['employee-referral.service.ts'], ['GET /employee-referrals'], ['/hr/referrals'], ['referral:candidate:menu'], ['referral:qualify'], ['referral_*'], [], ['referral.integration.spec.ts'], 'Pending'),
  rule('PAY-003a', 'Payroll', 'Missed meal/break OT item ฿50/hr', 'high', false, false, 'E0',
    ['PAY-003a'], [], [], [], [], [], [], [], [], [], 'N/A'),
  rule('AC-013', 'Disciplinary', 'LEGAL_REVIEW_REQUIRED flag', 'medium', false, false, 'E0',
    ['AC-013'], [], [], [], [], [], [], [], [], [], 'N/A'),
  rule('FORM-001', 'Formula', 'attendance.late_deduction with fallback', 'high', true, false, 'E3',
    ['RULE-001'], ['formula_definitions'], ['formula-resolver.service.ts'], ['POST /formulas/:id/execute'], ['/admin/formulas'], ['N/A'], ['settings:write'], ['FormulaExecutionLog'], ['formula-resolver.service.unit.spec.ts'], [], 'Pending'),
];

const MODULE_CONFIDENCE: ModuleConfidence[] = [
  { module: 'Attendance', policy: 85, implementation: 100, permission: 100, audit: 100, telegram: 95, tests: 90, evidence: 85, uat: 0, overall: 82 },
  { module: 'Leave', policy: 90, implementation: 95, permission: 100, audit: 100, telegram: 90, tests: 95, evidence: 90, uat: 0, overall: 83 },
  { module: 'Payroll', policy: 75, implementation: 85, permission: 100, audit: 95, telegram: 70, tests: 90, evidence: 85, uat: 0, overall: 75 },
  { module: 'Exit', policy: 95, implementation: 90, permission: 100, audit: 100, telegram: 85, tests: 85, evidence: 80, uat: 0, overall: 79 },
  { module: 'Permission', policy: 100, implementation: 100, permission: 100, audit: 100, telegram: 80, tests: 95, evidence: 90, uat: 0, overall: 83 },
  { module: 'Workflow', policy: 90, implementation: 95, permission: 100, audit: 100, telegram: 90, tests: 90, evidence: 85, uat: 0, overall: 81 },
  { module: 'AI', policy: 70, implementation: 80, permission: 85, audit: 90, telegram: 75, tests: 70, evidence: 65, uat: 0, overall: 67 },
  { module: 'Competency', policy: 60, implementation: 70, permission: 90, audit: 80, telegram: 70, tests: 0, evidence: 50, uat: 0, overall: 53 },
  { module: 'Formula', policy: 80, implementation: 75, permission: 90, audit: 100, telegram: 0, tests: 80, evidence: 75, uat: 0, overall: 63 },
];

@Injectable()
export class QaTraceabilityService {
  getDashboard(): TraceabilityDashboard {
    const rules = this.getRules();
    const implemented = rules.filter((r) => r.implemented).length;
    const verified = rules.filter((r) => r.verified).length;
    const withE4 = rules.filter((r) => ['E4', 'E5', 'E6'].includes(r.evidenceLevel)).length;
    const criticalMoney = rules.filter((r) => r.priority === 'critical');
    const criticalUatMissing = criticalMoney.filter((r) => r.trace.uat === 'Pending' || r.trace.uat === 'N/A');

    const businessRuleCoveragePercent = Math.round((implemented / rules.length) * 100);
    const requirementCoveragePercent = Math.round((verified / rules.length) * 100);
    const policyCoveragePercent = Math.round((withE4 / rules.length) * 100);
    const productionConfidencePercent = Math.round(
      MODULE_CONFIDENCE.reduce((s, m) => s + m.overall, 0) / MODULE_CONFIDENCE.length,
    );

    const orphans = this.detectOrphans(rules);
    const unverifiedRules = rules.filter((r) => !r.verified).map((r) => r.id);
    const missingTests = rules.filter((r) => !r.trace.integrationTest.length && !r.trace.unitTest.length).map((r) => r.id);

    const enterpriseReady = false;
    const goNoGo: TraceabilityDashboard['goNoGo'] =
      criticalUatMissing.length > 0 ? 'no-go' : productionConfidencePercent >= 75 ? 'conditional' : 'no-go';

    return {
      generatedAt: new Date().toISOString(),
      businessRuleCoveragePercent,
      requirementCoveragePercent,
      policyCoveragePercent,
      productionConfidencePercent,
      enterpriseReady,
      goNoGo,
      criticalGaps: [
        ...criticalUatMissing.map((r) => `${r.id}: missing E5 UAT`),
        'Enterprise acceptance requires 100% critical permission verification + payroll E5',
        'PAY-003a missed meal/break — not implemented',
        'Knowledge Graph salary redaction — partial evidence',
      ],
      rules,
      rtmSample: this.buildRtmSample(),
      moduleConfidence: MODULE_CONFIDENCE,
      orphans,
      unverifiedRules,
      missingTests,
    };
  }

  getRules(): BusinessRule[] {
    return BUSINESS_RULES.map((r) => ({
      ...r,
      verified: r.verified && this.filesExist([...r.trace.backend, ...r.trace.integrationTest]),
    }));
  }

  getRulesByModule(module: string): BusinessRule[] {
    return this.getRules().filter((r) => r.category.toLowerCase() === module.toLowerCase());
  }

  getOrphans(): OrphanItem[] {
    return this.detectOrphans(this.getRules());
  }

  getModuleConfidence(): ModuleConfidence[] {
    return MODULE_CONFIDENCE;
  }

  private detectOrphans(rules: BusinessRule[]): OrphanItem[] {
    const orphans: OrphanItem[] = [];
    for (const r of rules) {
      if (!r.implemented) {
        orphans.push({ kind: 'rule_no_impl', id: r.id, description: r.description, severity: r.priority });
      }
      if (r.implemented && !r.trace.integrationTest.length && !r.trace.unitTest.length) {
        orphans.push({ kind: 'impl_no_test', id: r.id, description: `${r.id} has no automated test`, severity: 'high' });
      }
      if (r.implemented && r.trace.api.length && r.trace.web[0] === 'N/A') {
        orphans.push({ kind: 'api_no_ui', id: r.id, description: `${r.id} API without web screen`, severity: 'low' });
      }
    }
    orphans.push(
      { kind: 'policy_gap', id: 'PAY-003a', description: 'Policy requires missed meal/break payroll item — no implementation', severity: 'high' },
      { kind: 'policy_gap', id: 'AC-013', description: 'LEGAL_REVIEW_REQUIRED disciplinary flag — not implemented', severity: 'medium' },
      { kind: 'policy_gap', id: 'EMP-002', description: 'Department enum in employee schema — policy only', severity: 'low' },
    );
    return orphans;
  }

  private buildRtmSample(): RtmRow[] {
    return BUSINESS_RULES.slice(0, 12).map((r) => ({
      requirementId: r.id,
      requirement: r.description,
      policySection: r.trace.policy[0] ?? r.id,
      database: r.trace.database.join(', ') || '—',
      migration: 'prisma/migrations/*',
      entity: r.trace.database[0] ?? '—',
      repository: r.trace.backend[0]?.replace('.service.ts', '.prisma.repository.ts') ?? '—',
      service: r.trace.backend[0] ?? '—',
      controller: r.trace.backend[0]?.replace('.service.ts', '.controller.ts') ?? '—',
      api: r.trace.api[0] ?? '—',
      webScreen: r.trace.web[0] ?? '—',
      telegramFlow: r.trace.telegram[0] ?? '—',
      permission: r.trace.permission[0] ?? '—',
      audit: r.trace.audit[0] ?? '—',
      unitTest: r.trace.unitTest[0] ?? '—',
      integrationTest: r.trace.integrationTest[0] ?? '—',
      uat: r.trace.uat,
      evidenceLevel: r.evidenceLevel,
      status: r.verified ? 'verified' : r.implemented ? 'partial' : 'gap',
    }));
  }

  private filesExist(paths: string[]): boolean {
    if (!paths.length) return false;
    const backendRoot = process.cwd();
    const root = join(backendRoot, '..');
    return paths.some((p) =>
      existsSync(join(backendRoot, 'src/modules', p)) ||
      existsSync(join(backendRoot, p)) ||
      existsSync(join(root, p)) ||
      existsSync(join(backendRoot, 'test/integration', p)),
    );
  }
}
