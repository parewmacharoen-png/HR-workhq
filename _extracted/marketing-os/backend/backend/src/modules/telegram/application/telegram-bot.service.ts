// ============================================================================
// modules/telegram/application/telegram-bot.service.ts
// Entry point for all inbound Telegram updates (webhook or long-poll).
// Resolves the linked WorkHQ user from telegram_user_id, loads/creates the
// session, and dispatches to the right state handler.
//
// Session persistence: every session is stored in telegram.telegram_sessions.
// State (FSM state string) and context (JSONB) survive restarts.
// OnModuleInit registers the webhook URL with Telegram if BOT_TOKEN is set.
// ============================================================================

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import {
  TelegramState, SessionContext,
} from '../domain/entities/telegram-session.types';
import { AttendanceService } from '../../attendance/application/attendance.service';
import { LeaveService } from '../../leave/application/leave.service';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { WorkflowApproverService } from '../../workflow/application/workflow-approver.service';
import { ReportingService } from '../../reporting/application/reporting.service';
import { ExecutiveDailyBriefService } from '../../reporting/application/executive-daily-brief.service';
import { TelegramMessageLogService } from './telegram-message-log.service';
import { CompanyCodeCacheService } from './company-code-cache.service';
import { AuthService } from '../../../auth/auth.service';
import {
  GLOBAL_ID_SEQUENCE,
  GlobalIdSequence,
} from '../../employee/domain/services/global-id.service';
import { EmployeeGlobalId } from '../../employee/domain/value-objects/employee-global-id.vo';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  formatAnnouncementMessage,
  formatCommissionSummary,
  formatCompanySummary,
  formatEveningReport,
  formatMorningReport,
  formatOwnerCompanySummary,
  formatOwnerFinanceSummary,
  formatOwnerPayrollSummary,
  formatOwnerRecruitmentSummary,
  formatOwnerCommissionSummary,
  formatExecutiveBriefSection,
  formatPayslip,
  formatPayslipHistory,
  formatPersonalDailyReport,
  formatReferralStatus,
  formatTeamAttendanceDashboard,
  formatMyMarketingKpi,
  formatMarketingDailyReportSummary,
  formatMyLatestMarketingReport,
  formatMarketingExpenseSummary,
} from '../domain/telegram-report.formatter';
import type {
  CompanyDashboardPayload,
  EveningBriefPayload,
  ExecutiveDashboardPayload,
  MorningBriefPayload,
  OwnerDashboardPayload,
} from '../../reporting/domain/entities/dashboard-payloads';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AiAssistantService } from '../../ai/application/ai-assistant.service';
import { AiConversationService } from '../../ai/application/ai-conversation.service';
import { AiChannel } from '@prisma/client';
import { MarketingDailyReportService } from '../../marketing/application/marketing-daily-report.service';
import { MarketingKpiQueryService } from '../../marketing/application/marketing-kpi-query.service';
import { MarketingBackOfficeService } from '../../marketing/application/marketing-backoffice.service';
import { MarketingExpenseService } from '../../marketing/application/marketing-expense.service';
import { MarketingTeamService } from '../../marketing/application/marketing-team.service';
import { CommissionFinalizationService } from '../../commission/application/commission-finalization.service';
import { CommissionAdjustmentService } from '../../commission/application/commission-adjustment.service';
import { TelegramOnboardingService } from './telegram-onboarding.service';
import { TelegramDeclarationCorrectionService } from './telegram-declaration-correction.service';

const EMPLOYEE_PERMISSION_KEYS = [
  'attendance:read', 'attendance:write', 'leave:read', 'leave:write', 'ai:chat',
] as const;

const MENU_CLOSE = { label: '❌ ปิด', state: 'menu:close' } as const;

interface OnboardingDraft extends Record<string, unknown> {
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyCode?: string;
}

interface LeaveDraft extends Record<string, unknown> {
  leaveTypeCode?: string;
  leaveTypeName?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason?: string;
}

interface AiChatDraft extends Record<string, unknown> {
  aiConversationId?: string;
}

interface LeaveRescheduleDraft extends Record<string, unknown> {
  leaveRequestId?: string;
  originalStartDate?: string;
  originalEndDate?: string;
  originalDays?: number;
  newStartDate?: string;
  newEndDate?: string;
  reason?: string;
  isEmergency?: boolean;
}

interface LeaveShiftSwapDraft extends Record<string, unknown> {
  requesterLeaveRequestId?: string;
  partnerLeaveRequestId?: string;
}

interface MarketingReportDraft extends Record<string, unknown> {
  reportDate?: string;
  contactedCount?: number;
  newMemberCount?: number;
  depositAmount?: number;
  startedWorkCount?: number;
  reportId?: string;
  companyId?: string;
}

interface MarketingExpenseDraft extends Record<string, unknown> {
  companyId?: string;
  category?: string;
  amount?: number;
  description?: string;
  expenseId?: string;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  advertising: 'โฆษณา',
  deposit: 'ฝาก',
  worker_payment: 'จ่ายคนงาน',
  worker_bonus: 'โบนัสคนงาน',
  team_operation: 'ดำเนินงานทีม',
  shared_expense: 'ค่าใช้จ่ายร่วม',
  line_oa: 'Line OA',
  telesales: 'Telesales',
  promotion: 'โปรโมชั่น',
  other: 'อื่นๆ',
};

const MENU_ROOT_EMPLOYEE_TH = [
  { label: '📋 การเข้างาน', state: 'attendance:confirming_checkin' },
  { label: '🌴 การลา', state: 'leave:menu' },
  { label: '💰 เงินเดือน', state: 'payroll:view_payslip' },
  { label: '📊 ค่าคอมมิชชั่น', state: 'commission:view_summary' },
  { label: '📊 ส่งยอดการตลาด', state: 'marketing:submit' },
  { label: '📋 รายงานล่าสุดของฉัน', state: 'marketing:latest_report' },
  { label: '📈 KPI ของฉัน', state: 'marketing:my_kpi' },
  { label: '💸 บันทึกรายจ่ายการตลาด', state: 'marketing:expense_submit' },
  { label: '🤝 แนะนำเพื่อน', state: 'referral:status' },
  { label: '🤖 ผู้ช่วย AI', state: 'ai:chatting' },
] as const;

const MENU_ROOT_LEADER_TH = [
  { label: '✅ อนุมัติการลา', state: 'approvals:leave' },
  { label: '⏰ อนุมัติ OT', state: 'approvals:ot' },
  { label: '👥 แดชบอร์ดทีม', state: 'leader:team_dashboard' },
  { label: '📈 KPI ทีม', state: 'marketing:team_kpi' },
  { label: '💰 สรุปรายจ่ายทีม', state: 'marketing:team_expenses' },
] as const;

const MENU_ROOT_BIG_LEADER_TH = [
  { label: '📊 ภาพรวมการตลาด', state: 'marketing:company_overview' },
] as const;

const MENU_ROOT_OWNER_TH = [
  { label: '👑 แดชบอร์ดเจ้าของ', state: 'owner:dashboard' },
] as const;

interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; from?: { id: number; username?: string }; chat: { id: number }; text?: string };
  callback_query?: { id: string; from: { id: number; username?: string }; data?: string; message?: { message_id: number; chat: { id: number } } };
}

/** Typed session row as returned from the DB. */
interface SessionRow {
  id: string;
  telegramAccountId: string;
  state: string;
  context: unknown;
}

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
    private readonly workflow: WorkflowService,
    private readonly workflowApprover: WorkflowApproverService,
    private readonly reporting: ReportingService,
    private readonly executiveDailyBrief: ExecutiveDailyBriefService,
    private readonly messageLog: TelegramMessageLogService,
    private readonly companyCache: CompanyCodeCacheService,
    private readonly auth: AuthService,
    private readonly aiAssistant: AiAssistantService,
    private readonly aiConversations: AiConversationService,
    private readonly marketingReports: MarketingDailyReportService,
    private readonly marketingKpi: MarketingKpiQueryService,
    private readonly marketingBackOffice: MarketingBackOfficeService,
    private readonly marketingExpenses: MarketingExpenseService,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly commissionFinalization: CommissionFinalizationService,
    private readonly commissionAdjustments: CommissionAdjustmentService,
    private readonly onboarding: TelegramOnboardingService,
    private readonly declarationCorrection: TelegramDeclarationCorrectionService,
    @Inject(GLOBAL_ID_SEQUENCE) private readonly globalIdSequence: GlobalIdSequence,
  ) {}

  /**
   * Register the webhook with Telegram on startup.
   * Idempotent: Telegram ignores duplicate setWebhook calls for the same URL.
   * No-ops silently when BOT_TOKEN or TELEGRAM_WEBHOOK_URL is absent (dev mode).
   */
  async onModuleInit(): Promise<void> {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    const webhookUrl = process.env['TELEGRAM_WEBHOOK_URL'];
    const secret = process.env['TELEGRAM_WEBHOOK_SECRET'];

    if (!token || !webhookUrl) {
      this.logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_URL not set — skipping webhook registration');
      return;
    }

    try {
      const params: Record<string, string> = { url: webhookUrl };
      if (secret) params['secret_token'] = secret;

      const res = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        },
      );
      const data = await res.json() as { ok: boolean; description?: string };
      if (data.ok) {
        this.logger.log(`Telegram webhook registered: ${webhookUrl}`);
      } else {
        this.logger.error(`Telegram webhook registration failed: ${data.description}`);
      }
    } catch (err) {
      this.logger.error('Failed to register Telegram webhook', err);
    }
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const from = update.message?.from ?? update.callback_query?.from;
    if (!from) return;

    let chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (!chatId) return;

    let account = await this.resolveAccount(from.id);
    if (!account) {
      account = await this.ensurePendingTelegramAccount(from.id, chatId, from.username);
      await this.logInbound(account.id, update);

      const session = await this.getOrCreateSession(account.id);
      const state = (session.state as TelegramState) ?? 'idle';
      const context = (session.context as SessionContext | null) ?? {};

      if (update.callback_query) {
        await this.gateway.answerCallbackQuery(update.callback_query.id);
        await this.handleOnboardingCallback(account, chatId, update.callback_query.data ?? '', state, context);
        return;
      }

      const text = update.message?.text?.trim() ?? '';
      if (text === '/start' || state === 'idle') {
        await this.startOnboarding(account.id, chatId);
        return;
      }

      await this.handleOnboardingText(account, chatId, text, state, context);
      return;
    }

    // Load persisted session from telegram.telegram_sessions.
    // State and context survive process restarts.
    const session = await this.getOrCreateSession(account.id);
    const state = (session.state as TelegramState) ?? 'idle';
    const context = (session.context as SessionContext | null) ?? {};
    chatId = chatId ?? account.chatId;
    if (!chatId) return;

    await this.logInbound(account.id, update);

    const pendingUser = await this.prisma.user.findFirst({
      where: { id: account.userId, deletedAt: null },
      select: { isActive: true, employeeId: true },
    });
    if (pendingUser && !pendingUser.isActive && !pendingUser.employeeId) {
      const session = await this.getOrCreateSession(account.id);
      const state = (session.state as TelegramState) ?? 'idle';
      const context = (session.context as SessionContext | null) ?? {};

      if (update.callback_query) {
        await this.gateway.answerCallbackQuery(update.callback_query.id);
        await this.handleOnboardingCallback(account, chatId, update.callback_query.data ?? '', state, context);
        return;
      }

      const text = update.message?.text?.trim() ?? '';
      if (text === '/start' && state === 'idle') {
        await this.startOnboarding(account.id, chatId);
        return;
      }

      await this.handleOnboardingText(account, chatId, text, state, context);
      return;
    }

    if (update.callback_query) {
      await this.gateway.answerCallbackQuery(update.callback_query.id);
      await this.handleCallback(account, chatId, update.callback_query.data ?? '', state, context);
      return;
    }

    const text = update.message?.text?.trim() ?? '';
    if (text === '/start' || text === '🏠 Home') {
      await this.showMainMenu(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    if (text === '/report' || text.startsWith('/report ')) {
      await this.handleReportCommand(account, chatId, text);
      return;
    }

    await this.handleTextInState(account, chatId, text, state, context);
  }

  private async showMainMenu(chatId: number, userId: string): Promise<void> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId, deletedAt: null },
      include: { role: { select: { code: true } } },
    });
    const codes = new Set(roles.map((r) => r.role.code));
    const isOwner = codes.has('owner') || codes.has('super_admin');
    const isLeader = codes.has('sub_leader') || codes.has('big_leader');
    const emp = await this.getEmployeeForUser(userId);
    const isBigLeader = emp
      ? !!(await this.prisma.marketingTeam.findFirst({
        where: {
          bigLeaderEmployeeId: emp.employeeId,
          level: 'root',
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      }))
      : false;

    const buttons = [
      ...MENU_ROOT_EMPLOYEE_TH,
      ...(isLeader ? MENU_ROOT_LEADER_TH : []),
      ...(isBigLeader ? MENU_ROOT_BIG_LEADER_TH : []),
      ...(isOwner ? MENU_ROOT_OWNER_TH : []),
    ];

    await this.gateway.sendMessage({
      chatId,
      text: '🏠 <b>เมนู WorkHQ</b>\nเลือกการดำเนินการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          ...buttons.map((b) => [{ text: b.label, callback_data: b.state }]),
          [{ text: MENU_CLOSE.label, callback_data: MENU_CLOSE.state }],
        ],
      },
    });
  }

  private backRow(): [{ text: string; callback_data: string }] {
    return [{ text: '🔙 กลับ', callback_data: 'home' }];
  }

  private cancelRow(): [{ text: string; callback_data: string }] {
    return [{ text: '❌ ยกเลิก', callback_data: 'menu:cancel' }];
  }

  private async showAttendanceMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📋 <b>การเข้างาน</b>',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ เข้างาน', callback_data: 'confirm:checkin' }],
          [{ text: '🚪 ออกงาน', callback_data: 'confirm:checkout' }],
          [{ text: '☕ เริ่มพัก', callback_data: 'confirm:break_start' }],
          [{ text: '✅ จบพัก', callback_data: 'confirm:break_end' }],
          this.backRow(),
        ],
      },
    });
  }

  private async showPlaceholderSubMenu(
    chatId: number,
    title: string,
    emoji: string,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: `${emoji} <b>${title}</b>\n🚧 ฟีเจอร์นี้กำลังพัฒนา`,
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  private async showActionConfirm(
    chatId: number,
    title: string,
    confirmLabel: string,
    confirmData: string,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: title,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: confirmLabel, callback_data: confirmData }],
          this.cancelRow(),
          this.backRow(),
        ],
      },
    });
  }

  private async handleCancel(
    account: { id: string; userId: string },
    chatId: number,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    const parent = context.draft?.['parentMenu'] as string | undefined;
    switch (parent ?? state) {
      case 'attendance:confirming_checkin':
      case 'confirm:checkin':
      case 'confirm:checkout':
      case 'confirm:break_start':
      case 'confirm:break_end':
        await this.showAttendanceMenu(chatId);
        await this.saveSession(account.id, 'attendance:confirming_checkin', {});
        break;
      case 'leave:confirm':
        await this.showLeaveTypePicker(account.id, chatId);
        await this.saveSession(account.id, 'leave:select_type', {});
        break;
      default:
        await this.showMainMenu(chatId, account.userId);
        await this.saveSession(account.id, 'idle', {});
    }
  }

  private async handleCallback(
    account: { id: string; userId: string; chatId: number },
    chatId: number,
    data: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    if (data === 'declaration:correct' || data.startsWith('declaration:') || state.startsWith('declaration_')) {
      await this.declarationCorrection.handleCallback(
        account,
        chatId,
        data,
        state,
        context,
        (id, s, ctx) => this.saveSession(id, s, ctx),
        (cid, userId) => this.showMainMenu(cid, userId),
      );
      return;
    }

    switch (data) {
      case 'menu:close':
        await this.gateway.sendMessage({ chatId, text: '👋 ปิดเมนูแล้ว พิมพ์ /start เพื่อเปิดใหม่' });
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'menu:cancel':
        await this.handleCancel(account, chatId, state, context);
        break;

      case 'home':
        await this.showMainMenu(chatId, account.userId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'attendance:confirming_checkin':
        await this.showAttendanceMenu(chatId);
        await this.saveSession(account.id, 'attendance:confirming_checkin', {});
        break;

      case 'confirm:checkin':
        await this.showActionConfirm(
          chatId,
          '✅ <b>ยืนยันการเข้างาน?</b>',
          '✅ ยืนยันเข้างาน',
          'do:checkin',
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'attendance:confirming_checkin' },
        });
        break;

      case 'confirm:checkout':
        await this.showActionConfirm(
          chatId,
          '🚪 <b>ยืนยันการออกงาน?</b>',
          '✅ ยืนยันออกงาน',
          'do:checkout',
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'attendance:confirming_checkin' },
        });
        break;

      case 'confirm:break_start':
        await this.showActionConfirm(
          chatId,
          '☕ <b>ยืนยันเริ่มพักเบรก?</b>',
          '✅ ยืนยันเริ่มพัก',
          'do:break_start',
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'attendance:confirming_checkin' },
        });
        break;

      case 'confirm:break_end':
        await this.showActionConfirm(
          chatId,
          '✅ <b>ยืนยันจบพักเบรก?</b>',
          '✅ ยืนยันจบพัก',
          'do:break_end',
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'attendance:confirming_checkin' },
        });
        break;

      case 'leave:menu':
        await this.showLeaveMenu(chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'leave:select_type':
        await this.showLeaveTypePicker(account.id, chatId);
        break;

      case 'leave:edit':
        await this.showLeaveTypePicker(account.id, chatId);
        break;

      case 'leave_reschedule:select_request':
        await this.showRescheduleLeavePicker(account, chatId);
        break;

      case 'leave_reschedule:submit':
        await this.submitLeaveReschedule(account, chatId, context);
        break;

      case 'leave_reschedule:edit':
        await this.showRescheduleLeavePicker(account, chatId);
        break;

      case 'leave_reschedule:emergency:yes':
        await this.setRescheduleEmergency(account, chatId, context, true);
        break;

      case 'leave_reschedule:emergency:no':
        await this.setRescheduleEmergency(account, chatId, context, false);
        break;

      case 'leave_reschedule:confirm':
        await this.showLeaveRescheduleSummary(account.id, chatId, this.getLeaveRescheduleDraft(context));
        break;

      case 'leave:submit':
        await this.submitLeaveRequest(account, chatId, context);
        break;

      case 'payroll:view_payslip':
        await this.showPayslipMenu(chatId);
        await this.saveSession(account.id, 'payroll:view_payslip', {});
        break;

      case 'payslip:latest':
        await this.sendLatestPayslip(account, chatId);
        break;

      case 'payslip:history':
        await this.sendPayslipHistory(account, chatId);
        break;

      case 'commission:view_summary':
        await this.showCommissionMenu(chatId);
        await this.saveSession(account.id, 'commission:view_summary', {});
        break;

      case 'commission:current':
        await this.sendCommissionSummary(account, chatId, 'current');
        break;

      case 'commission:pending':
        await this.sendCommissionSummary(account, chatId, 'pending');
        break;

      case 'commission:qualified':
        await this.sendCommissionSummary(account, chatId, 'qualified');
        break;

      case 'commission:hold':
        await this.sendCommissionSummary(account, chatId, 'hold');
        break;

      case 'referral:status':
        await this.sendReferralStatus(account, chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'marketing:submit':
        await this.startMarketingReportFlow(account, chatId);
        break;

      case 'marketing:my_kpi':
        await this.sendMyMarketingKpi(account, chatId);
        break;

      case 'marketing:latest_report':
        await this.sendMyLatestMarketingReport(account, chatId);
        break;

      case 'marketing:confirm_submit':
        await this.submitMarketingReportDraft(account, chatId, context);
        break;

      case 'marketing:expense_submit':
        await this.startMarketingExpenseFlow(account, chatId);
        break;

      case 'marketing:team_expenses':
        await this.sendTeamMarketingExpenses(account, chatId);
        break;

      case 'marketing:team_kpi':
        await this.sendTeamMarketingKpi(account, chatId);
        break;

      case 'marketing:company_overview':
        await this.sendMarketingCompanyOverview(account, chatId);
        break;

      case 'marketing:expense_confirm_submit':
        await this.submitMarketingExpenseDraft(account, chatId, context);
        break;

      case 'referral:pending':
      case 'referral:qualified':
      case 'referral:paid':
        await this.sendReferralStatus(account, chatId);
        break;

      case 'ai:chatting':
        await this.showAiChatIntro(account, chatId, context);
        break;

      case 'leader:approvals':
        await this.showApprovalsMenu(chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'approvals:leave':
        await this.showPendingLeaveApprovals(account, chatId);
        break;

      case 'approvals:leave_reschedule':
        await this.showPendingLeaveRescheduleApprovals(account, chatId);
        break;

      case 'approvals:ot':
        await this.showPendingOtApprovals(account, chatId);
        break;

      case 'report:menu':
        await this.showReportMenu(chatId);
        break;

      case 'report:today':
        await this.sendPersonalDailyReport(account, chatId);
        break;

      case 'report:morning':
        await this.sendMorningReport(account, chatId);
        break;

      case 'report:evening':
        await this.sendEveningReport(account, chatId);
        break;

      case 'report:company':
        await this.sendCompanySummaryReport(account, chatId);
        break;

      case 'leader:team_dashboard':
        await this.showTeamAttendanceMenu(chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'team:attendance':
        await this.sendTeamAttendanceDashboard(account, chatId);
        break;

      case 'team:not_in':
        await this.sendTeamAttendanceList(account, chatId, 'not_in');
        break;

      case 'team:not_out':
        await this.sendTeamAttendanceList(account, chatId, 'not_out');
        break;

      case 'team:late':
        await this.sendTeamAttendanceList(account, chatId, 'late');
        break;

      case 'owner:dashboard':
        await this.showOwnerDashboardMenu(chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'owner:company':
        await this.sendOwnerCompanySummary(account, chatId);
        break;

      case 'owner:finance':
        await this.sendOwnerFinanceSummary(account, chatId);
        break;

      case 'owner:recruitment':
        await this.sendOwnerRecruitmentSummary(account, chatId);
        break;

      case 'owner:payroll':
        await this.sendOwnerPayrollSummary(account, chatId);
        break;
      case 'owner:commission':
        await this.sendOwnerCommissionSummary(account, chatId);
        break;

      case 'owner:commission_cycles':
        await this.showOwnerCommissionCyclesMenu(account, chatId);
        break;

      case 'owner:commission_adjustments':
        await this.showOwnerCommissionAdjustmentsMenu(account, chatId);
        break;

      case 'owner:executive_brief':
        await this.showOwnerExecutiveBriefMenu(chatId);
        break;

      case 'owner:executive_brief:today':
        await this.sendOwnerExecutiveBrief(account, chatId, 'today');
        break;

      case 'owner:executive_brief:yesterday':
        await this.sendOwnerExecutiveBrief(account, chatId, 'yesterday');
        break;

      case 'owner:executive_brief:mtd':
        await this.sendOwnerExecutiveBrief(account, chatId, 'mtd');
        break;

      case 'do:checkin': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) { await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' }); return; }
        try {
          const res = await this.attendance.checkIn(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
            { companyId: emp.companyId },
          );
          await this.gateway.sendMessage({ chatId, text: `✅ Checked in at ${res.checkInAt}\n${res.lateMinutes > 0 ? `⚠️ Late by ${res.lateMinutes} min` : '🎯 On time'}` });
        } catch (err: unknown) {
          await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
        }
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      case 'do:checkout': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) { await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' }); return; }
        try {
          const res = await this.attendance.checkOut(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
            { companyId: emp.companyId },
          );
          let msg = `🚪 Checked out\n⏱ Worked: ${Math.floor(res.workedMinutes / 60)}h ${res.workedMinutes % 60}m`;
          if (res.overtime) msg += `\n🔥 OT: ${res.overtime.otHours}h (฿${res.overtime.amount}) — pending approval`;
          await this.gateway.sendMessage({ chatId, text: msg });
        } catch (err: unknown) {
          await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
        }
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      case 'do:break_start': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (emp) await this.attendance.startBreak({ userId: account.userId, impersonatorUserId: null, companyId: emp.companyId }, emp.employeeId);
        await this.gateway.sendMessage({ chatId, text: '☕ เริ่มพักเบรกแล้ว อย่าลืมกดจบพักด้วยนะ!' });
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      case 'do:break_end': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) {
          await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
          return;
        }
        try {
          await this.attendance.endBreak(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
          );
          await this.gateway.sendMessage({ chatId, text: '✅ จบพักเบรกแล้ว' });
        } catch (err: unknown) {
          await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
        }
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      default: {
        if (data.startsWith('approve:leave:')) {
          await this.actOnWorkflow(account, chatId, data.replace('approve:leave:', ''), 'approve', 'leave');
          break;
        }
        if (data.startsWith('reject:leave:')) {
          await this.startRejectionFlow(account, chatId, data.replace('reject:leave:', ''), 'leave');
          break;
        }
        if (data.startsWith('approve:ot:')) {
          await this.actOnWorkflow(account, chatId, data.replace('approve:ot:', ''), 'approve', 'overtime');
          break;
        }
        if (data.startsWith('reject:ot:')) {
          await this.startRejectionFlow(account, chatId, data.replace('reject:ot:', ''), 'overtime');
          break;
        }
        if (data.startsWith('announcement:broadcast:')) {
          await this.handleAnnouncementBroadcast(account, chatId, data.replace('announcement:broadcast:', ''));
          break;
        }
        if (data.startsWith('leave:type:')) {
          const code = data.replace('leave:type:', '');
          await this.onLeaveTypeSelected(account, chatId, code, context);
          break;
        }
        if (data.startsWith('leave_reschedule:pick:')) {
          await this.onRescheduleLeaveSelected(
            account,
            chatId,
            data.replace('leave_reschedule:pick:', ''),
            context,
          );
          break;
        }
        if (data.startsWith('approve:leave_reschedule:')) {
          await this.actOnWorkflow(
            account,
            chatId,
            data.replace('approve:leave_reschedule:', ''),
            'approve',
            'leave_reschedule',
          );
          break;
        }
        if (data.startsWith('reject:leave_reschedule:')) {
          await this.startRejectionFlow(
            account,
            chatId,
            data.replace('reject:leave_reschedule:', ''),
            'leave_reschedule',
          );
          break;
        }
        if (data.startsWith('marketing:expense:cat:')) {
          const category = data.replace('marketing:expense:cat:', '');
          await this.onMarketingExpenseCategorySelected(account, chatId, category, context);
          break;
        }
        if (data.startsWith('owner:commission_cycle:')) {
          const cycleId = data.replace('owner:commission_cycle:', '');
          await this.showOwnerCommissionCycleActions(account, chatId, cycleId);
          break;
        }
        if (data.startsWith('owner:commission_preview:')) {
          const cycleId = data.replace('owner:commission_preview:', '');
          await this.sendOwnerCommissionPreview(account, chatId, cycleId);
          break;
        }
        if (data.startsWith('owner:commission_approve:')) {
          const cycleId = data.replace('owner:commission_approve:', '');
          await this.runOwnerCommissionAction(account, chatId, cycleId, 'approve');
          break;
        }
        if (data.startsWith('owner:commission_finalize:')) {
          const cycleId = data.replace('owner:commission_finalize:', '');
          await this.runOwnerCommissionAction(account, chatId, cycleId, 'finalize');
          break;
        }
        if (data.startsWith('owner:commission_lock:')) {
          const cycleId = data.replace('owner:commission_lock:', '');
          await this.runOwnerCommissionAction(account, chatId, cycleId, 'lock');
          break;
        }
        if (data.startsWith('owner:commission_adj:')) {
          const adjId = data.replace('owner:commission_adj:', '');
          await this.showOwnerCommissionAdjustmentActions(account, chatId, adjId);
          break;
        }
        if (data.startsWith('owner:commission_adj_approve:')) {
          const adjId = data.replace('owner:commission_adj_approve:', '');
          await this.runOwnerCommissionAdjustmentAction(account, chatId, adjId, 'approve');
          break;
        }
        if (data === 'owner:commission_adj_history') {
          await this.sendOwnerCommissionAdjustmentHistory(account, chatId);
          break;
        }
        await this.gateway.sendMessage({
          chatId,
          text: '🚧 ฟีเจอร์นี้กำลังพัฒนา',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
      }
    }
  }

  private async handleTextInState(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    ctx: SessionContext,
  ): Promise<void> {
    if (state.startsWith('onboarding_')) {
      await this.handleOnboardingText(account, chatId, text, state, ctx);
      return;
    }
    if (state.startsWith('declaration_')) {
      await this.declarationCorrection.handleText(
        account,
        chatId,
        text,
        state,
        ctx,
        (id, s, c) => this.saveSession(id, s, c),
      );
      return;
    }
    if (state === 'leave:rejecting' || state === 'ot:rejecting') {
      await this.handleRejectionComment(account, chatId, text, state, ctx);
      return;
    }
    if (state === 'leave:enter_start' || state === 'leave:enter_end' || state === 'leave:enter_reason') {
      await this.handleLeaveText(account, chatId, text, state, ctx);
      return;
    }
    if (state === 'ai:chatting') {
      await this.handleAiChatText(account, chatId, text, ctx);
      return;
    }
    if (
      state === 'leave_reschedule:enter_start'
      || state === 'leave_reschedule:enter_reason'
    ) {
      await this.handleLeaveRescheduleText(account, chatId, text, state, ctx);
      return;
    }
    if (state.startsWith('marketing:')) {
      await this.handleMarketingText(account, chatId, text, state, ctx);
      return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: 'พิมพ์ /start เพื่อเปิดเมนู หรือ /report เพื่อดูรายงาน',
    });
  }

  // ── AI assistant chat ─────────────────────────────────────────────────────

  private getAiChatDraft(context: SessionContext): AiChatDraft {
    return (context.draft ?? {}) as AiChatDraft;
  }

  private async showAiChatIntro(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getAiChatDraft(context);
    const conversationId = await this.aiConversations.getOrCreateConversation(
      account.userId,
      AiChannel.telegram,
      draft.aiConversationId,
    );

    await this.gateway.sendMessage({
      chatId,
      text: [
        '🤖 <b>ผู้ช่วย AI WorkHQ</b>',
        '',
        'ถามเรื่อง HR การเข้างาน การลา หรือนโยบายทั่วไปได้เลย',
        'ผู้ช่วยนี้ให้คำแนะนำเท่านั้น ไม่สามารถอนุมัติหรือแก้ไขข้อมูลในระบบได้',
        '',
        'พิมพ์คำถามของคุณ หรือกด 🏠 เพื่อกลับเมนูหลัก',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
      },
    });

    await this.saveSession(account.id, 'ai:chatting', {
      draft: { ...draft, aiConversationId: conversationId },
    });
  }

  private async handleAiChatText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    ctx: SessionContext,
  ): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '/start' || trimmed === '/exit' || trimmed.toLowerCase() === 'exit') {
      await this.showMainMenu(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    const draft = this.getAiChatDraft(ctx);
    const emp = await this.getEmployeeForUser(account.userId);
    const actor: ActorContext = {
      userId: account.userId,
      impersonatorUserId: null,
      companyId: emp?.companyId ?? null,
    };

    try {
      const result = await this.aiAssistant.chat(actor, {
        message: trimmed,
        conversationId: draft.aiConversationId,
        channel: AiChannel.telegram,
      });

      await this.saveSession(account.id, 'ai:chatting', {
        draft: { ...draft, aiConversationId: result.conversationId },
      });

      await this.gateway.sendMessage({
        chatId,
        text: `${result.reply}\n\n${result.disclaimer}`,
        replyMarkup: {
          inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถติดต่อผู้ช่วย AI ได้';
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ${message}`,
        replyMarkup: {
          inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
        },
      });
    }
  }

  // ── Leave request flow ──────────────────────────────────────────────────────

  private async showLeaveMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '🌴 <b>เมนูการลา</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📝 ขอลาใหม่', callback_data: 'leave:select_type' }],
          [{ text: '🔄 เลื่อนวันลา', callback_data: 'leave_reschedule:select_request' }],
          this.backRow(),
        ],
      },
    });
  }

  private getLeaveRescheduleDraft(context: SessionContext): LeaveRescheduleDraft {
    return (context.draft ?? {}) as LeaveRescheduleDraft;
  }

  private async showRescheduleLeavePicker(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const leaves = await this.leave.listApprovedLeaveRequests(
      { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
      emp.employeeId,
      emp.companyId,
    );

    if (leaves.length === 0) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ ไม่มีวันลาที่อนุมัติแล้วและสามารถเลื่อนได้',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      return;
    }

    await this.gateway.sendMessage({
      chatId,
      text: '🔄 <b>เลื่อนวันลา</b>\nเลือกรายการลาที่ต้องการเลื่อน:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          ...leaves.slice(0, 8).map((leave) => [{
            text: `${leave.startDate} → ${leave.endDate} (${leave.days} วัน)`,
            callback_data: `leave_reschedule:pick:${leave.id}`,
          }]),
          this.backRow(),
        ],
      },
    });
    await this.saveSession(account.id, 'leave_reschedule:select_request', { draft: {} });
  }

  private async onRescheduleLeaveSelected(
    account: { id: string; userId: string },
    chatId: number,
    leaveRequestId: string,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveRescheduleDraft(context);
    const row = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveRequestId, deletedAt: null, status: 'approved' },
      include: { leaveType: true },
    });
    if (!row) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบรายการลา' });
      return;
    }

    draft.leaveRequestId = row.id;
    draft.originalStartDate = row.startDate.toISOString().slice(0, 10);
    draft.originalEndDate = row.endDate.toISOString().slice(0, 10);
    draft.originalDays = Number(row.days);

    await this.gateway.sendMessage({
      chatId,
      text:
        `📅 ลาเดิม: ${draft.originalStartDate} → ${draft.originalEndDate} (${draft.originalDays} วัน)\n` +
        'กรุณากรอกวันเริ่มลาใหม่ (YYYY-MM-DD):',
    });
    await this.saveSession(account.id, 'leave_reschedule:enter_start', { draft });
  }

  private async handleLeaveRescheduleText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveRescheduleDraft(context);

    if (state === 'leave_reschedule:enter_start') {
      const newStartDate = this.parseDateInput(text);
      if (!newStartDate) {
        await this.gateway.sendMessage({ chatId, text: '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณากรอก YYYY-MM-DD:' });
        return;
      }
      draft.newStartDate = newStartDate;
      draft.newEndDate = this.computeRescheduleEndDate(newStartDate, draft.originalDays ?? 1);
      await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการเลื่อนวันลา (อย่างน้อย 10 ตัวอักษร):' });
      await this.saveSession(account.id, 'leave_reschedule:enter_reason', { draft });
      return;
    }

    if (state === 'leave_reschedule:enter_reason') {
      if (text.trim().length < 10) {
        await this.gateway.sendMessage({ chatId, text: '❌ เหตุผลต้องมีอย่างน้อย 10 ตัวอักษร:' });
        return;
      }
      draft.reason = text.trim();
      draft.isEmergency = false;
      await this.gateway.sendMessage({
        chatId,
        text: 'เป็นกรณีฉุกเฉินหรือไม่? (ฉุกเฉินสามารถขอเลื่อนได้แม้ไม่ครบ 7 วันล่วงหน้า)',
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '🚨 ใช่ (ฉุกเฉิน)', callback_data: 'leave_reschedule:emergency:yes' },
              { text: 'ไม่ใช่', callback_data: 'leave_reschedule:emergency:no' },
            ],
          ],
        },
      });
      await this.saveSession(account.id, 'leave_reschedule:confirm', { draft });
    }
  }

  private computeRescheduleEndDate(startDate: string, days: number): string {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + Math.max(1, Math.ceil(days)) - 1);
    return end.toISOString().slice(0, 10);
  }

  private async setRescheduleEmergency(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
    isEmergency: boolean,
  ): Promise<void> {
    const draft = this.getLeaveRescheduleDraft(context);
    draft.isEmergency = isEmergency;
    await this.showLeaveRescheduleSummary(account.id, chatId, draft);
    await this.saveSession(account.id, 'leave_reschedule:confirm', { draft });
  }

  private async showLeaveRescheduleSummary(
    accountId: string,
    chatId: number,
    draft: LeaveRescheduleDraft,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text:
        'ยืนยันคำขอเลื่อนวันลา?\n' +
        `📅 เดิม: ${draft.originalStartDate ?? '-'} → ${draft.originalEndDate ?? '-'}\n` +
        `📅 ใหม่: ${draft.newStartDate ?? '-'} → ${draft.newEndDate ?? '-'}\n` +
        `📊 ${draft.originalDays ?? 0} วัน (ระยะเวลาเท่าเดิม)\n` +
        `📝 เหตุผล: ${draft.reason ?? '-'}\n` +
        `🚨 ฉุกเฉิน: ${draft.isEmergency ? 'ใช่' : 'ไม่ใช่'}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ ยืนยันส่งคำขอ', callback_data: 'leave_reschedule:submit' }],
          [{ text: '❌ แก้ไข', callback_data: 'leave_reschedule:edit' }],
          this.backRow(),
        ],
      },
    });
    await this.saveSession(accountId, 'leave_reschedule:confirm', { draft });
  }

  private async submitLeaveReschedule(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveRescheduleDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    if (!draft.leaveRequestId || !draft.newStartDate || !draft.reason) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ กรุณาเริ่มใหม่' });
      await this.showRescheduleLeavePicker(account, chatId);
      return;
    }

    try {
      const result = await this.leave.requestReschedule(
        { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
        emp.employeeId,
        {
          companyId: emp.companyId,
          leaveRequestId: draft.leaveRequestId,
          newStartDate: draft.newStartDate,
          reason: draft.reason,
          isEmergency: draft.isEmergency ?? false,
        },
      );
      await this.gateway.sendMessage({
        chatId,
        text:
          `✅ ส่งคำขอเลื่อนวันลาแล้ว\n` +
          `📅 วันใหม่: ${result.newStartDate} → ${result.newEndDate}\n` +
          `📋 สถานะ: ${result.status}\n` +
          (result.workflowInstanceId ? '🔄 รออนุมัติจากผู้บริหาร' : ''),
      });
      await this.saveSession(account.id, 'idle', {});
      await this.showMainMenu(chatId, account.userId);
    } catch (err: unknown) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ส่งคำขอเลื่อนวันลาไม่สำเร็จ: ${(err as Error).message}`,
      });
    }
  }

  private async showPendingLeaveRescheduleApprovals(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const instances = await this.workflowApprover.findPendingForActor(
        account.userId,
        'leave_reschedule',
        emp.companyId,
        5,
      );

      if (instances.length === 0) {
        await this.gateway.sendMessage({
          chatId,
          text: '✅ ไม่มีคำขอเลื่อนวันลารออนุมัติ',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
        return;
      }

      for (const inst of instances) {
        const reschedule = await this.prisma.leaveRescheduleRequest.findFirst({
          where: { workflowInstanceId: inst.id, deletedAt: null },
          include: { employee: true },
        });
        if (!reschedule) continue;

        const name = `${reschedule.employee.firstName} ${reschedule.employee.lastName}`;
        await this.gateway.sendMessage({
          chatId,
          text:
            `🔄 <b>คำขอเลื่อนวันลา</b>\n` +
            `👤 ${name}\n` +
            `📅 เดิม: ${reschedule.originalStartDate.toISOString().slice(0, 10)} → ${reschedule.originalEndDate.toISOString().slice(0, 10)}\n` +
            `📅 ใหม่: ${reschedule.newStartDate.toISOString().slice(0, 10)} → ${reschedule.newEndDate.toISOString().slice(0, 10)}\n` +
            `📝 ${reschedule.reason}`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '✅ อนุมัติ', callback_data: `approve:leave_reschedule:${inst.id}` },
                { text: '❌ ปฏิเสธ', callback_data: `reject:leave_reschedule:${inst.id}` },
              ],
            ],
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to load leave reschedule approvals', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายการอนุมัติไม่สำเร็จ' });
    }
  }

  private getLeaveDraft(context: SessionContext): LeaveDraft {
    return (context.draft ?? {}) as LeaveDraft;
  }

  private parseDateInput(text: string): string | null {
    const trimmed = text.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    return trimmed;
  }

  private computeLeaveDays(startDate: string, endDate: string): number {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return Math.max(0.5, diff);
  }

  private async showLeaveTypePicker(accountId: string, chatId: number): Promise<void> {
    const types = await this.prisma.leaveType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      take: 8,
    });
    if (types.length === 0) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ ยังไม่มีประเภทการลาในระบบ กรุณาติดต่อ HR',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: '🌴 <b>ขอลา</b>\nเลือกประเภทการลา:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          ...types.map((t) => [{ text: t.name, callback_data: `leave:type:${t.code}` }]),
          this.backRow(),
        ],
      },
    });
    await this.saveSession(accountId, 'leave:select_type', { draft: {} });
  }

  private async onLeaveTypeSelected(
    account: { id: string; userId: string },
    chatId: number,
    code: string,
    context: SessionContext,
  ): Promise<void> {
    const type = await this.prisma.leaveType.findFirst({
      where: { code, deletedAt: null },
    });
    if (!type) {
      await this.gateway.sendMessage({ chatId, text: '❌ ประเภทการลาไม่ถูกต้อง' });
      return;
    }
    const draft = this.getLeaveDraft(context);
    draft.leaveTypeCode = type.code;
    draft.leaveTypeName = type.name;
    await this.gateway.sendMessage({
      chatId,
      text: `📅 ประเภท: <b>${type.name}</b>\nกรุณากรอกวันที่เริ่มลา (YYYY-MM-DD):`,
      parseMode: 'HTML',
    });
    await this.saveSession(account.id, 'leave:enter_start', { draft });
  }

  private async handleLeaveText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveDraft(context);

    switch (state) {
      case 'leave:enter_start': {
        const startDate = this.parseDateInput(text);
        if (!startDate) {
          await this.gateway.sendMessage({ chatId, text: '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณากรอก YYYY-MM-DD:' });
          return;
        }
        draft.startDate = startDate;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกวันที่สิ้นสุดการลา (YYYY-MM-DD):' });
        await this.saveSession(account.id, 'leave:enter_end', { draft });
        break;
      }

      case 'leave:enter_end': {
        const endDate = this.parseDateInput(text);
        if (!endDate) {
          await this.gateway.sendMessage({ chatId, text: '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณากรอก YYYY-MM-DD:' });
          return;
        }
        if (draft.startDate && endDate < draft.startDate) {
          await this.gateway.sendMessage({ chatId, text: '❌ วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น กรุณากรอกอีกครั้ง:' });
          return;
        }
        draft.endDate = endDate;
        draft.days = this.computeLeaveDays(draft.startDate!, endDate);
        await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลการลา:' });
        await this.saveSession(account.id, 'leave:enter_reason', { draft });
        break;
      }

      case 'leave:enter_reason': {
        if (!text.trim()) {
          await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลการลา:' });
          return;
        }
        draft.reason = text.trim();
        await this.showLeaveSummary(account.id, chatId, draft);
        break;
      }

      default:
        await this.gateway.sendMessage({ chatId, text: 'พิมพ์ /start เพื่อเปิดเมนู' });
    }
  }

  private async showLeaveSummary(
    accountId: string,
    chatId: number,
    draft: LeaveDraft,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text:
        `ยืนยันคำขอลา?\n` +
        `📋 ประเภท: ${draft.leaveTypeName ?? draft.leaveTypeCode ?? '-'}\n` +
        `📅 ${draft.startDate ?? ''} → ${draft.endDate ?? ''}\n` +
        `📊 ${draft.days ?? 0} วัน\n` +
        `📝 เหตุผล: ${draft.reason ?? '-'}`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ ยืนยันส่งคำขอ', callback_data: 'leave:submit' }],
          [{ text: '❌ แก้ไข', callback_data: 'leave:edit' }],
          this.backRow(),
        ],
      },
    });
    await this.saveSession(accountId, 'leave:confirm', { draft });
  }

  private async submitLeaveRequest(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const { leaveTypeCode, startDate, endDate, days, reason } = draft;
    if (!leaveTypeCode || !startDate || !endDate || !days) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ กรุณาเริ่มใหม่' });
      await this.showLeaveTypePicker(account.id, chatId);
      return;
    }

    try {
      const result = await this.leave.requestLeave(
        { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
        emp.employeeId,
        {
          companyId: emp.companyId,
          leaveTypeCode,
          startDate,
          endDate,
          days,
          reason,
        },
      );
      await this.gateway.sendMessage({
        chatId,
        text:
          `✅ ส่งคำขอลาแล้ว\n` +
          `📋 สถานะ: ${result.status}\n` +
          (result.workflowInstanceId ? `🔄 รออนุมัติ` : ''),
      });
      await this.saveSession(account.id, 'idle', {});
      await this.showMainMenu(chatId, account.userId);
    } catch (err: unknown) {
      this.logger.error('Leave request failed', err);
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ส่งคำขอลาไม่สำเร็จ: ${(err as Error).message}`,
      });
    }
  }

  // ── Self-registration onboarding ────────────────────────────────────────────

  private async startOnboarding(accountId: string, chatId: number): Promise<void> {
    await this.onboarding.start(accountId, chatId, (id, state, ctx) => this.saveSession(id, state, ctx));
  }

  private async handleOnboardingText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    await this.onboarding.handleText(
      account,
      chatId,
      text,
      state,
      context,
      (id, s, ctx) => this.saveSession(id, s, ctx),
    );
  }

  private async handleOnboardingCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    await this.onboarding.handleCallback(
      account,
      chatId,
      data,
      state,
      context,
      (id, s, ctx) => this.saveSession(id, s, ctx),
      {
        assignDefaultEmployeeRole: (userId, companyId) => this.assignDefaultEmployeeRole(userId, companyId),
        showMainMenu: (cid, userId) => this.showMainMenu(cid, userId),
      },
    );
  }

  private async ensurePendingTelegramAccount(
    telegramUserId: number,
    chatId: number,
    username?: string,
  ): Promise<{ id: string; userId: string; chatId: number }> {
    const existing = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      include: { user: true },
    });
    if (existing) {
      return { id: existing.id, userId: existing.userId, chatId: Number(existing.chatId ?? chatId) };
    }

    const pendingUser = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        username: `pending_tg_${telegramUserId}`,
        userType: 'human',
        isActive: false,
      },
    });

    const acc = await this.prisma.telegramAccount.create({
      data: {
        id: randomUUID(),
        userId: pendingUser.id,
        telegramUserId: BigInt(telegramUserId),
        chatId: BigInt(chatId),
        username: username ?? null,
        isActive: true,
      },
    });

    this.logger.log(`Started onboarding for Telegram user ${telegramUserId}`);
    return { id: acc.id, userId: pendingUser.id, chatId };
  }

  // ── Message logging ─────────────────────────────────────────────────────────

  private async logInbound(accountId: string, update: TelegramUpdate): Promise<void> {
    const messageType = update.callback_query ? 'callback_query' : 'message';
    await this.logMessage(accountId, 'inbound', messageType, update);
  }

  private async logMessage(
    accountId: string,
    direction: 'inbound' | 'outbound',
    messageType: string,
    payload: unknown,
  ): Promise<void> {
    await this.messageLog.logMessage(accountId, direction, messageType, payload);
  }

  // ── Default employee role ───────────────────────────────────────────────────

  private async assignDefaultEmployeeRole(userId: string, companyId: string): Promise<void> {
    try {
      let role = await this.prisma.role.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { code: 'employee' },
            { name: { contains: 'employee', mode: 'insensitive' } },
          ],
        },
      });

      if (!role) {
        role = await this.prisma.role.create({
          data: {
            id: randomUUID(),
            code: 'employee',
            name: 'Employee',
            isSystem: true,
          },
        });
        for (const key of EMPLOYEE_PERMISSION_KEYS) {
          let permission = await this.prisma.permission.findFirst({ where: { key } });
          if (!permission) {
            permission = await this.prisma.permission.create({
              data: {
                id: randomUUID(),
                key,
                description: `Permission ${key}`,
                category: key.split(':')[0],
              },
            });
          }
          await this.prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
            update: {},
            create: { id: randomUUID(), roleId: role.id, permissionId: permission.id },
          });
        }
      }

      const existingRole = await this.prisma.userRole.findFirst({
        where: { userId, roleId: role.id, deletedAt: null },
      });
      if (!existingRole) {
        await this.prisma.userRole.create({
          data: { id: randomUUID(), userId, roleId: role.id },
        });
      }

      const existingScope = await this.prisma.scopeGrant.findFirst({
        where: { userId, scopeType: 'self', deletedAt: null },
      });
      if (!existingScope) {
        await this.prisma.scopeGrant.create({
          data: { id: randomUUID(), userId, scopeType: 'self', companyId },
        });
      }
    } catch (err) {
      this.logger.error('Failed to assign default employee role', err);
    }
  }

  // ── Approval workflows ──────────────────────────────────────────────────────

  private async showApprovalsMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '✅ <b>เมนูอนุมัติ</b>\nเลือกประเภท:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ อนุมัติการลา', callback_data: 'approvals:leave' }],
          [{ text: '🔄 อนุมัติเลื่อนวันลา', callback_data: 'approvals:leave_reschedule' }],
          [{ text: '⏰ อนุมัติ OT', callback_data: 'approvals:ot' }],
          this.backRow(),
        ],
      },
    });
  }

  private actorFor(account: { userId: string }, companyId: string | null): ActorContext {
    return { userId: account.userId, impersonatorUserId: null, companyId };
  }

  private async showPendingLeaveApprovals(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const instances = await this.workflowApprover.findPendingForActor(
        account.userId,
        'leave',
        emp.companyId,
        5,
      );

      if (instances.length === 0) {
        await this.gateway.sendMessage({
          chatId,
          text: '✅ ไม่มีคำขอลารออนุมัติ',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
        return;
      }

      for (const inst of instances) {
        const leave = await this.prisma.leaveRequest.findFirst({
          where: { workflowInstanceId: inst.id, deletedAt: null },
          include: { employee: true, leaveType: true },
        });
        if (!leave) continue;

        const name = `${leave.employee.firstName} ${leave.employee.lastName}`;
        const start = leave.startDate.toISOString().slice(0, 10);
        const end = leave.endDate.toISOString().slice(0, 10);
        await this.gateway.sendMessage({
          chatId,
          text:
            `🌴 <b>คำขอลา</b>\n` +
            `👤 ${name}\n` +
            `📋 ${leave.leaveType.name}\n` +
            `📅 ${start} → ${end}\n` +
            `📊 ${leave.days} วัน`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '✅ อนุมัติ', callback_data: `approve:leave:${inst.id}` },
                { text: '❌ ปฏิเสธ', callback_data: `reject:leave:${inst.id}` },
              ],
            ],
          },
        });
      }
      await this.gateway.sendMessage({
        chatId,
        text: '🔙 กลับเมนูหลัก',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      this.logger.error('Failed to load leave approvals', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายการอนุมัติไม่สำเร็จ' });
    }
  }

  private async showPendingOtApprovals(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const instances = await this.workflowApprover.findPendingForActor(
        account.userId,
        'overtime',
        emp.companyId,
        5,
      );

      if (instances.length === 0) {
        await this.gateway.sendMessage({
          chatId,
          text: '✅ ไม่มี OT รออนุมัติ',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
        return;
      }

      for (const inst of instances) {
        const ot = await this.prisma.overtimeRecord.findFirst({
          where: { workflowInstanceId: inst.id, deletedAt: null },
          include: { employee: true },
        });
        if (!ot) continue;

        const name = `${ot.employee.firstName} ${ot.employee.lastName}`;
        const date = ot.workDate.toISOString().slice(0, 10);
        await this.gateway.sendMessage({
          chatId,
          text:
            `⏰ <b>คำขอ OT</b>\n` +
            `👤 ${name}\n` +
            `📅 ${date}\n` +
            `⏱ ${ot.otHours} ชม.\n` +
            `💰 ฿${Number(ot.amount).toLocaleString('th-TH')}`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '✅ อนุมัติ', callback_data: `approve:ot:${inst.id}` },
                { text: '❌ ปฏิเสธ', callback_data: `reject:ot:${inst.id}` },
              ],
            ],
          },
        });
      }
      await this.gateway.sendMessage({
        chatId,
        text: '🔙 กลับเมนูหลัก',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      this.logger.error('Failed to load OT approvals', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายการ OT ไม่สำเร็จ' });
    }
  }

  private async actOnWorkflow(
    account: { id: string; userId: string },
    chatId: number,
    instanceId: string,
    action: 'approve' | 'reject',
    entityType: 'leave' | 'overtime' | 'leave_reschedule',
    comment?: string,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const allowed = await this.workflowApprover.isActorCurrentApprover(account.userId, instanceId);
      if (!allowed) {
        await this.gateway.sendMessage({
          chatId,
          text: '❌ คุณไม่มีสิทธิ์อนุมัติรายการนี้',
          telegramAccountId: account.id,
        });
        return;
      }

      await this.workflow.act(
        this.actorFor(account, emp.companyId),
        instanceId,
        {
          action,
          comment: comment ?? (action === 'approve' ? 'Approved via Telegram' : 'Rejected via Telegram'),
        },
      );
      const msg = action === 'approve'
        ? (entityType === 'leave' ? '✅ อนุมัติการลาแล้ว' : '✅ อนุมัติ OT แล้ว')
        : (entityType === 'leave' ? '❌ ปฏิเสธการลาแล้ว' : '❌ ปฏิเสธ OT แล้ว');
      await this.gateway.sendMessage({ chatId, text: msg, telegramAccountId: account.id });
      await this.saveSession(account.id, 'idle', {});
    } catch (err: unknown) {
      this.logger.error('Workflow action failed', err);
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ดำเนินการไม่สำเร็จ: ${(err as Error).message}`,
        telegramAccountId: account.id,
      });
    }
  }

  private async startRejectionFlow(
    account: { id: string; userId: string },
    chatId: number,
    instanceId: string,
    entityType: 'leave' | 'overtime' | 'leave_reschedule',
  ): Promise<void> {
    const allowed = await this.workflowApprover.isActorCurrentApprover(account.userId, instanceId);
    if (!allowed) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ คุณไม่มีสิทธิ์ปฏิเสธรายการนี้',
        telegramAccountId: account.id,
      });
      return;
    }

    const state: TelegramState = entityType === 'leave' ? 'leave:rejecting' : 'ot:rejecting';
    await this.saveSession(account.id, state, {
      draft: { workflowInstanceId: instanceId, entityType },
    });
    await this.gateway.sendMessage({
      chatId,
      text: 'กรุณาระบุเหตุผลในการปฏิเสธ:',
      telegramAccountId: account.id,
    });
  }

  private async handleRejectionComment(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    ctx: SessionContext,
  ): Promise<void> {
    const instanceId = ctx.draft?.['workflowInstanceId'] as string | undefined;
    const entityType = (ctx.draft?.['entityType'] as 'leave' | 'overtime' | undefined)
      ?? (state === 'leave:rejecting' ? 'leave' : 'overtime');

    if (!instanceId || !text.trim()) {
      await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการปฏิเสธ:' });
      return;
    }

    await this.actOnWorkflow(account, chatId, instanceId, 'reject', entityType, text.trim());
  }

  // ── /report command ───────────────────────────────────────────────────────

  private async handleReportCommand(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
  ): Promise<void> {
    const sub = text.replace('/report', '').trim();
    if (!sub) {
      await this.showReportMenu(chatId);
      return;
    }
    switch (sub) {
      case 'today':
        await this.sendPersonalDailyReport(account, chatId);
        break;
      case 'morning':
        await this.sendMorningReport(account, chatId);
        break;
      case 'evening':
        await this.sendEveningReport(account, chatId);
        break;
      case 'company':
        await this.sendCompanySummaryReport(account, chatId);
        break;
      default:
        await this.showReportMenu(chatId);
    }
  }

  private async showReportMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📊 <b>รายงาน</b>\nเลือกประเภท:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 รายงานวันนี้', callback_data: 'report:today' }],
          [{ text: '🌅 รายงานเช้า', callback_data: 'report:morning' }],
          [{ text: '🌙 รายงานเย็น', callback_data: 'report:evening' }],
          [{ text: '🏢 สรุปบริษัท', callback_data: 'report:company' }],
          this.backRow(),
        ],
      },
    });
  }

  private async sendPersonalDailyReport(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const record = await this.prisma.attendanceRecord.findFirst({
        where: { employeeId: emp.employeeId, workDate: new Date(today), deletedAt: null },
      });
      if (!record) {
        await this.gateway.sendMessage({ chatId, text: '📊 ไม่พบข้อมูลการเข้างานวันนี้' });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatPersonalDailyReport({
          workDate: today,
          checkInAt: record.checkInAt,
          checkOutAt: record.checkOutAt,
          workedMinutes: record.workedMinutes,
          lateMinutes: record.lateMinutes,
        }),
      });
    } catch (err) {
      this.logger.error('Personal report failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายงานไม่สำเร็จ' });
    }
  }

  private async sendMorningReport(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const company = await this.prisma.company.findFirst({
        where: { id: emp.companyId, deletedAt: null },
      });
      const payload = await this.reporting.generateMorningBrief(emp.companyId) as unknown as MorningBriefPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatMorningReport(payload, company?.name ?? 'บริษัท'),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Morning report failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายงานเช้าไม่สำเร็จ' });
    }
  }

  private async sendEveningReport(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const company = await this.prisma.company.findFirst({
        where: { id: emp.companyId, deletedAt: null },
      });
      const payload = await this.reporting.generateEveningBrief(emp.companyId) as unknown as EveningBriefPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatEveningReport(payload, company?.name ?? 'บริษัท'),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Evening report failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายงานเย็นไม่สำเร็จ' });
    }
  }

  private async sendCompanySummaryReport(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const company = await this.prisma.company.findFirst({
        where: { id: emp.companyId, deletedAt: null },
      });
      const payload = await this.reporting.generateCompanyDashboard(emp.companyId) as unknown as CompanyDashboardPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatCompanySummary(payload, company?.name ?? 'บริษัท'),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Company summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปบริษัทไม่สำเร็จ' });
    }
  }

  // ── Executive sprint: payslip, commission, referral, team, owner ────────────

  private async showPayslipMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '💰 <b>เงินเดือน</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📄 สลิปล่าสุด', callback_data: 'payslip:latest' }],
          [{ text: '📚 สลิปย้อนหลัง', callback_data: 'payslip:history' }],
          this.backRow(),
        ],
      },
    });
  }

  private async sendLatestPayslip(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const payslip = await this.prisma.payslip.findFirst({
        where: {
          employeeId: emp.employeeId,
          deletedAt: null,
          payrollCycle: { companyId: emp.companyId, deletedAt: null },
        },
        orderBy: { generatedAt: 'desc' },
        include: { payrollCycle: true },
      });
      if (!payslip) {
        await this.gateway.sendMessage({ chatId, text: '💰 ยังไม่มีสลิปเงินเดือน' });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatPayslip({
          periodStart: payslip.payrollCycle.periodStart.toISOString().slice(0, 10),
          periodEnd: payslip.payrollCycle.periodEnd.toISOString().slice(0, 10),
          gross: Number(payslip.gross),
          deductions: Number(payslip.deductions),
          net: Number(payslip.net),
          cycleStatus: payslip.payrollCycle.status,
        }),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Latest payslip failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสลิปไม่สำเร็จ' });
    }
  }

  private async sendPayslipHistory(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const payslips = await this.prisma.payslip.findMany({
        where: {
          employeeId: emp.employeeId,
          deletedAt: null,
          payrollCycle: { companyId: emp.companyId, deletedAt: null },
        },
        orderBy: { generatedAt: 'desc' },
        take: 6,
        include: { payrollCycle: true },
      });
      const items = payslips.map((p) => ({
        periodStart: p.payrollCycle.periodStart.toISOString().slice(0, 10),
        periodEnd: p.payrollCycle.periodEnd.toISOString().slice(0, 10),
        gross: Number(p.gross),
        deductions: Number(p.deductions),
        net: Number(p.net),
      }));
      await this.gateway.sendMessage({
        chatId,
        text: formatPayslipHistory(items),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Payslip history failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสลิปย้อนหลังไม่สำเร็จ' });
    }
  }

  private async showCommissionMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📊 <b>ค่าคอมมิชชั่น</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🔄 รอบปัจจุบัน', callback_data: 'commission:current' }],
          [{ text: '⏳ รอดำเนินการ', callback_data: 'commission:pending' }],
          [{ text: '✅ ผ่านเกณฑ์', callback_data: 'commission:qualified' }],
          [{ text: '🔒 Hold', callback_data: 'commission:hold' }],
          this.backRow(),
        ],
      },
    });
  }

  private async sendCommissionSummary(
    account: { id: string; userId: string },
    chatId: number,
    filter: 'current' | 'pending' | 'qualified' | 'hold',
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: { companyId: emp.companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
        orderBy: { periodStart: 'desc' },
      });
      const cycleLabel = cycle
        ? `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`
        : 'ไม่พบรอบปัจจุบัน';

      const baseWhere = {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        deletedAt: null,
        ...(cycle && filter === 'current' ? { earnCycleId: cycle.id } : {}),
      };

      const [pending, qualified, hold] = await Promise.all([
        this.prisma.commissionRecord.findMany({
          where: { ...baseWhere, status: 'accrued', qualified: false },
          select: { grossAmount: true },
        }),
        this.prisma.commissionRecord.findMany({
          where: { ...baseWhere, qualified: true, status: { not: 'paid' } },
          select: { grossAmount: true },
        }),
        this.prisma.commissionRecord.findMany({
          where: { ...baseWhere, status: 'hold' },
          select: { grossAmount: true },
        }),
      ]);

      const sum = (rows: { grossAmount: unknown }[]) =>
        rows.reduce((a, r) => a + Number(r.grossAmount), 0);

      const view = {
        cycleLabel,
        pending: pending.length,
        qualified: qualified.length,
        hold: hold.length,
        pendingAmount: sum(pending),
        qualifiedAmount: sum(qualified),
        holdAmount: sum(hold),
      };

      const filterLabel: Record<typeof filter, string> = {
        current: 'รอบปัจจุบัน',
        pending: 'รอดำเนินการ',
        qualified: 'ผ่านเกณฑ์',
        hold: 'Hold',
      };

      const focused = filter === 'pending'
        ? `⏳ รอดำเนินการ: ${view.pending} รายการ (฿${view.pendingAmount.toLocaleString('th-TH')})`
        : filter === 'qualified'
          ? `✅ ผ่านเกณฑ์: ${view.qualified} รายการ (฿${view.qualifiedAmount.toLocaleString('th-TH')})`
          : filter === 'hold'
            ? `🔒 Hold: ${view.hold} รายการ (฿${view.holdAmount.toLocaleString('th-TH')})`
            : formatCommissionSummary(view);

      await this.gateway.sendMessage({
        chatId,
        text: `📊 <b>${filterLabel[filter]}</b>\n🔄 รอบ: ${cycleLabel}\n${focused}`,
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Commission summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดค่าคอมไม่สำเร็จ' });
    }
  }

  private async sendReferralStatus(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    try {
      const base = { referrerEmployeeId: emp.employeeId, deletedAt: null };
      const [pending, qualified, paid] = await Promise.all([
        this.prisma.referral.findMany({ where: { ...base, status: 'pending' }, select: { rewardAmount: true } }),
        this.prisma.referral.findMany({ where: { ...base, status: 'qualified' }, select: { rewardAmount: true } }),
        this.prisma.referral.findMany({ where: { ...base, status: 'paid' }, select: { rewardAmount: true } }),
      ]);
      const sum = (rows: { rewardAmount: unknown }[]) =>
        rows.reduce((a, r) => a + Number(r.rewardAmount), 0);

      await this.gateway.sendMessage({
        chatId,
        text: formatReferralStatus({
          pending: pending.length,
          qualified: qualified.length,
          paid: paid.length,
          pendingReward: sum(pending),
          qualifiedReward: sum(qualified),
          paidReward: sum(paid),
        }),
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '⏳ รอดำเนินการ', callback_data: 'referral:pending' },
              { text: '✅ ผ่านเกณฑ์', callback_data: 'referral:qualified' },
              { text: '💵 จ่ายแล้ว', callback_data: 'referral:paid' },
            ],
            this.backRow(),
          ],
        },
      });
    } catch (err) {
      this.logger.error('Referral status failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสถานะแนะนำเพื่อนไม่สำเร็จ' });
    }
  }

  private async getLeaderTeamId(employeeId: string): Promise<string | null> {
    return this.marketingTeamService.leaderMarketingTeamId(employeeId);
  }

  private async getTeamMemberIds(teamId: string): Promise<Array<{ id: string; name: string }>> {
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return assignments.map((a) => ({
      id: a.employee.id,
      name: `${a.employee.firstName} ${a.employee.lastName}`,
    }));
  }

  private async showTeamAttendanceMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '👥 <b>แดชบอร์ดทีม</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 สรุปวันนี้', callback_data: 'team:attendance' }],
          [{ text: '❌ ยังไม่เข้างาน', callback_data: 'team:not_in' }],
          [{ text: '⚠️ ยังไม่ออกงาน', callback_data: 'team:not_out' }],
          [{ text: '⏰ มาสาย', callback_data: 'team:late' }],
          this.backRow(),
        ],
      },
    });
  }

  private async loadTeamAttendanceBuckets(
    account: { userId: string },
  ): Promise<{
    date: string;
    notCheckedIn: Array<{ name: string; detail?: string }>;
    notCheckedOut: Array<{ name: string; detail?: string }>;
    lateArrivals: Array<{ name: string; detail?: string }>;
  } | null> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return null;

    const teamId = await this.getLeaderTeamId(emp.employeeId);
    if (!teamId) return null;

    const members = await this.getTeamMemberIds(teamId);
    const today = new Date().toISOString().slice(0, 10);
    const workDate = new Date(today);
    const memberIds = members.map((m) => m.id);
    const nameById = new Map(members.map((m) => [m.id, m.name]));

    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId: { in: memberIds }, workDate, deletedAt: null },
    });
    const byEmployee = new Map(records.map((r) => [r.employeeId, r]));

    const notCheckedIn: Array<{ name: string }> = [];
    const notCheckedOut: Array<{ name: string; detail?: string }> = [];
    const lateArrivals: Array<{ name: string; detail?: string }> = [];

    for (const id of memberIds) {
      const name = nameById.get(id) ?? id;
      const rec = byEmployee.get(id);
      if (!rec?.checkInAt) {
        notCheckedIn.push({ name });
        continue;
      }
      if (!rec.checkOutAt) {
        notCheckedOut.push({ name });
      }
      if (rec.lateMinutes > 0) {
        lateArrivals.push({ name, detail: `${rec.lateMinutes} นาที` });
      }
    }

    return { date: today, notCheckedIn, notCheckedOut, lateArrivals };
  }

  private async sendTeamAttendanceDashboard(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    try {
      const data = await this.loadTeamAttendanceBuckets(account);
      if (!data) {
        await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบทีมของคุณ หรือไม่มีสิทธิ์ดูแดชบอร์ดทีม' });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatTeamAttendanceDashboard(
          data.notCheckedIn,
          data.notCheckedOut,
          data.lateArrivals,
          data.date,
        ),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      this.logger.error('Team attendance dashboard failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดแดชบอร์ดทีมไม่สำเร็จ' });
    }
  }

  private async sendTeamAttendanceList(
    account: { id: string; userId: string },
    chatId: number,
    list: 'not_in' | 'not_out' | 'late',
  ): Promise<void> {
    try {
      const data = await this.loadTeamAttendanceBuckets(account);
      if (!data) {
        await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบทีมของคุณ' });
        return;
      }

      const titles = {
        not_in: '❌ ยังไม่เข้างาน',
        not_out: '⚠️ ยังไม่ออกงาน',
        late: '⏰ มาสาย',
      };
      const items = list === 'not_in'
        ? data.notCheckedIn
        : list === 'not_out'
          ? data.notCheckedOut
          : data.lateArrivals;

      const body = items.length === 0
        ? '— ไม่มี'
        : items.map((m) => `• ${m.name}${m.detail ? ` (${m.detail})` : ''}`).join('\n');

      await this.gateway.sendMessage({
        chatId,
        text: `${titles[list]} (${data.date})\n${body}`,
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      this.logger.error('Team attendance list failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายชื่อไม่สำเร็จ' });
    }
  }

  private async showOwnerDashboardMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '👑 <b>แดชบอร์ดเจ้าของ</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🏢 สรุปบริษัท', callback_data: 'owner:company' }],
          [{ text: '💵 สรุปการเงิน', callback_data: 'owner:finance' }],
          [{ text: '👥 สรุปการสรรหา', callback_data: 'owner:recruitment' }],
          [{ text: '💰 สรุปเงินเดือน', callback_data: 'owner:payroll' }],
          [{ text: '📈 ค่าคอมมิชชั่น', callback_data: 'owner:commission' }],
          [{ text: '💰 รอบค่าคอม', callback_data: 'owner:commission_cycles' }],
          [{ text: '🛠 ปรับปรุงค่าคอม', callback_data: 'owner:commission_adjustments' }],
          [{ text: '📈 Executive Brief', callback_data: 'owner:executive_brief' }],
          this.backRow(),
        ],
      },
    });
  }

  private async requireOwner(account: { userId: string }): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: {
        userId: account.userId,
        deletedAt: null,
        role: { code: { in: ['owner', 'super_admin'] } },
      },
    });
    return count > 0;
  }

  private async sendOwnerCompanySummary(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const payload = await this.reporting.generateOwnerDashboard() as unknown as OwnerDashboardPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatOwnerCompanySummary(payload),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner company summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปบริษัทไม่สำเร็จ' });
    }
  }

  private async sendOwnerFinanceSummary(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const payload = await this.reporting.generateOwnerDashboard() as unknown as OwnerDashboardPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatOwnerFinanceSummary(payload),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner finance summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปการเงินไม่สำเร็จ' });
    }
  }

  private async sendOwnerPayrollSummary(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const payload = await this.reporting.generateExecutiveDashboard() as unknown as ExecutiveDashboardPayload;
      await this.gateway.sendMessage({
        chatId,
        text: formatOwnerPayrollSummary(payload),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner payroll summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปเงินเดือนไม่สำเร็จ' });
    }
  }

  private async sendOwnerCommissionSummary(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const payload = await this.reporting.generateOwnerDashboard() as unknown as OwnerDashboardPayload;
      const block = payload.commissionDashboard;
      if (!block) {
        await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลค่าคอมมิชชั่น' });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatOwnerCommissionSummary(block, payload.snapshotDate),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner commission summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลด Dashboard ค่าคอมมิชชั่นไม่สำเร็จ' });
    }
  }

  private ownerActor(account: { userId: string }, companyId: string): ActorContext {
    return { userId: account.userId, impersonatorUserId: null, companyId };
  }

  private async showOwnerExecutiveBriefMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📈 <b>Executive Brief</b>\nเลือกช่วงเวลา:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'วันนี้', callback_data: 'owner:executive_brief:today' }],
          [{ text: 'เมื่อวาน', callback_data: 'owner:executive_brief:yesterday' }],
          [{ text: 'MTD', callback_data: 'owner:executive_brief:mtd' }],
          this.backRow(),
        ],
      },
    });
  }

  private async sendOwnerExecutiveBrief(
    account: { id: string; userId: string },
    chatId: number,
    period: 'today' | 'yesterday' | 'mtd',
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const emp = await this.getEmployeeForUser(account.userId);
      const brief = await this.executiveDailyBrief.getDailyBrief(
        { userId: account.userId, impersonatorUserId: null, companyId: emp?.companyId ?? null },
        emp?.companyId ? { companyId: emp.companyId } : {},
      );
      const section = brief[period];
      await this.gateway.sendMessage({
        chatId,
        text: formatExecutiveBriefSection({
          label: section.label,
          headline: section.headline,
          financeNet: section.financeNet,
          recommendations: section.recommendations,
        }),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner executive brief failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลด Executive Brief ไม่สำเร็จ' });
    }
  }

  private async showOwnerCommissionCyclesMenu(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    try {
      const cycles = await this.commissionFinalization.listCycles(
        this.ownerActor(account, emp.companyId),
        { companyId: emp.companyId },
      );
      if (cycles.length === 0) {
        await this.gateway.sendMessage({
          chatId,
          text: '💰 ยังไม่มีรอบค่าคอม — คำนวณค่าคอมก่อน',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
        return;
      }
      const rows = cycles.slice(0, 8).map((c) => ([{
        text: `${c.type} · ${c.status} · ฿${Math.round(c.totalCommission).toLocaleString()}`,
        callback_data: `owner:commission_cycle:${c.id}`,
      }]));
      rows.push(this.backRow());
      await this.gateway.sendMessage({
        chatId,
        text: '💰 <b>รอบค่าคอม</b>\nเลือกรอบ:',
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: rows },
      });
    } catch (err) {
      this.logger.error('Owner commission cycles menu failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรอบค่าคอมไม่สำเร็จ' });
    }
  }

  private async showOwnerCommissionCycleActions(
    account: { id: string; userId: string },
    chatId: number,
    cycleId: string,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;
    try {
      const cycle = await this.commissionFinalization.getCycleStatus(
        this.ownerActor(account, emp.companyId),
        cycleId,
      );
      await this.gateway.sendMessage({
        chatId,
        text: `💰 รอบ <code>${cycleId.slice(0, 8)}</code>\nประเภท: ${cycle.type}\nสถานะ: <b>${cycle.status}</b>`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '👀 ดูตัวอย่าง', callback_data: `owner:commission_preview:${cycleId}` }],
            [{ text: '✅ อนุมัติ', callback_data: `owner:commission_approve:${cycleId}` }],
            [{ text: '📦 Finalize', callback_data: `owner:commission_finalize:${cycleId}` }],
            [{ text: '🔒 Lock', callback_data: `owner:commission_lock:${cycleId}` }],
            this.backRow(),
          ],
        },
      });
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async sendOwnerCommissionPreview(
    account: { id: string; userId: string },
    chatId: number,
    cycleId: string,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !(await this.requireOwner(account))) return;
    try {
      const preview = await this.commissionFinalization.previewCycle(
        this.ownerActor(account, emp.companyId),
        cycleId,
      );
      const t = preview.totals;
      await this.gateway.sendMessage({
        chatId,
        text: [
          '👀 <b>ตัวอย่างค่าคอม</b>',
          `จ่ายรวม: ฿${Math.round(t.totalCommission).toLocaleString()}`,
          `ผู้รับ: ${t.totalRecipients}`,
          `Carry forward: ฿${Math.round(t.carryForward).toLocaleString()}`,
          `Recovery: ฿${Math.round(t.recovery).toLocaleString()}`,
          `Big leader: ฿${Math.round(t.bigLeaderCommission).toLocaleString()}`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async runOwnerCommissionAction(
    account: { id: string; userId: string },
    chatId: number,
    cycleId: string,
    action: 'approve' | 'finalize' | 'lock',
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !(await this.requireOwner(account))) return;
    const actor = this.ownerActor(account, emp.companyId);
    try {
      if (action === 'approve') {
        const row = await this.commissionFinalization.approveCycle(actor, cycleId);
        await this.gateway.sendMessage({ chatId, text: `✅ อนุมัติแล้ว · สถานะ ${row.status}` });
      } else if (action === 'finalize') {
        const result = await this.commissionFinalization.finalizeCycle(actor, cycleId);
        await this.gateway.sendMessage({
          chatId,
          text: `📦 Finalize แล้ว · payroll ${result.payrollItemsCreated} รายการ · สถานะ ${result.cycle.status}`,
        });
      } else {
        const row = await this.commissionFinalization.lockCycle(actor, cycleId);
        await this.gateway.sendMessage({ chatId, text: `🔒 Lock แล้ว · สถานะ ${row.status}` });
      }
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async showOwnerCommissionAdjustmentsMenu(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    try {
      const actor = this.ownerActor(account, emp.companyId);
      const pending = await this.commissionAdjustments.getAdjustments(actor, {
        companyId: emp.companyId,
        status: 'submitted',
      });
      const rows = pending.slice(0, 8).map((adj) => ([{
        text: `${adj.type} · ${adj.direction} ฿${Math.round(adj.adjustmentAmount).toLocaleString()} · ${adj.status}`,
        callback_data: `owner:commission_adj:${adj.id}`,
      }]));
      rows.push(
        [{ text: '📜 ประวัติ', callback_data: 'owner:commission_adj_history' }],
        this.backRow(),
      );
      await this.gateway.sendMessage({
        chatId,
        text: '🛠 <b>ปรับปรุงค่าคอม</b>\nเลือกคำขอรออนุมัติ หรือดูประวัติ',
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: rows },
      });
    } catch (err) {
      this.logger.error('Owner commission adjustments menu failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดคำขอปรับค่าคอมไม่สำเร็จ' });
    }
  }

  private async showOwnerCommissionAdjustmentActions(
    account: { id: string; userId: string },
    chatId: number,
    adjustmentId: string,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !(await this.requireOwner(account))) return;
    try {
      const detail = await this.commissionAdjustments.getAdjustment(
        this.ownerActor(account, emp.companyId),
        adjustmentId,
      );
      await this.gateway.sendMessage({
        chatId,
        text: [
          '🛠 <b>คำขอปรับค่าคอม</b>',
          `สถานะ: <b>${detail.status}</b>`,
          `ประเภท: ${detail.type}`,
          `${detail.direction} ฿${Math.round(detail.adjustmentAmount).toLocaleString()}`,
          `เหตุผล: ${detail.reason}`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: detail.status === 'submitted'
            ? [[{ text: '✅ อนุมัติ', callback_data: `owner:commission_adj_approve:${adjustmentId}` }], this.backRow()]
            : [this.backRow()],
        },
      });
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async runOwnerCommissionAdjustmentAction(
    account: { id: string; userId: string },
    chatId: number,
    adjustmentId: string,
    action: 'approve',
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !(await this.requireOwner(account))) return;
    const actor = this.ownerActor(account, emp.companyId);
    try {
      if (action === 'approve') {
        const row = await this.commissionAdjustments.approveAdjustment(actor, adjustmentId);
        await this.gateway.sendMessage({ chatId, text: `✅ อนุมัติแล้ว · สถานะ ${row.status}` });
      }
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async sendOwnerCommissionAdjustmentHistory(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !(await this.requireOwner(account))) return;
    try {
      const entries = await this.commissionAdjustments.getAdjustmentHistory(
        this.ownerActor(account, emp.companyId),
        { companyId: emp.companyId },
      );
      if (entries.length === 0) {
        await this.gateway.sendMessage({ chatId, text: '📜 ยังไม่มีประวัติการปรับค่าคอม', replyMarkup: { inline_keyboard: [this.backRow()] } });
        return;
      }
      const total = entries.reduce((sum, e) => sum + e.adjustmentAmount, 0);
      const lines = entries.slice(0, 5).map((e) =>
        `· ${e.employeeId.slice(0, 8)} · ${e.adjustmentAmount >= 0 ? '+' : ''}${Math.round(e.adjustmentAmount).toLocaleString()} → net ฿${Math.round(e.netAmount).toLocaleString()}`,
      );
      await this.gateway.sendMessage({
        chatId,
        text: ['📜 <b>ประวัติปรับค่าคอม</b>', ...lines, `รวมปรับ: ฿${Math.round(total).toLocaleString()}`].join('\n'),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
    } catch (err) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async sendOwnerRecruitmentSummary(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    if (!(await this.requireOwner(account))) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึง' });
      return;
    }
    try {
      const [total, uniqueCounted, grouped] = await Promise.all([
        this.prisma.candidate.count({ where: { deletedAt: null } }),
        this.prisma.candidate.count({ where: { deletedAt: null, isUniqueCounted: true } }),
        this.prisma.candidate.groupBy({
          by: ['stage'],
          where: { deletedAt: null },
          _count: { id: true },
        }),
      ]);
      const byStage: Record<string, number> = {};
      for (const g of grouped) byStage[g.stage] = g._count.id;

      await this.gateway.sendMessage({
        chatId,
        text: formatOwnerRecruitmentSummary({ total, uniqueCounted, byStage }),
        parseMode: 'HTML',
      });
    } catch (err) {
      this.logger.error('Owner recruitment summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปการสรรหาไม่สำเร็จ' });
    }
  }

  // ── Announcement broadcasting ───────────────────────────────────────────────

  async broadcastAnnouncement(
    title: string,
    body: string,
    opts?: { companyId?: string; teamId?: string; employeeIds?: string[] },
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    const text = formatAnnouncementMessage(title, body);

    try {
      const accounts = await this.resolveBroadcastTargets(opts);
      for (const acc of accounts) {
        if (!acc.chatId) {
          failed++;
          continue;
        }
        try {
          await this.gateway.sendMessage({
            chatId: Number(acc.chatId),
            text,
            parseMode: 'HTML',
            telegramAccountId: acc.id,
            messageType: 'announcement',
          });
          sent++;
        } catch {
          failed++;
        }
      }
    } catch (err) {
      this.logger.error('broadcastAnnouncement failed', err);
    }

    return { sent, failed };
  }

  private async resolveBroadcastTargets(opts?: {
    companyId?: string;
    teamId?: string;
    employeeIds?: string[];
  }): Promise<Array<{ id: string; chatId: bigint | null }>> {
    const baseWhere = {
      deletedAt: null,
      isActive: true,
      chatId: { not: null } as const,
      user: {
        isActive: true,
        deletedAt: null,
        employeeId: { not: null } as const,
      },
    };

    const accounts = await this.prisma.telegramAccount.findMany({
      where: baseWhere,
      include: {
        user: { select: { employeeId: true } },
      },
    });

    if (!opts?.companyId && !opts?.teamId && !opts?.employeeIds?.length) {
      return accounts.map((a) => ({ id: a.id, chatId: a.chatId }));
    }

    const employeeIdSet = new Set(opts.employeeIds ?? []);
    const filtered: Array<{ id: string; chatId: bigint | null }> = [];

    for (const acc of accounts) {
      const employeeId = acc.user.employeeId;
      if (!employeeId) continue;

      if (employeeIdSet.size > 0 && !employeeIdSet.has(employeeId)) continue;

      if (opts.teamId) {
        const teamAssignment = await this.prisma.employeeAssignment.findFirst({
          where: {
            employeeId,
            teamId: opts.teamId,
            effectiveTo: null,
            deletedAt: null,
          },
        });
        if (!teamAssignment) continue;
      }

      if (opts.companyId) {
        const companyAssignment = await this.prisma.employeeAssignment.findFirst({
          where: {
            employeeId,
            companyId: opts.companyId,
            effectiveTo: null,
            deletedAt: null,
          },
        });
        if (!companyAssignment) continue;
      }

      filtered.push({ id: acc.id, chatId: acc.chatId });
    }

    return filtered;
  }

  private async handleAnnouncementBroadcast(
    account: { id: string; userId: string },
    chatId: number,
    announcementId: string,
  ): Promise<void> {
    try {
      const announcement = await this.prisma.announcement.findFirst({
        where: { id: announcementId, deletedAt: null },
      });
      if (!announcement) {
        await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบประกาศ' });
        return;
      }

      const result = await this.broadcastAnnouncement(
        announcement.title,
        announcement.body ?? '',
        {
          companyId: announcement.companyId ?? undefined,
          teamId: announcement.teamId ?? undefined,
        },
      );

      await this.gateway.sendMessage({
        chatId,
        text: `📢 ส่งประกาศแล้ว ${result.sent} คน${result.failed > 0 ? ` (ล้มเหลว ${result.failed})` : ''}`,
        telegramAccountId: account.id,
      });
    } catch (err) {
      this.logger.error('Announcement broadcast failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ ส่งประกาศไม่สำเร็จ' });
    }
  }

  // ── Session persistence ───────────────────────────────────────────────────

  /**
   * Load session from telegram.telegram_sessions.
   * Creates a fresh row (state='idle', context={}) if none exists.
   * Uses upsert so concurrent webhook deliveries don't race on INSERT.
   */
  private async getOrCreateSession(accountId: string): Promise<SessionRow> {
    const existing = await this.prisma.telegramSession.findFirst({
      where: { telegramAccountId: accountId },
    });
    if (existing) return existing;

    return this.prisma.telegramSession.create({
      data: { id: randomUUID(), telegramAccountId: accountId, state: 'idle', context: {} },
    });
  }

  /**
   * Persist state + context back to the DB.
   * Called after every state transition so restarts resume correctly.
   */
  private async saveSession(
    accountId: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    await this.prisma.telegramSession.updateMany({
      where: { telegramAccountId: accountId },
      data:  { state, context: context as Prisma.InputJsonValue },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveAccount(telegramUserId: number) {
    const acc = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      include: { user: { select: { isActive: true, employeeId: true } } },
    });
    if (!acc) return null;
    if (!acc.user.isActive && !acc.user.employeeId) return null;
    return { id: acc.id, userId: acc.userId, chatId: Number(acc.chatId) };
  }

  private async getEmployeeForUser(userId: string): Promise<{ employeeId: string; companyId: string } | null> {
    const emp = await this.prisma.employee.findFirst({ where: { users: { some: { id: userId } }, deletedAt: null } });
    if (!emp) return null;
    const primary = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId: emp.id, isPrimaryCompany: true, effectiveTo: null, deletedAt: null },
    });
    return primary ? { employeeId: emp.id, companyId: primary.companyId } : null;
  }

  private getMarketingDraft(context: SessionContext): MarketingReportDraft {
    return (context.draft ?? {}) as MarketingReportDraft;
  }

  private async startMarketingReportFlow(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    await this.gateway.sendMessage({
      chatId,
      text: '📊 <b>ส่งยอดการตลาด</b>\nกรุณากรอกวันที่รายงาน (YYYY-MM-DD)\n\nพิมพ์ <code>today</code> สำหรับวันนี้',
      parseMode: 'HTML',
    });
    await this.saveSession(account.id, 'marketing:enter_date', {
      draft: { companyId: emp.companyId, reportDate: today },
    });
  }

  private async handleMarketingText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getMarketingDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    draft.companyId = emp.companyId;

    switch (state) {
      case 'marketing:enter_date': {
        const reportDate = text.trim().toLowerCase() === 'today'
          ? new Date().toISOString().slice(0, 10)
          : this.parseDateInput(text);
        if (!reportDate) {
          await this.gateway.sendMessage({ chatId, text: '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณากรอก YYYY-MM-DD หรือ today:' });
          return;
        }
        draft.reportDate = reportDate;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอก <b>ยอดทักเด็ก</b> (จำนวนเต็ม):', parseMode: 'HTML' });
        await this.saveSession(account.id, 'marketing:enter_contacted', { draft });
        break;
      }
      case 'marketing:enter_contacted': {
        const value = parseInt(text, 10);
        if (Number.isNaN(value) || value < 0) {
          await this.gateway.sendMessage({ chatId, text: '❌ กรุณากรอกตัวเลขจำนวนเต็มที่ไม่ติดลบ' });
          return;
        }
        draft.contactedCount = value;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอก <b>สมาชิกใหม่</b> (จำนวนเต็ม):', parseMode: 'HTML' });
        await this.saveSession(account.id, 'marketing:enter_new_members', { draft });
        break;
      }
      case 'marketing:enter_new_members': {
        const value = parseInt(text, 10);
        if (Number.isNaN(value) || value < 0) {
          await this.gateway.sendMessage({ chatId, text: '❌ กรุณากรอกตัวเลขจำนวนเต็มที่ไม่ติดลบ' });
          return;
        }
        draft.newMemberCount = value;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอก <b>ยอดฝาก</b> (บาท):', parseMode: 'HTML' });
        await this.saveSession(account.id, 'marketing:enter_deposit', { draft });
        break;
      }
      case 'marketing:enter_deposit': {
        const value = parseFloat(text.replace(/,/g, ''));
        if (Number.isNaN(value) || value < 0) {
          await this.gateway.sendMessage({ chatId, text: '❌ กรุณากรอกตัวเลขที่ไม่ติดลบ' });
          return;
        }
        draft.depositAmount = value;
        await this.gateway.sendMessage({ chatId, text: 'กรุณากรอก <b>เด็กลงงาน</b> (จำนวนเต็ม):', parseMode: 'HTML' });
        await this.saveSession(account.id, 'marketing:enter_started', { draft });
        break;
      }
      case 'marketing:enter_started': {
        const value = parseInt(text, 10);
        if (Number.isNaN(value) || value < 0) {
          await this.gateway.sendMessage({ chatId, text: '❌ กรุณากรอกตัวเลขจำนวนเต็มที่ไม่ติดลบ' });
          return;
        }
        draft.startedWorkCount = value;
        await this.gateway.sendMessage({
          chatId,
          text: formatMarketingDailyReportSummary({
            reportDate: draft.reportDate!,
            contactedCount: draft.contactedCount!,
            newMemberCount: draft.newMemberCount!,
            depositAmount: draft.depositAmount!,
            startedWorkCount: draft.startedWorkCount!,
          }),
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [{ text: '✅ ยืนยันส่งรายงาน', callback_data: 'marketing:confirm_submit' }],
              this.backRow(),
            ],
          },
        });
        await this.saveSession(account.id, 'marketing:confirm', { draft });
        break;
      }
      case 'marketing:expense_amount': {
        const value = parseFloat(text.replace(/,/g, ''));
        if (Number.isNaN(value) || value < 0) {
          await this.gateway.sendMessage({ chatId, text: '❌ กรุณากรอกจำนวนเงินที่ไม่ติดลบ' });
          return;
        }
        draft.amount = value;
        await this.gateway.sendMessage({
          chatId,
          text: 'กรุณากรอก <b>รายละเอียด</b> (หรือพิมพ์ - ข้าม):',
          parseMode: 'HTML',
        });
        await this.saveSession(account.id, 'marketing:expense_description', { draft });
        break;
      }
      case 'marketing:expense_description': {
        draft.description = text.trim() === '-' ? undefined : text.trim();
        const categoryLabel = EXPENSE_CATEGORY_LABELS[String(draft.category ?? '')] ?? String(draft.category ?? '');
        await this.gateway.sendMessage({
          chatId,
          text: `💸 <b>ยืนยันบันทึกรายจ่าย</b>\n\nหมวด: ${categoryLabel}\nจำนวน: ${Number(draft.amount ?? 0).toLocaleString('th-TH')} บาท\nรายละเอียด: ${draft.description ?? '-'}`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [{ text: '✅ ยืนยันบันทึก', callback_data: 'marketing:expense_confirm_submit' }],
              this.backRow(),
            ],
          },
        });
        await this.saveSession(account.id, 'marketing:expense_confirm', { draft });
        break;
      }
      default:
        break;
    }
  }

  private async submitMarketingReportDraft(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getMarketingDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !draft.reportDate) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลรายงาน' });
      return;
    }
    try {
      const actor = this.actorFor(account, emp.companyId);
      const saved = await this.marketingReports.createOrUpdateReport(actor, {
        companyId: emp.companyId,
        reportDate: draft.reportDate,
        contactedCount: draft.contactedCount ?? 0,
        newMemberCount: draft.newMemberCount ?? 0,
        depositAmount: draft.depositAmount ?? 0,
        startedWorkCount: draft.startedWorkCount ?? 0,
      });
      await this.marketingReports.submitReport(actor, saved.id);
      await this.gateway.sendMessage({ chatId, text: '✅ ส่งรายงานการตลาดเรียบร้อยแล้ว' });
      await this.saveSession(account.id, 'idle', {});
      await this.showMainMenu(chatId, account.userId);
    } catch (err) {
      this.logger.error('Marketing report submit failed', err);
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async sendMyMarketingKpi(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    try {
      const result = await this.marketingKpi.getMyKpi(this.actorFor(account, emp.companyId));
      if ('error' in result) {
        await this.gateway.sendMessage({ chatId, text: `❌ ${result.error}` });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatMyMarketingKpi(result),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Marketing KPI summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลด KPI ไม่สำเร็จ' });
    }
  }

  private async sendMyLatestMarketingReport(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    try {
      const report = await this.marketingBackOffice.getLatestMyReport(
        this.actorFor(account, emp.companyId),
        emp.companyId,
      );
      if (!report) {
        await this.gateway.sendMessage({ chatId, text: 'ยังไม่มีรายงานการตลาด' });
        return;
      }
      await this.gateway.sendMessage({
        chatId,
        text: formatMyLatestMarketingReport(report),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Latest marketing report failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายงานไม่สำเร็จ' });
    }
  }

  private getMarketingExpenseDraft(context: SessionContext): MarketingExpenseDraft {
    return (context.draft ?? {}) as MarketingExpenseDraft;
  }

  private async startMarketingExpenseFlow(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const categories = Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => ([{
      text: label,
      callback_data: `marketing:expense:cat:${key}`,
    }]));

    await this.gateway.sendMessage({
      chatId,
      text: '💸 <b>บันทึกรายจ่ายการตลาด</b>\nเลือกหมวดค่าใช้จ่าย:',
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [...categories, this.backRow()] },
    });
    await this.saveSession(account.id, 'marketing:expense_category', {
      draft: { companyId: emp.companyId },
    });
  }

  private async onMarketingExpenseCategorySelected(
    account: { id: string; userId: string },
    chatId: number,
    category: string,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getMarketingExpenseDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    draft.companyId = emp.companyId;
    draft.category = category;
    await this.gateway.sendMessage({
      chatId,
      text: `หมวด: <b>${EXPENSE_CATEGORY_LABELS[category] ?? category}</b>\nกรุณากรอก <b>จำนวนเงิน</b> (บาท):`,
      parseMode: 'HTML',
    });
    await this.saveSession(account.id, 'marketing:expense_amount', { draft });
  }

  private async submitMarketingExpenseDraft(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getMarketingExpenseDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp || !draft.category || draft.amount == null) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ กรุณาเริ่มใหม่' });
      return;
    }

    try {
      const actor = this.actorFor(account, emp.companyId);
      const today = new Date().toISOString().slice(0, 10);
      const created = await this.marketingExpenses.createExpense(actor, {
        companyId: emp.companyId,
        category: draft.category as 'advertising',
        amount: draft.amount,
        description: draft.description,
        expenseDate: today,
      });
      await this.marketingExpenses.submitExpense(actor, created.id);
      await this.gateway.sendMessage({
        chatId,
        text: `✅ บันทึกรายจ่าย ${created.amount.toLocaleString('th-TH')} บาท (${created.status})`,
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Marketing expense submit failed', err);
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async sendTeamMarketingExpenses(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const actor = this.actorFor(account, emp.companyId);
      const teamId = await this.getLeaderTeamId(emp.employeeId);
      if (!teamId) {
        await this.gateway.sendMessage({ chatId, text: '❌ คุณไม่ใช่หัวหน้าทีม' });
        return;
      }
      const summary = await this.marketingExpenses.getTeamExpenseSummaryForAi(
        actor,
        emp.companyId,
        teamId,
      );
      await this.gateway.sendMessage({
        chatId,
        text: formatMarketingExpenseSummary(summary),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Team marketing expense summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปรายจ่ายไม่สำเร็จ' });
    }
  }

  private async sendTeamMarketingKpi(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const actor = this.actorFor(account, emp.companyId);
      const teamId = await this.getLeaderTeamId(emp.employeeId);
      if (!teamId) {
        await this.gateway.sendMessage({ chatId, text: '❌ คุณไม่ใช่หัวหน้าทีม' });
        return;
      }
      const kpi = await this.marketingKpi.getTeamKpi(actor, emp.companyId, teamId);
      const lines = [
        '📈 <b>KPI ทีม</b>',
        `รอบ: ${kpi.cycleLabel ?? '-'}`,
        `ผ่าน KPI: ${kpi.qualifiedCount}`,
        `เสี่ยง: ${kpi.atRiskCount}`,
        `เสี่ยงสูง: ${kpi.highRiskCount}`,
      ];
      await this.gateway.sendMessage({
        chatId,
        text: lines.join('\n'),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Team marketing KPI failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลด KPI ทีมไม่สำเร็จ' });
    }
  }

  private async sendMarketingCompanyOverview(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const actor = this.actorFor(account, emp.companyId);
      const kpi = await this.marketingKpi.getCompanyKpi(actor, emp.companyId);
      const lines = [
        '📊 <b>ภาพรวมการตลาด</b>',
        `พนักงาน: ${kpi.totalEmployees}`,
        `ผ่าน KPI: ${kpi.passedKpi}`,
        `ไม่ผ่าน: ${kpi.failedKpi}`,
        `อัตราสำเร็จ: ${kpi.successRatePercent}%`,
      ];
      if (kpi.teamBreakdown?.length) {
        lines.push('', '<b>ทีม</b>');
        for (const team of kpi.teamBreakdown) {
          lines.push(`• ${team.teamName}: ผ่าน ${team.passedKpi}/${team.totalEmployees}`);
        }
      }
      await this.gateway.sendMessage({
        chatId,
        text: lines.join('\n'),
        parseMode: 'HTML',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      await this.saveSession(account.id, 'idle', {});
    } catch (err) {
      this.logger.error('Marketing company overview failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดภาพรวมไม่สำเร็จ' });
    }
  }
}
