// ============================================================================
// modules/ai/domain/tools/tool-definitions.ts
// HR Copilot read-only tools — employee, leader, and owner tiers.
// ============================================================================

import { AiToolDefinition } from '../tool.types';

const emptyObjectSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;

const companyIdSchema = {
  type: 'object',
  properties: {
    companyId: {
      type: 'string',
      description: 'Company UUID. Optional when the user belongs to a single company.',
    },
  },
  additionalProperties: false,
} as const;

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: 'get_employee_profile',
    tier: 'employee',
    permission: 'employee:read',
    description: 'Get the current user employee profile (name, global ID, company, team, role, hire date, status).',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_leave_balance',
    tier: 'employee',
    permission: 'leave:read',
    description: 'Get the current user leave balances (entitled, used, remaining) for active leave types.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_attendance_summary',
    tier: 'employee',
    permission: 'attendance:read',
    description: 'Get today attendance and month-to-date summary (check-ins, late days, late minutes) for the current user.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_latest_payslip',
    tier: 'employee',
    permission: 'payroll:read',
    description: 'Get the latest payslip for the current user (gross, deductions, net, pay period).',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_commission_summary',
    tier: 'employee',
    permission: 'commission:read',
    description: 'Get commission summary for the current user in the current payroll cycle (pending, qualified, hold amounts).',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_referral_summary',
    tier: 'employee',
    permission: 'referral:read',
    description: 'Get referral program summary for the current user (pending, qualified, paid counts and reward amounts).',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_profile',
    tier: 'employee',
    permission: 'employee:read',
    description: 'Get my employee profile (code, company, team, position, start date). Self only — no salary or bank data.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_leave_balance',
    tier: 'employee',
    permission: 'leave:read',
    description: 'Get my remaining leave balance (annual, emergency, unpaid used). Use for "ผมเหลือวันลากี่วัน". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_leave_history',
    tier: 'employee',
    permission: 'leave:read',
    description: 'Get my last 20 leave requests with type, dates, and status. Use for "ผมลาวันไหนบ้าง". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_attendance_summary',
    tier: 'employee',
    permission: 'attendance:read',
    description: 'Get my attendance summary for the current month (working days, present, absent, check-ins/outs). Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_late_statistics',
    tier: 'employee',
    permission: 'attendance:read',
    description: 'Get my late arrival statistics for the current month. Use for "เดือนนี้ผมมาสายกี่ครั้ง". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_ot_summary',
    tier: 'employee',
    permission: 'attendance:read',
    description: 'Get my overtime summary for the current month (pending, approved, paid OT hours). Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_latest_payslip',
    tier: 'employee',
    permission: 'payroll:read',
    description: 'Get my latest payslip (period, gross, deductions, net). Use for "สลิปล่าสุดของผม". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_payroll_summary',
    tier: 'employee',
    permission: 'payroll:read',
    description: 'Get my payroll summary for the last 12 months (total income, deductions, average monthly pay). Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_commission',
    tier: 'employee',
    permission: 'commission:read',
    description: 'Get my current commission (marketing, admin, recruitment, pending, hold, payable). Use for "ค่าคอมเดือนนี้". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_commission_history',
    tier: 'employee',
    permission: 'commission:read',
    description: 'Get my commission history for the last 12 months. Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_referrals',
    tier: 'employee',
    permission: 'referral:read',
    description: 'Get my referral rewards (pending, qualified, paid, total amount). Use for "ผมมี Referral ค้างอยู่ไหม". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_my_marketing_kpi',
    tier: 'employee',
    permission: 'marketing:read',
    description: 'Get my marketing KPI from daily reports (started work count, target, remaining, conversion, contacted totals). Use for "ผมได้เด็กลงงานกี่คนแล้ว" or "ยอดทักเด็กเดือนนี้". Self only.',
    inputSchema: {
      type: 'object',
      properties: {
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_latest_marketing_report',
    tier: 'employee',
    permission: 'marketing:read',
    description: 'Get my most recent marketing daily report with status and submitted time. Use for "รายงานล่าสุดของผมเป็นสถานะอะไร". Self only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_team_marketing_kpi',
    tier: 'leader',
    permission: 'marketing:read',
    description: 'Get team marketing KPI from daily reports with risk levels. Leader scope only. Use for "ทีมผมใครเสี่ยงไม่ผ่าน KPI".',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team UUID. Optional when leader has one team.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_company_marketing_kpi',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Get company-wide marketing KPI totals from approved/submitted daily reports. Use for "เดือนนี้การตลาดรวมได้เด็กลงงานกี่คน".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID. Optional for single-company owners.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_report_audit',
    tier: 'owner',
    permission: 'marketing:audit',
    description: 'Get audit history for a marketing daily report including who changed fields and how many edits occurred. Use for "ใครแก้ยอดของเมฆเมื่อวาน" or "รายงานนี้ถูกแก้กี่ครั้ง". Owner/admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: { type: 'string', description: 'Marketing daily report UUID.' },
      },
      required: ['reportId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_marketing_expenses',
    tier: 'employee',
    permission: 'marketing:read',
    description: 'Get my marketing expenses and summary for the current earn cycle. Use for "ผมใช้เงินการตลาดเท่าไร". Self only.',
    inputSchema: {
      type: 'object',
      properties: {
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_team_marketing_expenses',
    tier: 'leader',
    permission: 'marketing:read',
    description: 'Get team marketing expense summary with cost per contact/member/started work. Use for "ทีมผมใช้เงินไปเท่าไร".',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team UUID. Optional when leader has one team.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_company_marketing_expenses',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Get company-wide approved marketing expense totals and category breakdown. Use for "ค่าโฆษณาเดือนนี้เท่าไร".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID. Optional for single-company owners.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_roi',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Get marketing ROI metrics (deposit ROI, cost per started work) and team rankings. Use for "ทีมไหน ROI ดีที่สุด" or "ค่าใช้จ่ายต่อเด็กลงงานเท่าไร".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID. Optional for single-company owners.' },
        teamId: { type: 'string', description: 'Optional team UUID for team-scoped ROI.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_performance_insights',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Get marketing performance insights: top/bottom teams, top employees, failed/at-risk KPI employees, expense and ROI summary, anomalies, recommendations. Use for "ทีมไหน ROI ดีสุด", "ใครเสี่ยงไม่ผ่าน KPI", or "วันนี้การตลาดเป็นยังไง".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID. Optional for single-company owners.' },
        earnCycleId: { type: 'string', description: 'Optional payroll earn cycle UUID.' },
        teamId: { type: 'string', description: 'Optional marketing team UUID for team-scoped insights.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_risk_alerts',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Get marketing risk alerts: high expense, low conversion, KPI risk, carry forward risk, commission adjustment risk. Use for "ทีมไหนใช้เงินเยอะผิดปกติ" or "มี carry forward risk เท่าไร".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Optional earn cycle UUID.' },
        teamId: { type: 'string', description: 'Optional team UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_forecast',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Forecast projected started work, expenses, commission pool, carry forward, and net profit for the current marketing cycle. Use for "เดือนนี้คาดว่าจะจ่ายค่าคอมเท่าไร" or "ค่าใช้จ่ายเดือนนี้สูงไหม".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Optional earn cycle UUID.' },
        teamId: { type: 'string', description: 'Optional team UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_marketing_team_comparison',
    tier: 'owner',
    permission: 'marketing:read',
    description: 'Compare marketing teams by KPI counts, expenses, cost per started work, ROI, and KPI success rate. Use for "ทีมไหน conversion ต่ำ" or "ทีมไหนแย่สุด".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Optional earn cycle UUID.' },
        teamId: { type: 'string', description: 'Optional team UUID to compare within scope.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_team_attendance',
    tier: 'leader',
    permission: 'attendance:read',
    description: 'Get team attendance summary for today including late arrivals and missing check-ins. Leader scope only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_team_leave_requests',
    tier: 'leader',
    permission: 'leave:read',
    description: 'List pending leave requests from team members. Leader scope only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_team_ot_requests',
    tier: 'leader',
    permission: 'attendance:read',
    description: 'List pending overtime (OT) requests from team members. Leader scope only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_team_performance_summary',
    tier: 'leader',
    permission: 'performance:read',
    description: 'Get team performance evaluation summary for the open performance cycle. Leader scope only.',
    inputSchema: emptyObjectSchema,
  },
  {
    name: 'get_company_dashboard',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get company owner dashboard summary (headcount, pending approvals, revenue, expenses, net).',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_finance_summary',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get owner finance summary (revenue posted, expenses posted, net) for one company or all companies.',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_payroll_summary',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get executive payroll summary (total gross, total net, cycle status).',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_recruitment_summary',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get recruitment pipeline summary (total candidates, unique counted, counts by stage).',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_risk_summary',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get company risk dashboard alerts (attendance, workflow backlog, finance, commission hold, headcount). Use for "มีความเสี่ยงอะไรบ้าง".',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_executive_summary',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get today executive summary combining finance, payroll, attendance, recruitment, performance, and reporting KPIs. Use for "สรุปบริษัทวันนี้" or overall business health.',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_executive_risks',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get company-wide executive risk alerts across attendance, workflows, commission hold, and marketing KPI. Use for "มีอะไรน่ากังวลไหม".',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_executive_forecast',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get executive forecast for net profit, payroll, commission payout, and marketing expense. Use for "เดือนนี้กำไรน่าจะเป็นเท่าไร" or "ค่าคอมจะจ่ายเท่าไร".',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_executive_recommendations',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Get executive opportunities and recommendations including top/bottom team performance. Use for "ทีมไหนผลงานดีที่สุด" or "ทีมไหนควรปรับปรุง".',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_commission_dashboard',
    tier: 'owner',
    permission: 'reporting:read',
    description: 'Get unified commission executive dashboard (marketing, admin, referral, recruitment totals, hold, paid, top earners). Use for commission expense and top earner questions.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'string',
          description: 'Company UUID. Optional for platform owners viewing all companies.',
        },
        earnCycleId: {
          type: 'string',
          description: 'Optional payroll earn cycle UUID.',
        },
        comparePreviousMonth: {
          type: 'boolean',
          description: 'Include previous month executive summary comparison.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_commission_cycle_status',
    tier: 'owner',
    permission: 'commission:read',
    description: 'Get commission finalization workflow status for a cycle. Use for "รอบค่าคอมเดือนนี้สถานะอะไร".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Payroll earn cycle UUID.' },
        type: {
          type: 'string',
          enum: ['marketing', 'admin', 'referral', 'recruitment'],
          description: 'Commission type filter.',
        },
        cycleId: { type: 'string', description: 'Optional unified commission cycle UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_commission_preview',
    tier: 'owner',
    permission: 'commission:read',
    description: 'Preview commission payout totals, recipients, carry forward, and recovery before finalize. Use for "ถ้าวันนี้ finalize จะจ่ายเท่าไร" or "มีใครได้ carry forward บ้าง".',
    inputSchema: {
      type: 'object',
      properties: {
        cycleId: { type: 'string', description: 'Unified commission cycle UUID.' },
        companyId: { type: 'string', description: 'Company UUID when resolving by earn cycle.' },
        earnCycleId: { type: 'string', description: 'Earn cycle UUID when resolving batch cycle.' },
        type: {
          type: 'string',
          enum: ['marketing', 'admin', 'referral', 'recruitment'],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_commission_adjustments',
    tier: 'owner',
    permission: 'commission:read',
    description: 'List commission adjustment requests for a company or earn cycle. Use for "มีการปรับค่าคอมเดือนนี้ไหม" or "ใครถูกปรับค่าคอมบ้าง".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Optional earn cycle UUID.' },
        employeeId: { type: 'string', description: 'Optional employee UUID filter.' },
        type: {
          type: 'string',
          enum: ['marketing', 'admin', 'referral', 'recruitment'],
        },
        status: {
          type: 'string',
          enum: ['draft', 'submitted', 'approved', 'rejected', 'applied'],
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_commission_adjustment_history',
    tier: 'owner',
    permission: 'commission:read',
    description: 'Get applied commission adjustment entries (net impact per employee). Use for "ยอดปรับรวมเท่าไร" or audit history.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'Company UUID.' },
        earnCycleId: { type: 'string', description: 'Optional earn cycle UUID.' },
        employeeId: { type: 'string', description: 'Optional employee UUID filter.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_company_profit_ranking',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Rank companies by net profit (and revenue/expense) for the current period. Use for "บริษัทไหนกำไรดีที่สุด".',
    inputSchema: companyIdSchema,
  },
  {
    name: 'get_team_performance_rankings',
    tier: 'owner',
    permission: 'reporting:owner',
    description: 'Rank teams by average performance evaluation score in the open cycle; highlights underperforming teams. Use for "ทีมไหนผลงานตก".',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'string',
          description: 'Company UUID. Optional — omit for all companies.',
        },
        bottomN: {
          type: 'number',
          description: 'Number of lowest-ranked teams to return (default 5).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_company_knowledge',
    tier: 'employee',
    permission: 'ai:chat',
    description: 'Search published company knowledge base articles for HR policies (leave, OT, commission, etc.). Use when policy excerpts in context are insufficient.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in Thai or English describing the policy question.',
        },
        companyId: {
          type: 'string',
          description: 'Company UUID. Optional when the user belongs to a single company.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];
