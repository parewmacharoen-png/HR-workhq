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

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional, forwardRef } from '@nestjs/common';
import { DisciplinaryActionService } from '../../disciplinary/application/disciplinary-action.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import {
  TelegramState, SessionContext,
} from '../domain/entities/telegram-session.types';
import {
  formatTelegramHelpText,
  TELEGRAM_BOT_COMMANDS,
} from '../domain/telegram-bot-commands';
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
import { AppConfigService } from '../../../config/app-config.service';
import {
  isMarketingMenuState,
  isMarketingOwnerCallback,
} from '../../../config/marketing-feature.constants';
import {
  formatAnnouncementMessage,
  formatCommissionSummary,
  formatCompanySummary,
  formatEveningReport,
  formatMorningReport,
  formatNameBulletSection,
  formatOwnerCompanySummary,
  formatOwnerFinanceSummary,
  formatOwnerPayrollSummary,
  formatOwnerRecruitmentSummary,
  formatOwnerCommissionSummary,
  formatExecutiveBriefSection,
  formatPersonalDailyReport,
  formatReferralStatus,
  formatTeamAttendanceDashboard,
  formatMyMarketingKpi,
  formatMarketingDailyReportSummary,
  formatMyLatestMarketingReport,
  formatMarketingExpenseSummary,
} from '../domain/telegram-report.formatter';
import {
  type AttendanceSummaryCategory,
  filterHistoryByCategory,
  filterHistoryByMonth,
  formatAttendanceCategoryDetail,
  formatMonthlyAttendanceSummary,
  shiftMonth,
  summarizeMonthHistory,
} from '../domain/telegram-attendance-summary.formatter';
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
import { KnowledgeAssistantService } from '../../ai/application/knowledge-assistant.service';
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
import { TelegramVerificationService } from './telegram-verification.service';
import { TelegramDeclarationCorrectionService } from './telegram-declaration-correction.service';
import { TelegramIdentityGuard } from '../../security/application/telegram-identity-guard.service';
import { TelegramIdentityService } from '../../security/application/telegram-identity.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { PayrollPdfService } from '../../payroll/application/payroll-pdf.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { RequestPlatformTelegramHandler } from './request-platform.handler';
import { UnifiedApprovalInboxHandler } from './unified-approval-inbox.handler';
import { ApprovalRequestContextService } from './approval-request-context.service';
import { TelegramApprovalNotifier } from './telegram-approval.notifier';
import { SalaryReviewService } from '../../salary-review/application/salary-review.service';
import { PromotionReviewService } from '../../salary-review/application/promotion-review.service';
import { AttendanceCorrectionService } from '../../attendance/application/attendance-correction.service';
import { MonthlyOffService } from '../../attendance/application/monthly-off.service';
import { WorkDayService } from '../../workday/application/workday.service';
import { WorkDayDailyBriefService } from '../../workday/application/workday-daily-brief.service';
import { WorkforceRiskService } from '../../workforce-risk/application/workforce-risk.service';
import { CompanyCalendarAggregatorService } from '../../workday/application/company-calendar-aggregator.service';
import { RISK_RECOMMENDATION_LABELS } from '../../workforce-risk/domain/workforce-risk.types';
import {
  buildAttendanceMenuKeyboard,
  buildEmployeeMainMenu,
  buildEmployeeMoreMenuKeyboard,
  buildEmployeeReplyKeyboard,
  buildEmployeeTodayHeader,
  buildOperatorReplyKeyboard,
  buildOpsMoreMenuKeyboard,
  buildOperatorMainMenu,
  buildOwnerMainMenu,
  formatTelegramMenuDebugFooter,
  isLegacyMainMenuState,
  isTelegramSubLeaderRole,
  MENU_CLOSE,
  REPLY_KEYBOARD_HOME,
  resolveReplyKeyboardState,
  toInlineKeyboard,
  toReplyKeyboardMarkup,
  type TelegramMenuButton,
} from './telegram-menu.builder';
import { CORRECTION_FIELDS } from '../../attendance/application/dto/attendance-correction.dto';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import {
  formatIsoDateAsDdMmYyyy,
  parseThaiDateInput,
  parseThaiDateListInput,
  THAI_DATE_INPUT_ERROR,
  THAI_DATE_INPUT_HINT,
  THAI_MULTI_DATE_INPUT_HINT,
} from '../../../shared/time/thai-date-input.util';
import {
  parseThaiTimeInput,
  THAI_TIME_INPUT_HINT,
  THAI_TIME_VALIDATION_ERROR,
} from '../../../shared/time/thai-time-input.util';
import {
  formatPayrollPeriodRangeTh,
  groupDatesByPayrollPeriod,
  monthlyOffReportingWindow,
} from '../../../shared/time/payroll-period.util';
import { buildMonthlyOffSubmitTelegramMessage } from '../../attendance/domain/monthly-off-submit-message.util';
import {
  expandDateRangeIso,
  formatNoticePeriodHint,
  formatShortNoticeWarning,
  shortNoticeDates,
} from '../../leave/domain/services/leave-notice.util';
import { DEFAULT_LEAVE_RULES } from '../../settings/domain/leave-settings.types';
import { WORKHQ_BUILD } from '../../../shared/build-info';
import { EmployeeReferralService } from '../../request/application/employee-referral.service';
import { EmployeeReferralTelegramHandler } from './employee-referral.handler';
import { DocumentCenterTelegramHandler } from '../../document-center/application/document-center.handler';
import { AnnouncementTelegramHandler } from '../../announcement/application/announcement.handler';
import { TeamCalendarTelegramHandler } from '../../calendar/application/team-calendar.handler';
import { TrainingTelegramHandler } from '../../training/application/training.handler';
import { HrSummaryTelegramHandler } from '../../hr-analytics/application/hr-summary.handler';
import { Phase2TelegramHandler } from './phase2-telegram.handler';
import { TelegramInviteLinkHandler } from '../../employee-onboarding/application/telegram-invite-link.handler';
import { TelegramOperatorLinkHandler } from './telegram-operator-link.handler';
import { OperatorTelegramInviteService } from '../../permission/application/operator-telegram-invite.service';
import { TelegramSelfOnboardingHandler } from '../../employee-onboarding/application/telegram-self-onboarding.handler';
import { TelegramSelfOnboardingHrHandler } from '../../employee-onboarding/application/telegram-self-onboarding-hr.handler';
import { AttendanceAlertService } from '../../attendance/application/attendance-alert.service';
import { FinalSettlementService } from '../../exit/application/final-settlement.service';
import { ExitCaseService } from '../../exit/application/exit-case.service';
import { WorkflowEntityType } from '../../workflow/domain/entities/workflow.entity';
import { normalizeCallbackSourceMessage, normalizeTelegramCommand, type TelegramSourceMessage } from './telegram-callback-message.util';

const WORKFLOW_ENTITY_TYPES = new Set<string>([
  'leave', 'leave_reschedule', 'leave_shift_swap', 'overtime', 'monthly_off', 'advance',
  'attendance_correction', 'deposit_refund', 'payroll_adjustment',
  'commission_adjustment', 'performance_review', 'employee_exit', 'bonus',
  'document_request',
]);

const CUSTOM_APPROVAL_TYPES = new Set<string>([
  'salary_review', 'promotion_review', 'referral', 'exit_settlement', 'exit_case',
]);

const EMPLOYEE_PERMISSION_KEYS = [
  'attendance:read', 'attendance:write', 'leave:read', 'leave:write', 'ai:chat',
] as const;

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
  durationType?: string;
  durationLabel?: string;
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

interface AttendanceCorrectionDraft extends Record<string, unknown> {
  field?: string;
  fieldLabel?: string;
  correctedAt?: string;
  reason?: string;
  workDate?: string;
}

interface DocumentRequestDraft extends Record<string, unknown> {
  typeKey?: string;
  typeName?: string;
  requestId?: string;
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
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private polling = false;
  private pollingAbort: AbortController | null = null;

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
    private readonly knowledgeAssistant: KnowledgeAssistantService,
    private readonly aiConversations: AiConversationService,
    private readonly marketingReports: MarketingDailyReportService,
    private readonly marketingKpi: MarketingKpiQueryService,
    private readonly marketingBackOffice: MarketingBackOfficeService,
    private readonly marketingExpenses: MarketingExpenseService,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly commissionFinalization: CommissionFinalizationService,
    private readonly commissionAdjustments: CommissionAdjustmentService,
    private readonly onboarding: TelegramOnboardingService,
    private readonly verification: TelegramVerificationService,
    private readonly declarationCorrection: TelegramDeclarationCorrectionService,
    private readonly identityGuard: TelegramIdentityGuard,
    private readonly identities: TelegramIdentityService,
    private readonly salaryVisibility: SalaryVisibilityService,
    @Inject(forwardRef(() => PayrollPdfService))
    private readonly payrollPdf: PayrollPdfService,
    private readonly appConfig: AppConfigService,
    @Inject(GLOBAL_ID_SEQUENCE) private readonly globalIdSequence: GlobalIdSequence,
    @Inject(forwardRef(() => DisciplinaryActionService))
    private readonly disciplinary: DisciplinaryActionService,
    @Inject(forwardRef(() => PerformanceService))
    private readonly performance: PerformanceService,
    private readonly approvalContext: ApprovalRequestContextService,
    private readonly approvalNotifier: TelegramApprovalNotifier,
    @Inject(forwardRef(() => SalaryReviewService))
    private readonly salaryReviews: SalaryReviewService,
    @Inject(forwardRef(() => PromotionReviewService))
    private readonly promotionReviews: PromotionReviewService,
    @Inject(forwardRef(() => AttendanceCorrectionService))
    private readonly attendanceCorrections: AttendanceCorrectionService,
    private readonly monthlyOff: MonthlyOffService,
    @Inject(forwardRef(() => WorkDayService))
    private readonly workdays: WorkDayService,
    @Inject(forwardRef(() => WorkDayDailyBriefService))
    private readonly workdayBriefs: WorkDayDailyBriefService,
    @Inject(forwardRef(() => WorkforceRiskService))
    private readonly workforceRisk: WorkforceRiskService,
    @Inject(forwardRef(() => CompanyCalendarAggregatorService))
    private readonly companyCalendar: CompanyCalendarAggregatorService,
    @Inject(forwardRef(() => EmployeeReferralService))
    private readonly employeeReferrals: EmployeeReferralService,
    @Inject(forwardRef(() => FinalSettlementService))
    private readonly finalSettlements: FinalSettlementService,
    @Inject(forwardRef(() => ExitCaseService))
    private readonly exitCases: ExitCaseService,
    private readonly bangkokTime: BangkokTimeProvider,
    @Inject(forwardRef(() => RequestPlatformTelegramHandler))
    private readonly requestPlatform?: RequestPlatformTelegramHandler,
    @Inject(forwardRef(() => UnifiedApprovalInboxHandler))
    private readonly unifiedInbox?: UnifiedApprovalInboxHandler,
    @Inject(forwardRef(() => EmployeeReferralTelegramHandler))
    private readonly employeeReferralHandler?: EmployeeReferralTelegramHandler,
    @Inject(forwardRef(() => DocumentCenterTelegramHandler))
    private readonly documentCenterHandler?: DocumentCenterTelegramHandler,
    @Inject(forwardRef(() => AnnouncementTelegramHandler))
    private readonly announcementHandler?: AnnouncementTelegramHandler,
    @Inject(forwardRef(() => TeamCalendarTelegramHandler))
    private readonly teamCalendarHandler?: TeamCalendarTelegramHandler,
    @Optional() @Inject(forwardRef(() => TrainingTelegramHandler))
    private readonly trainingHandler?: TrainingTelegramHandler,
    @Optional() @Inject(forwardRef(() => HrSummaryTelegramHandler))
    private readonly hrSummaryHandler?: HrSummaryTelegramHandler,
    @Optional() @Inject(forwardRef(() => Phase2TelegramHandler))
    private readonly phase2Handler?: Phase2TelegramHandler,
    @Optional() @Inject(forwardRef(() => TelegramInviteLinkHandler))
    private readonly inviteLinkHandler?: TelegramInviteLinkHandler,
    @Optional() private readonly operatorLinkHandler?: TelegramOperatorLinkHandler,
    @Optional() private readonly operatorInvites?: OperatorTelegramInviteService,
    @Optional() @Inject(forwardRef(() => TelegramSelfOnboardingHandler))
    private readonly selfOnboardingHandler?: TelegramSelfOnboardingHandler,
    @Optional() @Inject(forwardRef(() => TelegramSelfOnboardingHrHandler))
    private readonly selfOnboardingHrHandler?: TelegramSelfOnboardingHrHandler,
    @Optional() @Inject(forwardRef(() => AttendanceAlertService))
    private readonly attendanceAlerts?: AttendanceAlertService,
  ) {}

  private get marketingEnabled(): boolean {
    return this.appConfig.marketingEnabled;
  }

  private async sendMarketingDisabled(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: 'ℹ️ ฟีเจอร์การตลาดไม่เปิดใช้งานใน WorkHQ HR',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  /**
   * Register the webhook with Telegram on startup, or start long-polling in local dev.
   * Idempotent: Telegram ignores duplicate setWebhook calls for the same URL.
   */
  async onModuleInit(): Promise<void> {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
      return;
    }

    await this.registerBotCommands();

    const usePolling = process.env['TELEGRAM_USE_POLLING'] === 'true'
      || process.env['NODE_ENV'] === 'development';

    if (usePolling) {
      await this.startPolling(token);
      return;
    }

    const webhookUrl = process.env['TELEGRAM_WEBHOOK_URL'];
    const secret = process.env['TELEGRAM_WEBHOOK_SECRET'];
    if (!webhookUrl) {
      this.logger.warn('TELEGRAM_WEBHOOK_URL not set — skipping webhook registration');
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

  private async registerBotCommands(): Promise<void> {
    const result = await this.gateway.setMyCommands(TELEGRAM_BOT_COMMANDS);
    if (result.ok) {
      this.logger.log(`Telegram slash commands registered (${TELEGRAM_BOT_COMMANDS.length})`);
    } else {
      this.logger.warn(
        `Telegram setMyCommands failed — "/" suggestions may not appear${result.error ? `: ${result.error}` : ''}`,
      );
    }

    const menuButton = await this.gateway.setChatMenuButton();
    if (menuButton.ok) {
      this.logger.log('Telegram menu button set to commands');
    } else {
      this.logger.warn(
        `Telegram setChatMenuButton failed — blue Menu button may not appear${menuButton.error ? `: ${menuButton.error}` : ''}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.polling = false;
    this.pollingAbort?.abort();
  }

  private async startPolling(token: string): Promise<void> {
    const webhookCleared = await this.clearTelegramWebhook(token);
    if (!webhookCleared) {
      this.logger.warn(
        'Telegram webhook may still be active — polling will retry; bot may stay silent until webhook is cleared',
      );
    }

    this.polling = true;
    this.pollingAbort = new AbortController();
    this.logger.log('Telegram long-polling started (development mode)');
    void this.pollLoop(token);
    void this.registerBotCommands();
  }

  private async clearTelegramWebhook(token: string): Promise<boolean> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drop_pending_updates: false }),
        });
        const data = await res.json() as { ok: boolean; description?: string };
        if (data.ok) return true;
        this.logger.error(`Telegram deleteWebhook failed: ${data.description}`);
        return false;
      } catch (err) {
        this.logger.warn(`Telegram deleteWebhook attempt ${attempt}/5 failed`, err);
        if (attempt < 5) await this.sleep(2_000 * attempt);
      }
    }
    return false;
  }

  private async pollLoop(token: string): Promise<void> {
    let offset = 0;
    while (this.polling) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`,
          { signal: this.pollingAbort?.signal },
        );
        const data = await res.json() as {
          ok: boolean;
          result?: TelegramUpdate[];
          description?: string;
        };
        if (!data.ok) {
          const description = data.description ?? 'unknown';
          this.logger.error(`Telegram getUpdates failed: ${description}`);
          if (/webhook/i.test(description)) {
            await this.clearTelegramWebhook(token);
          }
          await this.sleep(5_000);
          continue;
        }
        for (const update of data.result ?? []) {
          offset = Math.max(offset, update.update_id + 1);
          await this.handleUpdate(update).catch((err) => {
            this.logger.error(`Telegram update ${update.update_id} failed`, err);
          });
        }
      } catch (err) {
        if (this.pollingAbort?.signal.aborted) return;
        this.logger.error('Telegram polling error', err);
        await this.sleep(5_000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        await this.handleOnboardingCallback(account, chatId, update.callback_query.data ?? '', state, context, from);
        return;
      }

      const text = update.message?.text?.trim() ?? '';
      if (await this.tryInviteLinkStart(account, chatId, text, from)) return;
      if (await this.trySelfOnboardingMedia(account, chatId, update, state, context, from)) return;
      if (await this.handleUnverifiedOnboardingCommand(account, chatId, text, state, from)) return;

      await this.handleOnboardingText(account, chatId, text, state, context, from);
      return;
    }

    chatId = chatId ?? account.chatId;
    if (!chatId) return;

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
        await this.handleOnboardingCallback(account, chatId, update.callback_query.data ?? '', state, context, from);
        return;
      }

      const text = update.message?.text?.trim() ?? '';
      if (await this.tryInviteLinkStart(account, chatId, text, from)) return;
      if (await this.trySelfOnboardingMedia(account, chatId, update, state, context, from)) return;
      if (await this.handleUnverifiedOnboardingCommand(account, chatId, text, state, from)) return;

      await this.handleOnboardingText(account, chatId, text, state, context, from);
      return;
    }

    await this.dispatchVerifiedUser(account, from, update, chatId);
  }

  private async dispatchVerifiedUser(
    account: { id: string; userId: string; chatId: number },
    from: { id: number; username?: string; first_name?: string; last_name?: string },
    update: TelegramUpdate,
    chatId: number,
  ): Promise<void> {
    const accessState = await this.identityGuard.getAccessState(from.id);
    if (accessState === 'revoked') {
      await this.gateway.sendMessage({
        chatId,
        text: this.identityGuard.accessDeniedMessage('revoked'),
      });
      return;
    }
    if (accessState === 'pending') {
      const session = await this.getOrCreateSession(account.id);
      const state = (session.state as TelegramState) ?? 'idle';
      const context = (session.context as SessionContext | null) ?? {};
      const text = update.message?.text?.trim() ?? '';

      if (update.callback_query) {
        await this.gateway.answerCallbackQuery(update.callback_query.id);
        const data = update.callback_query.data ?? '';
        const sourceMessage = update.callback_query.message ?? undefined;
        await this.disableCallbackButtons(sourceMessage);
        if (await this.tryHandleRequestPlatformCallback(account, chatId, data, context, sourceMessage)) {
          return;
        }
        if (state === 'self_onboarding_active' && this.selfOnboardingHandler) {
          await this.selfOnboardingHandler.handleCallback(
            account,
            chatId,
            data,
            context,
            (id, s, ctx) => this.saveSession(id, s, ctx),
          );
        } else if (
          data.startsWith('so:')
          && this.selfOnboardingHandler
        ) {
          const resolved = await this.resolveSelfOnboardingContext(account, state, context, {
            forceResume: true,
          });
          await this.selfOnboardingHandler.handleCallback(
            account,
            chatId,
            data,
            resolved.context,
            (id, s, ctx) => this.saveSession(id, s, ctx),
          );
        } else {
          await this.handleOnboardingCallback(account, chatId, data, state, context, from);
        }
        return;
      }

      if (await this.tryInviteLinkStart(account, chatId, text, from)) return;

      if (text === '/start') {
        if (await this.tryRestartSelfOnboarding(account, chatId)) return;
        const refreshedAccess = await this.identityGuard.getAccessState(from.id);
        if (refreshedAccess === 'active') {
          await this.showMainMenu(chatId, account.userId);
          await this.saveSession(account.id, 'idle', {});
          return;
        }
      }
      if (text === '/status' || text === '/start') {
        await this.verification.showRegistrationStatus(chatId, from.id);
        return;
      }
      if (await this.dispatchSelfOnboardingMessage(account, chatId, update, state, context, from)) {
        return;
      }
      await this.verification.showRegistrationStatus(chatId, from.id);
      return;
    }
    if (accessState === 'unverified') {
      await this.startOnboarding(account.id, chatId);
      return;
    }

    await this.identities.touchLastSeen(from.id);

    const session = await this.getOrCreateSession(account.id);
    let state = (session.state as TelegramState) ?? 'idle';
    let context = (session.context as SessionContext | null) ?? {};

    context = await this.ensureUserChatMenu(account, chatId, state, context);

    if (update.callback_query) {
      await this.logInbound(account.id, update);
      await this.gateway.answerCallbackQuery(update.callback_query.id);
      const data = update.callback_query.data ?? '';
      const sourceMessage = update.callback_query.message ?? undefined;
      // Always remove buttons from the clicked message so old menus can't be re-used.
      await this.disableCallbackButtons(sourceMessage);
      if (await this.tryHandleRequestPlatformCallback(account, chatId, data, context, sourceMessage)) {
        return;
      }
      if (state === 'self_onboarding_active') {
        await this.saveSession(account.id, 'idle', {});
        await this.handleCallback(account, chatId, data, 'idle', {}, sourceMessage);
        return;
      }
      await this.handleCallback(account, chatId, data, state, context, sourceMessage);
      return;
    }

    const text = update.message?.text?.trim() ?? '';

    if (!update.callback_query && (await this.tryInviteLinkStart(account, chatId, text, from))) {
      await this.logInbound(account.id, update);
      return;
    }

    if (text === '/start' || text === '/menu' || text === '🏠 Home' || text === '📋 เมนู') {
      await this.logInbound(account.id, update);
      await this.showMainMenu(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    if (await this.dispatchSelfOnboardingMessage(account, chatId, update, state, context, from)) {
      await this.logInbound(account.id, update);
      return;
    }

    await this.logInbound(account.id, update);

    if (text === '/debug_menu') {
      await this.handleDebugMenu(chatId, account.userId);
      return;
    }

    if (text === '/help') {
      await this.gateway.sendMessage({
        chatId,
        text: formatTelegramHelpText(),
        parseMode: 'HTML',
        replyMarkup: await this.getReplyKeyboardMarkup(account.userId),
      });
      return;
    }

    if (text === '/status') {
      await this.verification.showRegistrationStatus(chatId, from.id);
      return;
    }

    if (text === '/report' || text.startsWith('/report ')) {
      await this.handleReportCommand(account, chatId, text);
      return;
    }

    if (text === '/today') {
      await this.sendPersonalDailyReport(account, chatId);
      return;
    }

    if (text === '/morning') {
      await this.sendMorningReport(account, chatId);
      return;
    }

    if (text === '/evening') {
      await this.sendEveningReport(account, chatId);
      return;
    }

    if (text === '/company') {
      await this.sendCompanySummaryReport(account, chatId);
      return;
    }

    if (normalizeTelegramCommand(text) === '/checkin') {
      await this.showCheckInLocationPicker(chatId, account.userId);
      await this.saveSession(account.id, 'attendance:confirming_checkin', {
        draft: { parentMenu: 'home' },
      });
      return;
    }

    if (normalizeTelegramCommand(text) === '/checkout') {
      await this.showAttendanceMenu(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    if (text === '/attendance' || text === '/mysummary') {
      await this.showMonthlyAttendanceSummary(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    if (await this.tryHandleReplyKeyboardButton(account, chatId, text, state, context)) {
      return;
    }

    if (state === 'idle' && await this.tryHandleAttendanceTextShortcut(account, chatId, text)) {
      return;
    }

    if (text === '/brief' || text === '/urgent') {
      const emp = await this.getEmployeeForUser(account.userId);
      if (this.phase2Handler && emp?.companyId && emp.employeeId) {
        const action = text === '/brief' ? 'brief' : 'urgent';
        const reply = await this.phase2Handler.handleAiManagerMenu(emp.employeeId, emp.companyId, action);
        await this.gateway.sendMessage({ chatId, text: reply });
        return;
      }
    }

    await this.handleTextInState(account, chatId, text, state, context, from);
  }

  private async clearLegacyReplyKeyboard(chatId: number): Promise<void> {
    await this.gateway.removeReplyKeyboard(chatId);
  }

  private async sendMenuWithReplyKeyboard(
    chatId: number,
    sourceMessage: { message_id: number; chat: { id: number } } | undefined | unknown,
    text: string,
    replyKeyboard: TelegramMenuButton[][],
  ): Promise<void> {
    const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
    if (source) {
      await this.gateway.editMessageReplyMarkup(source.chat.id, source.message_id, {
        inline_keyboard: [],
      });
    }
    await this.gateway.sendMessage({
      chatId,
      text: (text ?? '').trim() || '…',
      parseMode: 'HTML',
      replyMarkup: toReplyKeyboardMarkup(replyKeyboard),
    });
  }

  private async buildReplyKeyboardRowsForUser(
    userId: string,
  ): Promise<TelegramMenuButton[][] | null> {
    const isOperator = await this.isOperatorUser(userId);
    if (isOperator) {
      const companies = await this.listAccessibleCompanies(userId);
      return buildOperatorReplyKeyboard({ multiCompany: companies.length > 1 });
    }
    const emp = await this.getEmployeeForUser(userId);
    if (!emp) return null;
    const roleContext = await this.resolveTelegramRoleContext(userId);
    const day = await this.workdays.getTodayStatus(emp.employeeId);
    return buildEmployeeReplyKeyboard(day, {
      isSubLeader: roleContext.isSubLeader,
      isSecretary: roleContext.isSecretary,
      isBigLeader: roleContext.isBigLeader,
      isOwner: roleContext.isOwner,
    });
  }

  private async getReplyKeyboardMarkup(
    userId: string,
  ): Promise<ReturnType<typeof toReplyKeyboardMarkup> | undefined> {
    const rows = await this.buildReplyKeyboardRowsForUser(userId);
    return rows ? toReplyKeyboardMarkup(rows) : undefined;
  }

  private async ensureUserChatMenu(
    account: { id: string },
    chatId: number,
    state: TelegramState,
    context: SessionContext,
  ): Promise<SessionContext> {
    if (context.chatMenuButtonSynced) return context;
    await this.gateway.setChatMenuButton(chatId);
    const nextContext = { ...context, chatMenuButtonSynced: true };
    await this.saveSession(account.id, state, nextContext);
    return nextContext;
  }

  private async tryHandleReplyKeyboardButton(
    account: { id: string; userId: string; chatId: number },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
  ): Promise<boolean> {
    const rows = await this.buildReplyKeyboardRowsForUser(account.userId);
    if (!rows) return false;
    const callbackState = resolveReplyKeyboardState(text, rows);
    if (!callbackState) return false;
    await this.handleCallback(account, chatId, callbackState, state, context, undefined);
    return true;
  }

  private async handleDebugMenu(chatId: number, userId: string): Promise<void> {
    await this.clearLegacyReplyKeyboard(chatId);
    const roleContext = await this.resolveTelegramRoleContext(userId);
    const emp = await this.getEmployeeForUser(userId);
    const menuKind: 'employee' | 'owner' = roleContext.isOwner ? 'owner' : 'employee';

    if (!emp) {
      await this.gateway.sendMessage({
        chatId,
        text: [
          formatTelegramMenuDebugFooter({
            menuKind,
            businessRole: roleContext.businessRole,
            buildSha: WORKHQ_BUILD,
          }),
          '',
          'No employee record for this user.',
        ].join('\n'),
      });
      return;
    }

    const day = await this.workdays.getTodayStatus(emp.employeeId);
    const { header, keyboard } = roleContext.isOwner
      ? buildOwnerMainMenu(day, {
        marketingEnabled: this.marketingEnabled,
        includeClose: true,
      })
      : buildEmployeeMainMenu(day, {
        isSubLeader: roleContext.isSubLeader,
        marketingEnabled: this.marketingEnabled,
        includeClose: true,
      });
    const rows = keyboard.flat().map((b) => `- ${b.label}`).join('\n');
    const text = [
      formatTelegramMenuDebugFooter({
        menuKind,
        businessRole: roleContext.businessRole,
        buildSha: WORKHQ_BUILD,
      }),
      '',
      'Menu rows:',
      rows,
      '',
      header,
    ].join('\n');
    await this.gateway.sendMessage({
      chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: toInlineKeyboard(keyboard) },
    });
  }

  private async showMainMenu(
    chatId: number,
    userId: string,
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const roleContext = await this.resolveTelegramRoleContext(userId);
    const emp = await this.getEmployeeForUser(userId);

    if (emp) {
      await this.showEmployeeTodayMenu(chatId, emp.employeeId, roleContext, sourceMessage);
      return;
    }

    const isOperator = await this.isOperatorUser(userId);
    if (isOperator) {
      await this.showOperatorMenu(chatId, userId, roleContext, sourceMessage);
      return;
    }

    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      '📍 <b>WorkHQ</b>\nไม่พบข้อมูลพนักงาน',
      { inline_keyboard: [[{ text: MENU_CLOSE.label, callback_data: MENU_CLOSE.state }]] },
    );
  }

  private async showOperatorMenu(
    chatId: number,
    userId: string,
    roleContext: { businessRole: string | null },
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    const companies = await this.listAccessibleCompanies(userId);
    const companyId = await this.resolveActorCompanyId(userId, account?.id);
    const company = companies.find((c) => c.id === companyId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { displayName: true, username: true },
    });
    const { header } = buildOperatorMainMenu({
      displayName: user?.displayName?.trim() || user?.username,
      businessRole: roleContext.businessRole,
      companyName: company?.name,
      multiCompany: companies.length > 1,
      companyCount: companies.length,
      includeClose: true,
    });
    const replyKeyboard = buildOperatorReplyKeyboard({ multiCompany: companies.length > 1 });
    await this.sendMenuWithReplyKeyboard(chatId, sourceMessage, header, replyKeyboard);
  }

  private async isOperatorUser(userId: string): Promise<boolean> {
    return this.operatorInvites?.isVerifiedOperator(userId) ?? false;
  }

  private async listAccessibleCompanies(
    userId: string,
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    const companyIds = new Set<string>();

    const grants = await this.prisma.scopeGrant.findMany({
      where: { userId, deletedAt: null },
      select: { scopeType: true, companyId: true },
    });

    if (grants.some((g) => g.scopeType === 'all')) {
      return this.prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });
    }

    for (const grant of grants) {
      if (grant.scopeType === 'company' && grant.companyId) {
        companyIds.add(grant.companyId);
      }
    }

    const employee = await this.prisma.employee.findFirst({
      where: { users: { some: { id: userId } }, deletedAt: null },
      select: { id: true },
    });
    if (employee) {
      const assignments = await this.prisma.employeeAssignment.findMany({
        where: { employeeId: employee.id, effectiveTo: null, deletedAt: null },
        select: { companyId: true },
      });
      for (const assignment of assignments) {
        companyIds.add(assignment.companyId);
      }
    }

    if (!companyIds.size) return [];

    return this.prisma.company.findMany({
      where: { id: { in: [...companyIds] }, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  private async resolveActorCompanyId(
    userId: string,
    telegramAccountId?: string,
  ): Promise<string | null> {
    const companies = await this.listAccessibleCompanies(userId);
    if (!companies.length) return null;

    if (telegramAccountId) {
      const session = await this.getOrCreateSession(telegramAccountId);
      const draft = (session.context as SessionContext | null)?.draft as { operatorCompanyId?: string } | undefined;
      if (draft?.operatorCompanyId && companies.some((c) => c.id === draft.operatorCompanyId)) {
        return draft.operatorCompanyId;
      }
    }

    return companies[0]?.id ?? null;
  }

  private async showOperatorCompanyPicker(
    account: { id: string; userId: string },
    chatId: number,
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const companies = await this.listAccessibleCompanies(account.userId);
    if (!companies.length) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบบริษัทที่เข้าถึงได้' });
      return;
    }
    const rows = companies.map((c) => [{ text: c.name, callback_data: `operator:company:${c.id}` }]);
    rows.push(this.backRow());
    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      '🏢 <b>เลือกบริษัท</b>\nรายงานและอนุมัติจะอิงตามบริษัทที่เลือก',
      { inline_keyboard: rows },
    );
  }

  private async resolveTelegramRoleContext(userId: string): Promise<{
    isOwner: boolean;
    isSecretary: boolean;
    isBigLeader: boolean;
    isSubLeader: boolean;
    businessRole: string | null;
  }> {
    const assignment = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    const businessRole = assignment?.role ?? 'employee';
    const isOwner = businessRole === 'owner';
    const isSecretary = businessRole === 'secretary';
    const isBigLeader = businessRole === 'big_leader';
    const isSubLeader = isTelegramSubLeaderRole(businessRole);
    return { isOwner, isSecretary, isBigLeader, isSubLeader, businessRole };
  }

  private async showOwnerMenu(
    chatId: number,
    employeeId: string,
    roleContext: { businessRole: string | null },
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const day = await this.workdays.getTodayStatus(employeeId);
    const { header, keyboard } = buildOwnerMainMenu(day, {
      marketingEnabled: this.marketingEnabled,
      includeClose: true,
    });

    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      header,
      { inline_keyboard: toInlineKeyboard(keyboard) },
    );
  }

  private async showEmployeeTodayMenu(
    chatId: number,
    employeeId: string,
    roleContext: {
      isSubLeader: boolean;
      isSecretary: boolean;
      isBigLeader: boolean;
      isOwner: boolean;
      businessRole: string | null;
    },
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const day = await this.workdays.getTodayStatus(employeeId);
    const calendarDateIso = this.bangkokTime.workDateString();
    const { header } = buildEmployeeMainMenu(day, {
      isSubLeader: roleContext.isSubLeader,
      marketingEnabled: this.marketingEnabled,
      includeClose: true,
      calendarDateIso,
    });
    const replyKeyboard = buildEmployeeReplyKeyboard(day, {
      isSubLeader: roleContext.isSubLeader,
      isSecretary: roleContext.isSecretary,
      isBigLeader: roleContext.isBigLeader,
      isOwner: roleContext.isOwner,
    });
    await this.sendMenuWithReplyKeyboard(chatId, sourceMessage, header, replyKeyboard);
  }

  private async showAttendanceMenu(
    chatId: number,
    userId: string,
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const day = await this.workdays.getTodayStatus(emp.employeeId);
    const calendarDateIso = this.bangkokTime.workDateString();
    const header = buildEmployeeTodayHeader(day, { calendarDateIso });
    const keyboard = buildAttendanceMenuKeyboard(day);
    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      ['⏰ <b>เข้า-ออกงาน</b>', '', header].join('\n'),
      { inline_keyboard: toInlineKeyboard(keyboard) },
    );
  }

  private async tryHandleAttendanceTextShortcut(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
  ): Promise<boolean> {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const command = normalizeTelegramCommand(trimmed);
    const directCheckIn = new Set([
      '/checkin',
      'เช็คอิน',
      'เช็คอินเข้างาน',
      'checkin',
      'check in',
    ]);
    const attendanceMenu = new Set([
      'เข้างาน',
      'เข้า-ออกงาน',
      'เช็คเอาท์',
      'checkout',
      '/checkout',
      'เลิกงาน',
      'สรุปเข้างาน',
      'สรุปเดือนนี้',
    ]);

    if (directCheckIn.has(lower) || directCheckIn.has(trimmed) || command === '/checkin') {
      await this.showCheckInLocationPicker(chatId, account.userId);
      await this.saveSession(account.id, 'attendance:confirming_checkin', {
        draft: { parentMenu: 'home' },
      });
      return true;
    }
    if (attendanceMenu.has(lower) || attendanceMenu.has(trimmed)) {
      if (trimmed === 'สรุปเข้างาน' || trimmed === 'สรุปเดือนนี้') {
        await this.showMonthlyAttendanceSummary(chatId, account.userId);
      } else {
        await this.showAttendanceMenu(chatId, account.userId);
      }
      await this.saveSession(account.id, 'idle', {});
      return true;
    }
    return false;
  }

  private async showEmployeeMoreMenu(
    chatId: number,
    userId: string,
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    const roleContext = await this.resolveTelegramRoleContext(userId);
    const keyboard = buildEmployeeMoreMenuKeyboard({
      isSubLeader: roleContext.isSubLeader,
      isSecretary: roleContext.isSecretary,
      isBigLeader: roleContext.isBigLeader,
      isOwner: roleContext.isOwner,
      marketingEnabled: this.marketingEnabled,
    });
    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      '⚙️ <b>เพิ่มเติม</b>',
      { inline_keyboard: toInlineKeyboard(keyboard) },
    );
  }

  private async showOpsMoreMenu(
    chatId: number,
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    await this.replaceCallbackMessage(
      chatId,
      sourceMessage as { message_id: number; chat: { id: number } } | undefined,
      '⚙️ <b>เพิ่มเติม (ผู้บริหาร)</b>',
      { inline_keyboard: toInlineKeyboard(buildOpsMoreMenuKeyboard()) },
    );
  }

  private async showTodaySummary(chatId: number, userId: string): Promise<void> {
    const emp = await this.getEmployeeForUser(userId);
    if (!emp) return;
    const day = await this.workdays.getTodayStatus(emp.employeeId);
    const lines = [buildEmployeeTodayHeader(day)];
    if (day.attendance?.workedMinutes) {
      lines.push(`ทำงาน: ${Math.round(day.attendance.workedMinutes / 60 * 10) / 10} ชม.`);
    }
    if ((day.overtime?.otHours ?? 0) > 0) {
      lines.push(`OT: ${day.overtime!.otHours} ชม. (${day.overtime!.status ?? '—'})`);
    }
    lines.push('', 'ดูสรุปทั้งเดือน: กด 📊 สรุปเดือนนี้ ในเมนูเข้า-ออกงาน');
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📊 สรุปเดือนนี้', callback_data: 'attendance:month_summary' }],
          this.backRow(),
        ],
      },
    });
  }

  private async showMonthlyAttendanceSummary(
    chatId: number,
    userId: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
    month?: string,
    category?: AttendanceSummaryCategory,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const monthKey = month ?? this.bangkokTime.workDateString().slice(0, 7);
    try {
      const view = await this.attendance.getEmployeeAttendanceView(
        { userId, impersonatorUserId: null, companyId: emp.companyId },
        emp.employeeId,
        emp.companyId,
      );
      const monthHistory = filterHistoryByMonth(view.history, monthKey);

      if (category) {
        const items = filterHistoryByCategory(monthHistory, category);
        const text = formatAttendanceCategoryDetail(category, monthKey, items);
        await this.replaceCallbackMessage(chatId, sourceMessage, text, {
          ...this.buildMonthlySummaryDetailKeyboard(monthKey, category),
        });
        return;
      }

      const stats = summarizeMonthHistory(monthHistory);
      const text = formatMonthlyAttendanceSummary(monthKey, stats);
      await this.replaceCallbackMessage(chatId, sourceMessage, text, {
        ...this.buildMonthlySummaryKeyboard(monthKey, stats),
      });
    } catch (err) {
      this.logger.error('Monthly attendance summary failed', err);
      await this.replaceCallbackMessage(
        chatId,
        sourceMessage,
        '❌ โหลดสรุปเข้างานไม่สำเร็จ',
        { inline_keyboard: [[this.backRow()[0]]] },
      );
    }
  }

  private buildMonthlySummaryKeyboard(
    month: string,
    stats: ReturnType<typeof summarizeMonthHistory>,
  ): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    const detailRows: Array<Array<{ text: string; callback_data: string }>> = [];
    const addDetail = (label: string, count: number, category: AttendanceSummaryCategory) => {
      if (count > 0) {
        detailRows.push([{
          text: `${label} (${count})`,
          callback_data: `attendance:month:${month}:${category}`,
        }]);
      }
    };
    addDetail('✅ มาทำงาน', stats.workDays, 'work');
    addDetail('⚠️ มาสาย', stats.lateDays, 'late');
    addDetail('❌ ขาดงาน', stats.absentDays, 'absent');
    addDetail('📝 ลา', stats.leaveDays, 'leave');
    addDetail('🗓 วันหยุด', stats.holidayDays, 'holiday');

    const currentMonth = this.bangkokTime.workDateString().slice(0, 7);
    const navRow: Array<{ text: string; callback_data: string }> = [
      { text: '◀️ เดือนก่อน', callback_data: `attendance:month:${shiftMonth(month, -1)}` },
    ];
    if (month !== currentMonth) {
      navRow.push({ text: '📍 เดือนนี้', callback_data: 'attendance:month_summary' });
    }
    navRow.push({ text: '▶️ เดือนถัดไป', callback_data: `attendance:month:${shiftMonth(month, 1)}` });

    return {
      inline_keyboard: [
        ...detailRows,
        navRow,
        [{ text: '🔙 กลับเมนูเข้างาน', callback_data: 'attendance:menu' }],
      ],
    };
  }

  private buildMonthlySummaryDetailKeyboard(
    month: string,
    _category: AttendanceSummaryCategory,
  ): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [{ text: '🔙 กลับสรุปเดือน', callback_data: `attendance:month:${month}` }],
        [{ text: '⏰ เมนูเข้า-ออกงาน', callback_data: 'attendance:menu' }],
      ],
    };
  }

  private async handleAttendanceMonthCallback(
    chatId: number,
    userId: string,
    data: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    if (data === 'attendance:month_summary') {
      await this.showMonthlyAttendanceSummary(chatId, userId, sourceMessage);
      return;
    }
    const parts = data.replace('attendance:month:', '').split(':');
    const month = parts[0];
    const category = parts[1] as AttendanceSummaryCategory | undefined;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      await this.showMonthlyAttendanceSummary(chatId, userId, sourceMessage);
      return;
    }
    await this.showMonthlyAttendanceSummary(chatId, userId, sourceMessage, month, category);
  }

  private async showWorkforceRiskSummary(
    chatId: number,
    userId: string,
    telegramAccountId?: string,
  ): Promise<void> {
    const companyId = await this.resolveActorCompanyId(userId, telegramAccountId);
    if (!companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบบริษัท', replyMarkup: { inline_keyboard: [this.backRow()] } });
      return;
    }
    const actor = { userId, impersonatorUserId: null, companyId };
    const risk = await this.workforceRisk.getCompanyRisk(actor, companyId);
    const lines = [`⚠️ <b>ความเสี่ยงกำลังคน</b> (${risk.date})`, `ระดับรวม: ${risk.overallLevel}`];
    const atRisk = risk.teams.filter((t) => t.level !== 'GREEN');
    if (!atRisk.length) {
      lines.push('วันนี้กำลังคนเพียงพอ');
    } else {
      for (const team of atRisk) {
        lines.push(`\n<b>${team.teamName ?? 'ทีม'}</b> — ${team.level}`);
        lines.push(`พร้อม ${team.availableCount}/${team.requiredMinimum} คน`);
        if (team.reasons.length) lines.push(team.reasons.slice(0, 3).join('\n'));
        if (team.recommendations.length) {
          lines.push('แนะนำ: ' + team.recommendations.map((r) => RISK_RECOMMENDATION_LABELS[r]).join(', '));
        }
      }
    }
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  private async showOpsCenterSummary(
    chatId: number,
    userId: string,
    telegramAccountId?: string,
  ): Promise<void> {
    const companyId = await this.resolveActorCompanyId(userId, telegramAccountId);
    if (!companyId) return;
    const actor = { userId, impersonatorUserId: null, companyId };
    const center = await this.workdays.getAttendanceCommandCenter(actor, companyId);
    const risk = await this.workforceRisk.getCompanyRisk(actor, companyId);
    const missingCheckIn = center.exceptions.find((e) => e.type === 'missing_check_in');
    const lines = [
      '🧭 <b>ศูนย์ปฏิบัติการวันนี้</b>',
      `ทำงาน: ${center.widgets.working.length} | สาย: ${center.widgets.late.length}`,
      `ยังไม่เข้า: ${center.widgets.notCheckedIn.length} | ต้องจัดการ: ${center.widgets.needsAction.length}`,
      `ความเสี่ยงกำลังคน: ${risk.atRiskCount} ทีม`,
    ];
    if (missingCheckIn?.items.length) {
      lines.push('');
      lines.push(formatNameBulletSection('👤 รายชื่อที่ยังไม่เข้างาน', missingCheckIn.items.map(
        (item) => `${item.firstName} ${item.lastName}${item.globalId ? ` (${item.globalId})` : ''}`,
      )));
    }
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  private async showOperatorLeaveToday(
    chatId: number,
    userId: string,
    telegramAccountId?: string,
  ): Promise<void> {
    const companyId = await this.resolveActorCompanyId(userId, telegramAccountId);
    if (!companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบบริษัท', replyMarkup: { inline_keyboard: [this.backRow()] } });
      return;
    }
    const today = this.bangkokTime.workDateString();
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: todayDate },
        endDate: { gte: todayDate },
      },
      include: {
        employee: { select: { firstName: true, lastName: true, globalId: true, nickname: true } },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 25,
    });
    const lines = [`🏖 <b>วันลาวันนี้</b> (${today})`];
    if (!leaves.length) {
      lines.push('ไม่มีพนักงานลาวันนี้');
    } else {
      for (const row of leaves) {
        const name = row.employee.nickname?.trim()
          || `${row.employee.firstName} ${row.employee.lastName}`.trim();
        lines.push(`• ${name}${row.employee.globalId ? ` (${row.employee.globalId})` : ''} — ${row.leaveType.name}`);
      }
    }
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  private async showCompanyCalendarSummary(
    chatId: number,
    userId: string,
    telegramAccountId?: string,
  ): Promise<void> {
    const companyId = await this.resolveActorCompanyId(userId, telegramAccountId);
    if (!companyId) return;
    const month = this.bangkokTime.workDateString().slice(0, 7);
    const actor = { userId, impersonatorUserId: null, companyId };
    const events = await this.companyCalendar.getMonthEvents(actor, companyId, month);
    const upcoming = events.filter((e) => e.date >= this.bangkokTime.workDateString()).slice(0, 8);
    const lines = [`📅 <b>ปฏิทินบริษัท ${month}</b>`];
    if (!upcoming.length) lines.push('ไม่มีเหตุการณ์ที่จะมาถึง');
    else upcoming.forEach((e) => lines.push(`${e.date}: ${e.title}${e.employeeName ? ` — ${e.employeeName}` : ''}`));
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [this.backRow()] },
    });
  }

  private backRow(): [{ text: string; callback_data: string }] {
    return [{ text: '🔙 กลับ', callback_data: 'home' }];
  }

  private cancelRow(): [{ text: string; callback_data: string }] {
    return [{ text: '❌ ยกเลิก', callback_data: 'menu:cancel' }];
  }

  private async showEmployeeProfile(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const row = await this.prisma.employee.findUnique({
      where: { id: emp.employeeId },
      include: { assignments: { where: { effectiveTo: null }, include: { company: true, team: true } } },
    });
    if (!row) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const assignment = row.assignments[0];
    const lines = [
      '👤 <b>ข้อมูลของฉัน</b>',
      '',
      `ชื่อ: ${row.firstName} ${row.lastName}`,
      `ตำแหน่ง: ${row.position ?? '-'}`,
      `สถานะ: ${row.employmentStatus}`,
      `บริษัท: ${assignment?.company?.name ?? '-'}`,
      `ทีม: ${assignment?.team?.name ?? '-'}`,
    ];
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: '✏️ ขอแก้ไขข้อมูลส่วนตัว', callback_data: 'emp:profile:change-request' }]],
      },
    });
  }

  private async handleEmployeeProfileChangeRequest(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp?.companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบข้อมูลพนักงาน' });
      return;
    }
    await this.prisma.employeeProfileChangeRequest.create({
      data: {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        requestedByUserId: account.userId,
        requestedFieldsJson: { source: 'telegram', note: 'Employee requested profile update via Telegram' },
        status: 'pending',
      },
    });
    await this.gateway.sendMessage({
      chatId,
      text: '✅ ส่งคำขอแก้ไขข้อมูลแล้ว\nHR จะตรวจสอบและแจ้งผลให้ทราบ',
    });
  }

  private async showMyPerformance(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const actor = { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId };
    const evaluations = await this.performance.listEvaluationsForEmployee(actor, emp.employeeId);
    const lines = ['🏆 <b>KPI / ผลงาน</b>', ''];
    if (!evaluations.length) {
      lines.push('ยังไม่มีข้อมูลการประเมิน');
    } else {
      for (const ev of evaluations.slice(0, 5)) {
        lines.push(`• รอบ ${ev.cycleId.slice(0, 8)}… — คะแนน ${ev.totalScore ?? '-'} (${ev.status})`);
      }
    }
    await this.gateway.sendMessage({ chatId, text: lines.join('\n'), parseMode: 'HTML' });
  }

  private async showTeamPerformance(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp?.companyId) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบข้อมูลทีม' });
      return;
    }
    if (this.hrSummaryHandler) {
      await this.hrSummaryHandler.sendSummary(chatId, emp.companyId);
      return;
    }
    await this.gateway.sendMessage({ chatId, text: '📊 ไม่มีข้อมูล Performance ทีม' });
  }

  private async showAttendanceAlerts(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp?.companyId || !this.attendanceAlerts) {
      await this.gateway.sendMessage({ chatId, text: 'ไม่พบแจ้งเตือนเข้างาน' });
      return;
    }
    const alerts = await this.attendanceAlerts.getAlertsToday(emp.companyId);
    const lines = [
      '🚨 <b>แจ้งเตือนเวลาเข้างานวันนี้</b>',
      '',
      `ยังไม่เช็คอิน: ${alerts.missingCheckIns}`,
      `ยังไม่กลับจากพัก: ${alerts.missingBreakReturns}`,
      `ยังไม่ออกงาน: ${alerts.missingCheckOuts}`,
      '',
    ];
    for (const item of alerts.items.slice(0, 10)) {
      lines.push(`• ${item.employeeName} — ${item.alertType}${item.escalated ? ' ⚠️' : ''}`);
    }
    if (!alerts.items.length) lines.push('ไม่มีรายการแจ้งเตือน');
    await this.gateway.sendMessage({ chatId, text: lines.join('\n'), parseMode: 'HTML' });
  }

  private async showTimeCorrectionFieldPicker(
    account: { id: string },
    chatId: number,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '🕐 <b>แก้ไขเวลา</b>\nเลือกประเภทที่ต้องการแก้ไข:',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ เข้างาน', callback_data: 'correction:field:checkInAt' }],
          [{ text: '🚪 ออกงาน', callback_data: 'correction:field:checkOutAt' }],
          [{ text: '☕ เริ่มพัก', callback_data: 'correction:field:breakStartAt' }],
          [{ text: '✅ จบพัก', callback_data: 'correction:field:breakEndAt' }],
          this.backRow(),
        ],
      },
    });
    await this.saveSession(account.id, 'attendance:correction_field', {});
  }

  private parseCorrectionTimeInput(workDate: string, input: string): string | null {
    const parts = parseThaiTimeInput(input);
    if (!parts) return null;
    const hh = String(parts.hours).padStart(2, '0');
    const mm = String(parts.minutes).padStart(2, '0');
    return new Date(`${workDate}T${hh}:${mm}:00+07:00`).toISOString();
  }

  private async submitCheckoutOvertime(
    account: { id: string; userId: string },
    chatId: number,
    draft: Record<string, unknown>,
    otEndAt?: Date,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    const attendanceRecordId = draft['attendanceRecordId'] as string | undefined;
    const companyId = (draft['companyId'] as string | undefined) ?? emp.companyId;
    if (!attendanceRecordId) {
      await this.gateway.sendMessage({
        chatId,
        text: '❌ ไม่พบข้อมูลการเข้างาน กรุณาเช็กเอาต์ใหม่',
      });
      await this.saveSession(account.id, 'idle', {});
      await this.showMainMenu(chatId, account.userId);
      return;
    }
    try {
      const ot = await this.attendance.submitOvertimeRequest(
        { userId: account.userId, impersonatorUserId: null, companyId },
        emp.employeeId,
        { companyId, attendanceRecordId, otEndAt },
      );
      if (ot) {
        const endLabel = otEndAt
          ? otEndAt.toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok',
            hour12: false,
          })
          : 'เวลาปัจจุบัน';
        await this.gateway.sendMessage({
          chatId,
          text: [
            '✅ <b>บันทึก OT แล้ว</b>',
            `⏱ สิ้นสุด: ${endLabel}`,
            `🔥 รวม ${ot.otHours} ชม. (฿${Number(ot.amount).toLocaleString('th-TH')})`,
            '⏳ สถานะ: รออนุมัติ',
          ].join('\n'),
          parseMode: 'HTML',
        });
      } else {
        await this.gateway.sendMessage({
          chatId,
          text: 'ℹ️ OT ไม่ถึงเกณฑ์ขั้นต่ำ (ต้อง ≥ 1 ชม. หลังเลิกกะ)',
        });
      }
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
    await this.saveSession(account.id, 'idle', {});
    await this.showMainMenu(chatId, account.userId);
  }

  private async handleCheckoutOtTimeText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    ctx: SessionContext,
  ): Promise<void> {
    const workDate = this.bangkokTime.workDateString();
    const correctedIso = this.parseCorrectionTimeInput(workDate, text);
    if (!correctedIso) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ${THAI_TIME_VALIDATION_ERROR}\n\nตัวอย่าง: ${THAI_TIME_INPUT_HINT}`,
      });
      return;
    }
    await this.submitCheckoutOvertime(
      account,
      chatId,
      ctx.draft ?? {},
      new Date(correctedIso),
    );
  }

  private getCorrectionDraft(context: SessionContext): AttendanceCorrectionDraft {
    return (context.draft ?? {}) as AttendanceCorrectionDraft;
  }

  private async handleAttendanceCorrectionText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    ctx: SessionContext,
  ): Promise<void> {
    const draft = this.getCorrectionDraft(ctx);
    if (state === 'attendance:correction_time') {
      const workDate = draft.workDate ?? this.bangkokTime.workDateString();
      const correctedAt = this.parseCorrectionTimeInput(workDate, text);
      if (!correctedAt) {
        await this.gateway.sendMessage({ chatId, text: `❌ ${THAI_TIME_VALIDATION_ERROR}` });
        return;
      }
      await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการแก้ไขเวลา:' });
      await this.saveSession(account.id, 'attendance:correction_reason', {
        draft: { ...draft, correctedAt },
      });
      return;
    }

    if (state === 'attendance:correction_reason') {
      const reason = text.trim();
      if (!reason) {
        await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการแก้ไขเวลา:' });
        return;
      }
      const updatedDraft = { ...draft, reason };
      const timeLabel = draft.correctedAt
        ? new Date(draft.correctedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
        : '—';
      await this.gateway.sendMessage({
        chatId,
        text: [
          '🕐 <b>ยืนยันคำขอแก้ไขเวลา</b>',
          `ประเภท: ${draft.fieldLabel ?? draft.field}`,
          `วันที่: ${draft.workDate ?? this.bangkokTime.workDateString()}`,
          `เวลาใหม่: ${timeLabel}`,
          `เหตุผล: ${reason}`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [{ text: '✅ ส่งคำขอ', callback_data: 'correction:submit' }],
            [{ text: '✏️ แก้ไขใหม่', callback_data: 'correction:edit' }],
            this.cancelRow(),
          ],
        },
      });
      await this.saveSession(account.id, 'attendance:correction_confirm', { draft: updatedDraft });
    }
  }

  private async submitTimeCorrection(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getCorrectionDraft(context);
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }
    if (!draft.field || !draft.correctedAt || !draft.reason) {
      await this.gateway.sendMessage({ chatId, text: '❌ ข้อมูลไม่ครบ กรุณาเริ่มใหม่' });
      await this.showTimeCorrectionFieldPicker(account, chatId);
      return;
    }

    try {
      const result = await this.attendanceCorrections.submit(
        { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
        emp.employeeId,
        {
          companyId: emp.companyId,
          field: draft.field as typeof CORRECTION_FIELDS[number],
          correctedAt: draft.correctedAt,
          reason: draft.reason,
          workDate: draft.workDate,
        },
      );
      await this.gateway.sendMessage({
        chatId,
        text: `✅ ส่งคำขอแก้ไขเวลาแล้ว\nรหัส: ${result.id.slice(0, 8)}…\nรอผู้บังคับบัญชาอนุมัติ`,
      });
      await this.saveSession(account.id, 'idle', {});
      await this.showMainMenu(chatId, account.userId);
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
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
    sourceMessage?: { message_id: number; chat: { id: number } } | unknown,
  ): Promise<void> {
    await this.replaceCallbackMessage(chatId, sourceMessage as { message_id: number; chat: { id: number } } | undefined, title, {
      inline_keyboard: [
        [{ text: confirmLabel, callback_data: confirmData }],
        this.cancelRow(),
        this.backRow(),
      ],
    });
  }

  /** Remove inline buttons from a clicked message so it cannot be pressed again. */
  private async disableCallbackButtons(sourceMessage?: unknown): Promise<void> {
    const source = normalizeCallbackSourceMessage(sourceMessage);
    if (!source) return;
    await this.gateway.editMessageReplyMarkup(source.chat.id, source.message_id, {
      inline_keyboard: [],
    });
  }

  private async showCheckInLocationPicker(
    chatId: number,
    userId: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const day = await this.workdays.getTodayStatus(emp.employeeId);
    const hasOpenShift = Boolean(day.attendance?.checkInAt && !day.attendance?.checkOutAt);
    if (hasOpenShift) {
      await this.showAttendanceMenu(chatId, userId, sourceMessage);
      return;
    }

    const profile = await this.prisma.employee.findFirst({
      where: { id: emp.employeeId, deletedAt: null },
      select: { workCategory: true },
    });
    const defaultPlace = profile?.workCategory === 'wfh' ? 'WFH' : 'Office';
    const text = [
      '📍 <b>เลือกสถานที่ทำงานวันนี้</b>',
      '',
      '🏢 Office — ได้ค่าอาหาร',
      '🏠 WFH — ไม่ได้ค่าอาหาร',
      '',
      `ค่าเริ่มต้นของคุณ: <b>${defaultPlace}</b>`,
      'ค่าข้ามนับจากวันออฟฟิศ',
    ].join('\n');
    const replyMarkup = this.buildCheckInLocationPickerMarkup();
    await this.sendInlineMenuMessage(chatId, sourceMessage, text, replyMarkup);
  }

  private buildCheckInLocationPickerMarkup(): {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  } {
    return {
      inline_keyboard: [
        [
          { text: '🏢 Office', callback_data: 'do:checkin:office' },
          { text: '🏠 WFH', callback_data: 'do:checkin:wfh' },
        ],
        [{ text: '❌ ยกเลิก', callback_data: 'home' }],
      ],
    };
  }

  /** Send or edit a message with inline buttons — always falls back to a fresh message with buttons. */
  private async sendInlineMenuMessage(
    chatId: number,
    sourceMessage: { message_id: number; chat: { id: number } } | undefined | unknown,
    text: string,
    replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
    const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
    const safeText = (text ?? '').trim() || '…';
    if (source) {
      const edited = await this.gateway.editMessageText(
        source.chat.id,
        source.message_id,
        safeText,
        replyMarkup,
      );
      const markupApplied = await this.gateway.editMessageReplyMarkup(
        source.chat.id,
        source.message_id,
        replyMarkup,
      );
      if (edited || markupApplied) return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: safeText,
      parseMode: 'HTML',
      replyMarkup,
    });
  }

  private async performTelegramCheckIn(
    account: { id: string; userId: string },
    chatId: number,
    workCategory: 'office' | 'wfh',
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const placeLabel = workCategory === 'wfh' ? 'WFH' : 'Office';
    try {
      const res = await this.attendance.checkIn(
        { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
        emp.employeeId,
        { companyId: emp.companyId, workCategory },
      );
      const checkInLabel = this.formatBangkokDateTime(res.checkInAt);
      const shiftRange = this.formatShiftRange(res.shiftStartAt, res.shiftEndAt);
      const statusLine = res.lateMinutes > 0
        ? `สถานะ: สาย ${res.lateMinutes} นาที`
        : 'สถานะ: ตรงเวลา';
      const text = [
        '✅ <b>เข้างานแล้ว</b>',
        '',
        `สถานที่: <b>${placeLabel}</b>`,
        `เวลา: ${checkInLabel}`,
        `กะ: ${res.shiftName ?? '-'}`,
        `เวลากะ: ${shiftRange}`,
        statusLine,
      ].join('\n');
      await this.replaceCallbackMessage(chatId, sourceMessage, text);
    } catch (err: unknown) {
      const message = (err as Error).message ?? '';
      const alreadyIn = /already checked in/i.test(message);
      const openShift = /ยังไม่ได้ออกงานจากวันที่/i.test(message);
      if (alreadyIn || openShift) {
        await this.showAttendanceMenu(chatId, account.userId, sourceMessage);
        await this.saveSession(account.id, 'idle', {});
        return;
      }
      await this.replaceCallbackMessage(chatId, sourceMessage, `❌ ${message}`);
      await this.saveSession(account.id, 'idle', {});
      return;
    }
    await this.saveSession(account.id, 'idle', {});
    await this.showMainMenu(chatId, account.userId);
  }

  private async replaceCallbackMessage(
    chatId: number,
    sourceMessage: { message_id: number; chat: { id: number } } | undefined | unknown,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
    const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
    const markup = replyMarkup ?? { inline_keyboard: [] };
    const safeText = (text ?? '').trim() || '…';
    if (source) {
      const edited = await this.gateway.editMessageText(
        source.chat.id,
        source.message_id,
        safeText,
        markup,
      );
      const markupApplied = replyMarkup
        ? await this.gateway.editMessageReplyMarkup(source.chat.id, source.message_id, markup)
        : false;
      if (edited || markupApplied) return;
      // Edit failed — still strip old buttons so they cannot be re-clicked.
      await this.gateway.editMessageReplyMarkup(source.chat.id, source.message_id, {
        inline_keyboard: [],
      });
    }
    await this.gateway.sendMessage({
      chatId,
      text: safeText,
      parseMode: 'HTML',
      replyMarkup: markup,
    });
  }

  /** Send a fresh chat message so Telegram shows the real action time (not the old alert timestamp). */
  private async sendCallbackResultMessage(
    chatId: number,
    sourceMessage: { message_id: number; chat: { id: number } } | undefined | unknown,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
    const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
    if (source) {
      await this.gateway.editMessageReplyMarkup(source.chat.id, source.message_id, {
        inline_keyboard: [],
      });
    }
    await this.gateway.sendMessage({
      chatId,
      text: (text ?? '').trim() || '…',
      parseMode: 'HTML',
      replyMarkup,
    });
  }

  private async handleCancel(
    account: { id: string; userId: string },
    chatId: number,
    state: TelegramState,
    context: SessionContext,
    sourceMessage?: unknown,
  ): Promise<void> {
    const parent = context.draft?.['parentMenu'] as string | undefined;
    switch (parent ?? state) {
      case 'attendance:confirming_checkin':
      case 'confirm:checkin':
      case 'confirm:checkout':
      case 'confirm:break_start':
      case 'confirm:break_end':
        await this.showMainMenu(chatId, account.userId, sourceMessage);
        await this.saveSession(account.id, 'idle', {});
        break;
      case 'leave:confirm':
        await this.showLeaveTypePicker(account.id, chatId);
        await this.saveSession(account.id, 'leave:select_type', {});
        break;
      default:
        await this.showMainMenu(chatId, account.userId, sourceMessage);
        await this.saveSession(account.id, 'idle', {});
    }
  }

  private async handleCallback(
    account: { id: string; userId: string; chatId: number },
    chatId: number,
    data: string,
    state: TelegramState,
    context: SessionContext,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    if (data.startsWith('so:') && this.selfOnboardingHandler) {
      const session = await this.getOrCreateSession(account.id);
      const resolved = await this.resolveSelfOnboardingContext(
        account,
        (session.state as TelegramState) ?? 'idle',
        (session.context as SessionContext | null) ?? {},
        { forceResume: true },
      );
      if (resolved.state === 'self_onboarding_active') {
        await this.selfOnboardingHandler.handleCallback(
          account,
          chatId,
          data,
          resolved.context,
          (id, s, ctx) => this.saveSession(id, s, ctx),
        );
        return;
      }
    }

    if (data === 'emp:profile:change-request') {
      await this.handleEmployeeProfileChangeRequest(account, chatId);
      return;
    }

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

    if (!this.marketingEnabled && (isMarketingMenuState(data) || isMarketingOwnerCallback(data))) {
      await this.sendMarketingDisabled(chatId);
      return;
    }

    if (data.startsWith('correction:field:')) {
      const field = data.replace('correction:field:', '');
      if ((CORRECTION_FIELDS as readonly string[]).includes(field)) {
        const labels: Record<string, string> = {
          checkInAt: 'เข้างาน',
          checkOutAt: 'ออกงาน',
          breakStartAt: 'เริ่มพัก',
          breakEndAt: 'จบพัก',
        };
        await this.gateway.sendMessage({
          chatId,
          text: `🕐 แก้ไขเวลา <b>${labels[field] ?? field}</b>\nกรุณาพิมพ์เวลา (${THAI_TIME_INPUT_HINT})`,
          parseMode: 'HTML',
        });
        await this.saveSession(account.id, 'attendance:correction_time', {
          draft: {
            field,
            fieldLabel: labels[field] ?? field,
            workDate: this.bangkokTime.workDateString(),
          },
        });
      }
      return;
    }
    if (data === 'correction:submit') {
      await this.submitTimeCorrection(account, chatId, context);
      return;
    }
    if (data === 'correction:edit') {
      await this.showTimeCorrectionFieldPicker(account, chatId);
      return;
    }
    if (data.startsWith('calendar:') && data !== 'calendar:menu' && data !== 'calendar:company' && this.teamCalendarHandler) {
      const emp = await this.getEmployeeForUser(account.userId);
      await this.teamCalendarHandler.handleCallback(
        { userId: account.userId, impersonatorUserId: null, companyId: emp?.companyId ?? null },
        chatId,
        data,
        account.id,
      );
      return;
    }
    if (data.startsWith('document:download:') && this.documentCenterHandler) {
      await this.documentCenterHandler.handleCallback(account, chatId, data);
      return;
    }
    if (data.startsWith('payslip:pdf:')) {
      const cycleId = data.slice('payslip:pdf:'.length);
      await this.sendPayslipPdf(account, chatId, cycleId);
      return;
    }
    if (data.startsWith('payslip:separate:')) {
      const cycleId = data.slice('payslip:separate:'.length);
      await this.sendSeparatePayslipsForPeriod(account, chatId, cycleId);
      return;
    }
    if (data === 'attendance:month_summary' || data.startsWith('attendance:month:')) {
      await this.handleAttendanceMonthCallback(chatId, account.userId, data, sourceMessage);
      return;
    }

    if (isLegacyMainMenuState(data)) {
      await this.showMainMenu(chatId, account.userId);
      await this.saveSession(account.id, 'idle', {});
      return;
    }

    if (data.startsWith('operator:company:')) {
      const companyId = data.slice('operator:company:'.length);
      const companies = await this.listAccessibleCompanies(account.userId);
      const company = companies.find((c) => c.id === companyId);
      if (!company) {
        await this.gateway.sendMessage({ chatId, text: '❌ ไม่มีสิทธิ์เข้าถึงบริษัทนี้' });
        return;
      }
      const session = await this.getOrCreateSession(account.id);
      const context = (session.context as SessionContext | null) ?? {};
      await this.saveSession(account.id, 'idle', {
        ...context,
        draft: { ...((context.draft ?? {}) as object), operatorCompanyId: companyId },
      });
      await this.gateway.sendMessage({
        chatId,
        text: `✅ เปลี่ยนเป็นบริษัท: <b>${company.name}</b>`,
        parseMode: 'HTML',
      });
      await this.showMainMenu(chatId, account.userId, sourceMessage);
      return;
    }

    switch (data) {
      case 'menu:close':
        await this.gateway.sendMessage({ chatId, text: '👋 ปิดเมนูแล้ว พิมพ์ /start เพื่อเปิดใหม่' });
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'menu:cancel':
        await this.handleCancel(account, chatId, state, context, sourceMessage);
        break;

      case 'home':
        await this.showMainMenu(chatId, account.userId, sourceMessage);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'today:summary':
        await this.showTodaySummary(chatId, account.userId);
        break;

      case 'ops:center':
        await this.showOpsCenterSummary(chatId, account.userId, account.id);
        break;

      case 'workforce:risk':
        await this.showWorkforceRiskSummary(chatId, account.userId, account.id);
        break;

      case 'menu:more_employee':
        await this.showEmployeeMoreMenu(chatId, account.userId, sourceMessage);
        break;

      case 'menu:more_ops':
        await this.showOpsMoreMenu(chatId, sourceMessage);
        break;

      case 'attendance:month_summary':
        await this.handleAttendanceMonthCallback(chatId, account.userId, data, sourceMessage);
        break;

      case 'attendance:menu':
        await this.showAttendanceMenu(chatId, account.userId, sourceMessage);
        break;

      case 'calendar:company':
        await this.showCompanyCalendarSummary(chatId, account.userId, account.id);
        break;

      case 'operator:company':
        await this.showOperatorCompanyPicker(account, chatId, sourceMessage);
        break;

      case 'operator:digest':
        await this.sendMorningReport(account, chatId);
        break;

      case 'operator:leave_today':
        await this.showOperatorLeaveToday(chatId, account.userId, account.id);
        break;

      case 'confirm:checkin':
      case 'checkin:pick':
      case 'do:checkin':
        await this.showCheckInLocationPicker(chatId, account.userId, sourceMessage);
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'home' },
        });
        break;

      case 'confirm:checkout':
        await this.showActionConfirm(
          chatId,
          '🚪 <b>ยืนยันการออกงาน?</b>',
          '✅ ยืนยันออกงาน',
          'do:checkout',
          sourceMessage,
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'home' },
        });
        break;

      case 'confirm:break_start':
        await this.showActionConfirm(
          chatId,
          '☕ <b>ยืนยันเริ่มพักเบรก?</b>',
          '✅ ยืนยันเริ่มพัก',
          'do:break_start',
          sourceMessage,
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'home' },
        });
        break;

      case 'confirm:break_end':
        await this.showActionConfirm(
          chatId,
          '✅ <b>ยืนยันจบพักเบรก?</b>',
          '✅ ยืนยันจบพัก',
          'do:break_end',
          sourceMessage,
        );
        await this.saveSession(account.id, 'attendance:confirming_checkin', {
          draft: { parentMenu: 'home' },
        });
        break;

      case 'attendance:time_correction':
        if (this.requestPlatform) {
          const emp = await this.getEmployeeForUser(account.userId);
          await this.requestPlatform.startTimeCorrectionRequest(
            account,
            chatId,
            { userId: account.userId, companyId: emp?.companyId ?? null },
            (s, c) => this.saveSession(account.id, s as TelegramState, c),
          );
        } else {
          await this.showTimeCorrectionFieldPicker(account, chatId);
        }
        break;

      case 'unified:inbox':
        if (this.unifiedInbox) {
          const companyId = await this.resolveActorCompanyId(account.userId, account.id);
          await this.unifiedInbox.showInbox(account, chatId, companyId);
          await this.saveSession(account.id, 'idle', {});
        }
        break;

      case 'leave:menu':
        await this.showLeaveMenu(account, chatId);
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

      case 'payroll:view_payslip': {
        const payslipEmp = await this.getEmployeeForUser(account.userId);
        await this.showPayslipMenu(chatId, payslipEmp?.employeeId, sourceMessage);
        await this.saveSession(account.id, 'payroll:view_payslip', {});
        break;
      }

      case 'request:menu':
        if (this.requestPlatform) {
          await this.requestPlatform.showRequestMenu(chatId, sourceMessage);
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'referral:candidate:menu':
        if (this.requestPlatform) {
          const emp = await this.getEmployeeForUser(account.userId);
          await this.requestPlatform.handleCallback(
            account,
            chatId,
            'referral:candidate:menu',
            { userId: account.userId, companyId: emp?.companyId ?? null },
            (s, c) => this.saveSession(account.id, s as TelegramState, c),
          );
        }
        break;

      case 'payslip:latest':
        await this.sendLatestPayslip(account, chatId);
        break;

      case 'payslip:latest:separate':
        await this.sendLatestPayslipsSeparate(account, chatId);
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

      case 'referral:my:list':
        if (this.employeeReferralHandler) {
          await this.employeeReferralHandler.showMyReferrals(account, chatId);
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'calendar:menu':
        if (this.teamCalendarHandler) {
          await this.teamCalendarHandler.showMenu(chatId);
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'document-center:knowledge':
        if (this.documentCenterHandler) {
          await this.documentCenterHandler.handleCallback(account, chatId, 'document-center:knowledge');
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'document-center:my':
        if (this.documentCenterHandler) {
          await this.documentCenterHandler.handleCallback(account, chatId, 'document-center:my');
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'announcement:list':
        if (this.announcementHandler) {
          await this.announcementHandler.handleCallback(account, chatId, 'announcement:list');
        }
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

      case 'ai:knowledge':
        await this.showAiKnowledgeIntro(account, chatId, context);
        break;

      case 'employee:profile':
        await this.showEmployeeProfile(account, chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'performance:my':
        await this.showMyPerformance(account, chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'performance:team':
        await this.showTeamPerformance(account, chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'attendance:alerts':
        await this.showAttendanceAlerts(account, chatId);
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'competency:my':
      case 'ai:manager:menu':
      case 'ai:brief:today':
      case 'ai:brief:detail':
      case 'ai:brief:urgent':
      case 'graph:query:menu':
      case 'succession:overview':
        if (this.phase2Handler) {
          const companyId = await this.resolveActorCompanyId(account.userId, account.id);
          const emp = await this.getEmployeeForUser(account.userId);
          const roles = await this.prisma.userRole.findMany({
            where: { userId: account.userId, deletedAt: null },
            include: { role: { select: { code: true } } },
          });
          const isOwner = roles.some((r) => ['owner', 'super_admin'].includes(r.role.code))
            || (await this.prisma.businessRoleAssignment.findFirst({
              where: { userId: account.userId, isActive: true, deletedAt: null, role: 'owner' },
            })) != null;
          if (data === 'graph:query:menu') {
            await this.phase2Handler.handleCallback(account, chatId, data, companyId, emp?.employeeId ?? null, isOwner);
            await this.saveSession(account.id, 'graph:querying', {});
          } else {
            await this.phase2Handler.handleCallback(account, chatId, data, companyId, emp?.employeeId ?? null, isOwner);
            await this.saveSession(account.id, 'idle', {});
          }
        }
        break;

      case 'training:menu':
        if (this.trainingHandler) {
          const emp = await this.getEmployeeForUser(account.userId);
          if (emp) {
            await this.trainingHandler.showLearningMenu(chatId, emp.employeeId, account.userId);
          }
        }
        await this.saveSession(account.id, 'idle', {});
        break;

      case 'hr:summary': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (this.hrSummaryHandler && emp?.companyId) {
          await this.hrSummaryHandler.sendSummary(chatId, emp.companyId);
        }
        await this.saveSession(account.id, 'idle', {});
        break;
      }

      case 'approvals:menu':
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

      case 'approvals:shift_swap':
        await this.showPendingWorkflowApprovals(account, chatId, 'leave_shift_swap');
        break;

      case 'approvals:advance':
        await this.showPendingWorkflowApprovals(account, chatId, 'advance');
        break;

      case 'approvals:correction':
        await this.showPendingWorkflowApprovals(account, chatId, 'attendance_correction');
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

      case 'do:checkin:office':
        await this.performTelegramCheckIn(account, chatId, 'office', sourceMessage);
        break;

      case 'do:checkin:wfh':
        await this.performTelegramCheckIn(account, chatId, 'wfh', sourceMessage);
        break;

      case 'do:checkout': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) {
          await this.replaceCallbackMessage(chatId, sourceMessage, '❌ ไม่พบข้อมูลพนักงาน');
          return;
        }
        try {
          const res = await this.attendance.checkOut(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
            { companyId: emp.companyId },
          );
          const checkoutLabel = this.formatBangkokDateTime(res.checkOutAt);
          const msg = [
            '🔴 <b>เลิกงานแล้ว</b>',
            `เวลา ${checkoutLabel}`,
            `⏱ ทำงาน: ${Math.floor(res.workedMinutes / 60)} ชม. ${res.workedMinutes % 60} นาที`,
            '',
            'วันนี้มี OT หรือไม่?',
          ].join('\n');
          await this.sendCallbackResultMessage(chatId, sourceMessage, msg, {
            inline_keyboard: [
              [{ text: 'ไม่มี OT', callback_data: 'checkout:ot_no' }],
              [{ text: 'มี OT', callback_data: 'checkout:ot_yes' }],
            ],
          });
          await this.saveSession(account.id, 'checkout:ot_prompt', {
            draft: { attendanceRecordId: res.id, companyId: emp.companyId },
          });
        } catch (err: unknown) {
          await this.replaceCallbackMessage(chatId, sourceMessage, `❌ ${(err as Error).message}`);
          await this.saveSession(account.id, 'idle', {});
          await this.showMainMenu(chatId, account.userId);
        }
        break;
      }

      case 'checkout:ot_no':
        await this.replaceCallbackMessage(chatId, sourceMessage, '✅ บันทึกแล้ว — วันนี้ไม่มี OT');
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;

      case 'checkout:ot_yes': {
        await this.replaceCallbackMessage(
          chatId,
          sourceMessage,
          [
            '⏱ <b>เวลาสิ้นสุด OT</b>',
            '',
            `พิมพ์เวลา (${THAI_TIME_INPUT_HINT}) เช่น <code>22.30</code>`,
            'หรือกด "ใช้เวลาปัจจุบัน"',
          ].join('\n'),
          {
            inline_keyboard: [
              [{ text: 'ใช้เวลาปัจจุบัน', callback_data: 'checkout:ot_now' }],
              this.cancelRow(),
            ],
          },
        );
        await this.saveSession(account.id, 'checkout:ot_time', { draft: context.draft });
        break;
      }

      case 'checkout:ot_now': {
        await this.submitCheckoutOvertime(
          account,
          chatId,
          (context.draft ?? {}) as Record<string, unknown>,
        );
        break;
      }

      case 'monthlyoff:menu': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) {
          await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
          return;
        }
        const today = this.bangkokTime.workDateString();
        const reporting = monthlyOffReportingWindow(today);
        const currentRange = formatPayrollPeriodRangeTh(
          reporting.currentPeriod.periodStart,
          reporting.currentPeriod.periodEnd,
        );
        const advanceRange = formatPayrollPeriodRangeTh(
          reporting.nextPeriod.periodStart,
          reporting.nextPeriod.periodEnd,
        );
        const example1 = formatIsoDateAsDdMmYyyy(reporting.currentPeriod.periodStart);
        const example2 = formatIsoDateAsDdMmYyyy(
          `${reporting.currentPeriod.periodEnd.slice(0, 8)}06`,
        );
        await this.gateway.sendMessage({
          chatId,
          text:
            `🗓 <b>แจ้งวันหยุดประจำเดือน</b>\n` +
            `<i>วันหยุดสิทธิพนักงาน ไม่ใช่การลา — ไม่หักเงินเดือน (สูงสุด 4 วัน/รอบ)</i>\n` +
            `${formatNoticePeriodHint(DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays)}\n` +
            `รอบปัจจุบัน: ${currentRange}\n` +
            `แจ้งล่วงหน้าได้ถึง: ${advanceRange}\n` +
            `พิมพ์วันที่หยุด (คั่นด้วย comma หรือช่วง)\n` +
            `${THAI_MULTI_DATE_INPUT_HINT}\n` +
            `เช่น ${example1},${example2}`,
          parseMode: 'HTML',
          replyMarkup: { inline_keyboard: [this.cancelRow()] },
        });
        await this.saveSession(account.id, 'monthlyoff:enter_dates', {
          draft: {
            companyId: emp.companyId,
            validStart: reporting.validStart,
            validEnd: reporting.validEnd,
          },
        });
        break;
      }

      case 'do:break_start': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) {
          await this.replaceCallbackMessage(chatId, sourceMessage, '❌ ไม่พบข้อมูลพนักงาน');
          return;
        }
        try {
          const started = await this.attendance.startBreak(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
          );
          const startLabel = this.formatBangkokDateTime(started.startedAt.toISOString());
          await this.replaceCallbackMessage(
            chatId,
            sourceMessage,
            `☕ <b>เริ่มพักแล้ว</b>\nเวลา ${startLabel}\nกด «กลับจากพัก» เมื่อพร้อมทำงานต่อ`,
          );
        } catch (err: unknown) {
          await this.replaceCallbackMessage(chatId, sourceMessage, `❌ ${(err as Error).message}`);
          await this.saveSession(account.id, 'idle', {});
          await this.showMainMenu(chatId, account.userId);
          return;
        }
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      case 'do:break_end': {
        const emp = await this.getEmployeeForUser(account.userId);
        if (!emp) {
          await this.replaceCallbackMessage(chatId, sourceMessage, '❌ ไม่พบข้อมูลพนักงาน');
          return;
        }
        try {
          const result = await this.attendance.endBreak(
            { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
            emp.employeeId,
          );
          const startLabel = this.formatBangkokDateTime(result.breakStartAt.toISOString());
          const endLabel = this.formatBangkokDateTime(result.breakEndAt.toISOString());
          const timingLine = result.onTime
            ? 'ตรงเวลา ✓'
            : `เกินสิทธิ์พัก ${result.overageMinutes} นาที`;
          await this.sendCallbackResultMessage(
            chatId,
            sourceMessage,
            `✅ <b>กลับจากพักแล้ว</b>\n`
            + `เวลา ${endLabel}\n`
            + `พัก ${result.durationMinutes} นาที (สิทธิ์ ${result.allowedMinutes} นาที)\n`
            + `${timingLine}\n`
            + `${startLabel} – ${endLabel}`,
          );
        } catch (err: unknown) {
          await this.replaceCallbackMessage(chatId, sourceMessage, `❌ ${(err as Error).message}`);
          await this.saveSession(account.id, 'idle', {});
          await this.showMainMenu(chatId, account.userId);
          return;
        }
        await this.saveSession(account.id, 'idle', {});
        await this.showMainMenu(chatId, account.userId);
        break;
      }

      default: {
        const approveMatch = data.match(/^approve:([^:]+):(.+)$/);
        if (approveMatch) {
          await this.handleApprovalCallback(
            account,
            chatId,
            'approve',
            approveMatch[1],
            approveMatch[2],
            sourceMessage,
          );
          break;
        }
        const rejectMatch = data.match(/^reject:([^:]+):(.+)$/);
        if (rejectMatch) {
          await this.handleApprovalCallback(
            account,
            chatId,
            'reject',
            rejectMatch[1],
            rejectMatch[2],
            sourceMessage,
          );
          break;
        }
        const detailMatch = data.match(/^detail:([^:]+):(.+)$/);
        if (detailMatch) {
          await this.handleDetailCallback(account, chatId, detailMatch[1], detailMatch[2]);
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
        if (data.startsWith('leave:date:start:')) {
          await this.onLeaveStartDatePicked(account, chatId, data.replace('leave:date:start:', ''), context);
          break;
        }
        if (data.startsWith('leave:date:end:')) {
          await this.onLeaveEndDatePicked(account, chatId, data.replace('leave:date:end:', ''), context);
          break;
        }
        if (data.startsWith('leave:dur:')) {
          await this.onLeaveDurationPicked(account, chatId, data.replace('leave:dur:', ''), context);
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
        if (data.startsWith('disciplinary:ack:')) {
          const actionId = data.replace('disciplinary:ack:', '');
          await this.handleDisciplinaryAck(account, chatId, actionId);
          break;
        }
        if (data.startsWith('probation:pass:') || data.startsWith('probation:extend:') || data.startsWith('probation:fail:')) {
          await this.handleProbationCallback(account, chatId, data);
          break;
        }
        if (this.selfOnboardingHrHandler && data.startsWith('so_hr:')) {
          const handled = await this.selfOnboardingHrHandler.handleCallback(
            account,
            chatId,
            data,
            (s, c) => this.saveSession(account.id, s as TelegramState, c),
            sourceMessage,
          );
          if (handled) break;
        }
        if (this.unifiedInbox && data.startsWith('unified:')) {
          const emp = await this.getEmployeeForUser(account.userId);
          const handled = await this.unifiedInbox.handleCallback(
            account,
            chatId,
            data,
            emp?.companyId ?? null,
            (s, c) => this.saveSession(account.id, s as TelegramState, c),
          );
          if (handled) break;
        }
        if (this.requestPlatform && (data.startsWith('request:') || data.startsWith('referral:candidate:') || data.startsWith('req:'))) {
          const emp = await this.getEmployeeForUser(account.userId);
          const handled = await this.requestPlatform.handleCallback(
            account,
            chatId,
            data,
            { userId: account.userId, companyId: emp?.companyId ?? null },
            (s, c) => this.saveSession(account.id, s as TelegramState, c),
            context as Record<string, unknown>,
            sourceMessage,
          );
          if (handled) break;
        }
        if (this.employeeReferralHandler && data.startsWith('referral:my:')) {
          const handled = await this.employeeReferralHandler.handleCallback(account, chatId, data);
          if (handled) break;
        }
        if (this.documentCenterHandler && (data.startsWith('document-center:') || data.startsWith('document:'))) {
          const handled = await this.documentCenterHandler.handleCallback(account, chatId, data);
          if (handled) break;
        }
        if (this.trainingHandler && (data === 'training:required' || data === 'training:completed')) {
          const emp = await this.getEmployeeForUser(account.userId);
          if (emp) {
            const handled = await this.trainingHandler.handleCallback(account, chatId, data, emp.employeeId);
            if (handled) break;
          }
        }
        if (this.phase2Handler && (
          data.startsWith('ai:') || data.startsWith('graph:') || data.startsWith('competency:') || data.startsWith('succession:')
        )) {
          const emp = await this.getEmployeeForUser(account.userId);
          const roles = await this.prisma.userRole.findMany({
            where: { userId: account.userId, deletedAt: null },
            include: { role: { select: { code: true } } },
          });
          const isOwner = roles.some((r) => ['owner', 'super_admin'].includes(r.role.code));
          const handled = await this.phase2Handler.handleCallback(
            account, chatId, data, emp?.companyId ?? null, emp?.employeeId ?? null, isOwner,
          );
          if (handled) break;
        }
        if (this.announcementHandler && data.startsWith('announcement:') && !data.startsWith('announcement:broadcast:')) {
          const handled = await this.announcementHandler.handleCallback(account, chatId, data);
          if (handled) break;
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
    from?: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<void> {
    if (state.startsWith('identity_') && from) {
      await this.handleOnboardingText(account, chatId, text, state, ctx, from);
      return;
    }
    if (state.startsWith('onboarding_')) {
      const profile = from ?? await this.telegramProfileForAccount(account.id);
      if (profile) {
        await this.handleOnboardingText(account, chatId, text, state, ctx, profile);
      }
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
    if (state === 'leave:rejecting' || state === 'ot:rejecting' || state === 'workflow:rejecting' || state === 'custom:rejecting') {
      if (state === 'custom:rejecting' && this.selfOnboardingHrHandler) {
        const handled = await this.selfOnboardingHrHandler.handleRejectText(
          account,
          chatId,
          text,
          ctx,
          (s, c) => this.saveSession(account.id, s as TelegramState, c),
        );
        if (handled) return;
      }
      await this.handleRejectionComment(account, chatId, text, state, ctx);
      return;
    }
    if (state === 'unified:rejecting' && this.unifiedInbox) {
      const emp = await this.getEmployeeForUser(account.userId);
      const handled = await this.unifiedInbox.handleRejectText(
        account,
        chatId,
        text,
        ctx as Record<string, unknown>,
        emp?.companyId ?? null,
        (s, c) => this.saveSession(account.id, s as TelegramState, c),
      );
      if (handled) return;
    }
    if (state === 'attendance:correction_time' || state === 'attendance:correction_reason') {
      await this.handleAttendanceCorrectionText(account, chatId, text, state, ctx);
      return;
    }
    if (state === 'checkout:ot_time') {
      await this.handleCheckoutOtTimeText(account, chatId, text, ctx);
      return;
    }
    if (state === 'leave:enter_start' || state === 'leave:enter_end' || state === 'leave:enter_reason') {
      await this.handleLeaveText(account, chatId, text, state, ctx);
      return;
    }
    if (state === 'monthlyoff:enter_dates') {
      await this.handleMonthlyOffDatesText(account, chatId, text, ctx);
      return;
    }
    if (state === 'ai:chatting') {
      await this.handleAiChatText(account, chatId, text, ctx);
      return;
    }
    if (state === 'ai:knowledge') {
      await this.handleAiKnowledgeText(account, chatId, text, ctx);
      return;
    }
    if (state === 'graph:querying' && this.phase2Handler) {
      const emp = await this.getEmployeeForUser(account.userId);
      if (emp?.companyId) {
        const roles = await this.prisma.userRole.findMany({
          where: { userId: account.userId, deletedAt: null },
          include: { role: { select: { code: true } } },
        });
        const isOwner = roles.some((r) => ['owner', 'super_admin'].includes(r.role.code));
        await this.phase2Handler.handleTextQuery(account, chatId, text, emp.companyId, isOwner);
        await this.saveSession(account.id, 'idle', {});
        return;
      }
    }
    if (
      state === 'leave_reschedule:enter_start'
      || state === 'leave_reschedule:enter_reason'
    ) {
      await this.handleLeaveRescheduleText(account, chatId, text, state, ctx);
      return;
    }
    if (state.startsWith('marketing:')) {
      if (!this.marketingEnabled) {
        await this.sendMarketingDisabled(chatId);
        await this.saveSession(account.id, 'idle', {});
        return;
      }
      await this.handleMarketingText(account, chatId, text, state, ctx);
      return;
    }
    if (this.requestPlatform && (state.startsWith('request:') || state.startsWith('referral:candidate:'))) {
      const emp = await this.getEmployeeForUser(account.userId);
      const handled = await this.requestPlatform.handleTextState(
        account,
        chatId,
        text,
        state,
        ctx as Record<string, unknown>,
        { userId: account.userId, companyId: emp?.companyId ?? null },
        (s, c) => this.saveSession(account.id, s as TelegramState, c),
      );
      if (handled) return;
    }
    await this.gateway.sendMessage({
      chatId,
      text: 'พิมพ์ /start เพื่อเปิดเมนู · /checkin เพื่อเช็กอิน · /report สำหรับรายงาน',
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

  private async showAiKnowledgeIntro(
    account: { id: string; userId: string },
    chatId: number,
    context: SessionContext,
  ): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: [
        '🤖 <b>ถาม WorkHQ</b>',
        '',
        'ถามเรื่องนโยบาย การลา OT เงินเดือน referral เอกสาร หรือสถานะคำร้องได้',
        'ระบบจะอ้างอิงแหล่งข้อมูลที่อนุมัติแล้วเท่านั้น',
        '',
        'พิมพ์คำถามของคุณ',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
      },
    });
    await this.saveSession(account.id, 'ai:knowledge', context);
  }

  private async handleAiKnowledgeText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    context: SessionContext,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    try {
      const result = await this.knowledgeAssistant.ask(
        {
          userId: account.userId,
          impersonatorUserId: null,
          companyId: emp?.companyId ?? null,
        },
        text,
        AiChannel.telegram,
      );
      const cite = result.sources.length
        ? `\n\n📚 อ้างอิง: ${result.sources.map((s) => s.title).join(', ')}`
        : '';
      await this.gateway.sendMessage({
        chatId,
        text: `${result.answer}${cite}`,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถติดต่อผู้ช่วยได้';
      await this.gateway.sendMessage({ chatId, text: `❌ ${message}` });
    }
    await this.saveSession(account.id, 'ai:knowledge', context);
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

  private async showLeaveMenu(account: { userId: string }, chatId: number): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    let balanceLines = '';
    if (emp) {
      try {
        const balances = await this.leave.getEmployeeLeaveBalances(
          { userId: account.userId, impersonatorUserId: null, companyId: emp.companyId },
          emp.employeeId,
          emp.companyId,
        );
        if (balances.length > 0) {
          balanceLines = `\n\n<b>ยอดคงเหลือ</b>\n${balances
            .map((b) => `• ${b.leaveTypeName}: ${b.remaining} วัน`)
            .join('\n')}`;
        }
      } catch {
        // balance display is best-effort for self-service menu
      }
    }

    await this.gateway.sendMessage({
      chatId,
      text: `🌴 <b>เมนูการลา</b>${balanceLines}\n\nเลือกรายการ:`,
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
        'กรุณากรอกวันเริ่มลาใหม่ (' + THAI_DATE_INPUT_HINT + '):',
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
        await this.gateway.sendMessage({ chatId, text: THAI_DATE_INPUT_ERROR });
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
    return parseThaiDateInput(text);
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
      text:
        '🌴 <b>ขอลา</b>\nเลือกประเภทการลา:\n' +
        formatNoticePeriodHint(DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays),
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
      text: `📅 ประเภท: <b>${type.name}</b>\nเลือกวันที่เริ่มลา:`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📅 วันนี้', callback_data: 'leave:date:start:today' }],
          [{ text: '📅 พรุ่งนี้', callback_data: 'leave:date:start:tomorrow' }],
          [{ text: '✏️ เลือกวันที่', callback_data: 'leave:date:start:manual' }],
          this.backRow(),
        ],
      },
    });
    await this.saveSession(account.id, 'leave:select_type', { draft });
  }

  private async onLeaveStartDatePicked(
    account: { id: string; userId: string },
    chatId: number,
    preset: string,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveDraft(context);
    if (preset === 'manual') {
      await this.gateway.sendMessage({ chatId, text: `กรุณากรอกวันที่เริ่มลา (${THAI_DATE_INPUT_HINT}):` });
      await this.saveSession(account.id, 'leave:enter_start', { draft });
      return;
    }
    draft.startDate = preset === 'today'
      ? this.bangkokTime.workDateString()
      : this.bangkokTime.workDateString(new Date(Date.now() + 86_400_000));
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกวันที่สิ้นสุดการลา:',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📅 วันเดียวกับวันเริ่ม', callback_data: 'leave:date:end:same' }],
          [{ text: '✏️ เลือกวันที่', callback_data: 'leave:date:end:manual' }],
        ],
      },
    });
    await this.saveSession(account.id, 'leave:enter_end', { draft });
  }

  private async onLeaveEndDatePicked(
    account: { id: string; userId: string },
    chatId: number,
    preset: string,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveDraft(context);
    if (preset === 'manual') {
      await this.gateway.sendMessage({ chatId, text: `กรุณากรอกวันที่สิ้นสุดการลา (${THAI_DATE_INPUT_HINT}):` });
      await this.saveSession(account.id, 'leave:enter_end', { draft });
      return;
    }
    draft.endDate = preset === 'same' ? draft.startDate : draft.endDate;
    if (!draft.endDate || !draft.startDate) return;
    draft.days = this.computeLeaveDays(draft.startDate, draft.endDate);
    await this.gateway.sendMessage({
      chatId,
      text: 'เลือกรูปแบบการลา:',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'เต็มวัน', callback_data: 'leave:dur:full' }],
          [{ text: 'ครึ่งวันเช้า', callback_data: 'leave:dur:am' }],
          [{ text: 'ครึ่งวันบ่าย', callback_data: 'leave:dur:pm' }],
        ],
      },
    });
    await this.saveSession(account.id, 'leave:enter_reason', { draft });
  }

  private async onLeaveDurationPicked(
    account: { id: string; userId: string },
    chatId: number,
    code: string,
    context: SessionContext,
  ): Promise<void> {
    const draft = this.getLeaveDraft(context);
    const labels: Record<string, string> = { full: 'เต็มวัน', am: 'ครึ่งวันเช้า', pm: 'ครึ่งวันบ่าย' };
    draft.durationType = code;
    draft.durationLabel = labels[code] ?? code;
    await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลการลา:' });
    await this.saveSession(account.id, 'leave:enter_reason', { draft });
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
          await this.gateway.sendMessage({ chatId, text: THAI_DATE_INPUT_ERROR });
          return;
        }
        draft.startDate = startDate;
        await this.gateway.sendMessage({
          chatId,
          text: 'เลือกวันที่สิ้นสุดการลา:',
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📅 วันเดียวกับวันเริ่ม', callback_data: 'leave:date:end:same' }],
              [{ text: '✏️ เลือกวันที่', callback_data: 'leave:date:end:manual' }],
            ],
          },
        });
        await this.saveSession(account.id, 'leave:enter_end', { draft });
        break;
      }

      case 'leave:enter_end': {
        const endDate = this.parseDateInput(text);
        if (!endDate) {
          await this.gateway.sendMessage({ chatId, text: THAI_DATE_INPUT_ERROR });
          return;
        }
        if (draft.startDate && endDate < draft.startDate) {
          await this.gateway.sendMessage({ chatId, text: '❌ วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น กรุณากรอกอีกครั้ง:' });
          return;
        }
        draft.endDate = endDate;
        draft.days = this.computeLeaveDays(draft.startDate!, endDate);
        await this.gateway.sendMessage({
          chatId,
          text: 'เลือกรูปแบบการลา:',
          replyMarkup: {
            inline_keyboard: [
              [{ text: 'เต็มวัน', callback_data: 'leave:dur:full' }],
              [{ text: 'ครึ่งวันเช้า', callback_data: 'leave:dur:am' }],
              [{ text: 'ครึ่งวันบ่าย', callback_data: 'leave:dur:pm' }],
            ],
          },
        });
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
    const noticeDays = DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays;
    const leaveDates = expandDateRangeIso(draft.startDate ?? '', draft.endDate ?? draft.startDate);
    const shortDates = shortNoticeDates(new Date(), leaveDates, noticeDays);
    const noticeWarn = formatShortNoticeWarning(shortDates, noticeDays);

    let text =
      `📋 <b>ตรวจสอบข้อมูลก่อนส่ง</b>\n\n` +
      `ประเภท: ${draft.leaveTypeName ?? draft.leaveTypeCode ?? '-'}\n` +
      `📅 ${draft.startDate ?? ''} → ${draft.endDate ?? ''}\n` +
      `📊 ${draft.days ?? 0} วัน · ${draft.durationLabel ?? 'เต็มวัน'}\n` +
      `📝 เหตุผล: ${draft.reason ?? '-'}\n\n` +
      formatNoticePeriodHint(noticeDays);
    if (noticeWarn) {
      text += `\n${noticeWarn}`;
    }

    await this.gateway.sendMessage({
      chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ ส่งข้อมูล', callback_data: 'leave:submit' }],
          [{ text: '✏️ แก้ไข', callback_data: 'leave:edit' }, { text: '❌ ยกเลิก', callback_data: 'menu:cancel' }],
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

    const noticeDays = DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays;
    const leaveDates = expandDateRangeIso(startDate, endDate);
    const shortDates = shortNoticeDates(new Date(), leaveDates, noticeDays);
    if (shortDates.length > 0 && String(reason ?? '').trim().length < 3) {
      await this.gateway.sendMessage({
        chatId,
        text:
          `❌ แจ้งลาไม่ครบ ${noticeDays} วันล่วงหน้า ต้องระบุเหตุผล\n` +
          `จะถูกหักเงินเดือน 2 เท่าค่าแรงรายวัน\n\nกรุณากรอกเหตุผลแล้วส่งใหม่`,
      });
      await this.saveSession(account.id, 'leave:enter_reason', { draft });
      await this.gateway.sendMessage({
        chatId,
        text: `📝 แจ้งไม่ครบ ${noticeDays} วันล่วงหน้า — กรุณาระบุเหตุผล (จะหักเงินเดือน 2 เท่าค่าแรงรายวัน):`,
      });
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

  // ── Self-registration / invite link onboarding ────────────────────────────────

  private async tryInviteLinkStart(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    from: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<boolean> {
    if (this.operatorLinkHandler) {
      const opToken = this.operatorLinkHandler.parseOperatorToken(text);
      if (opToken) {
        return this.operatorLinkHandler.handleOperatorStart(
          account,
          chatId,
          opToken,
          {
            telegramUserId: from.id,
            username: from.username,
            firstName: from.first_name,
            lastName: from.last_name,
          },
          { showMainMenu: (cid, userId) => this.showMainMenu(cid, userId) },
        );
      }
    }

    if (!this.inviteLinkHandler) return false;
    const token = this.inviteLinkHandler.parseInviteToken(text);
    if (!token) return false;
    return this.inviteLinkHandler.handleInviteStart(
      account,
      chatId,
      token,
      {
        telegramUserId: from.id,
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      },
      {
        saveSession: (id, state, ctx) => this.saveSession(id, state, ctx),
        showMainMenu: (cid, userId) => this.showMainMenu(cid, userId),
        assignDefaultEmployeeRole: (userId, companyId) => this.assignDefaultEmployeeRole(userId, companyId),
      },
    );
  }

  private async tryHandleRequestPlatformCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    context: SessionContext,
    sourceMessage?: unknown,
  ): Promise<boolean> {
    if (!this.requestPlatform) return false;
    if (
      !data.startsWith('request:')
      && !data.startsWith('req:')
      && !data.startsWith('referral:candidate:')
    ) {
      return false;
    }
    const emp = await this.getEmployeeForUser(account.userId);
    const session = await this.getOrCreateSession(account.id);
    const freshContext = (session.context as SessionContext | null) ?? context;
    return this.requestPlatform.handleCallback(
      account,
      chatId,
      data,
      { userId: account.userId, companyId: emp?.companyId ?? null },
      (s, c) => this.saveSession(account.id, s as TelegramState, c),
      freshContext as Record<string, unknown>,
      sourceMessage,
    );
  }

  private async tryRestartSelfOnboarding(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<boolean> {
    if (!this.selfOnboardingHandler) return false;
    return this.selfOnboardingHandler.restartFlow(
      account,
      chatId,
      (id, s, ctx) => this.saveSession(id, s, ctx),
    );
  }

  private async resolveSelfOnboardingContext(
    account: { id: string; userId: string },
    state: TelegramState,
    context: SessionContext,
    options: { forceResume?: boolean } = {},
  ): Promise<{ state: TelegramState; context: SessionContext }> {
    const existingDraft = context.draft as { employeeId?: string } | undefined;
    if (
      state === 'self_onboarding_active'
      && existingDraft?.employeeId
      && !options.forceResume
    ) {
      return { state, context };
    }
    if (!this.selfOnboardingHandler) return { state, context };

    const shouldResume = options.forceResume || state === 'self_onboarding_active';
    if (!shouldResume) return { state, context };

    const resumed = await this.selfOnboardingHandler.tryResumeSession(account);
    if (!resumed) return { state, context };

    await this.saveSession(account.id, 'self_onboarding_active', resumed);
    return { state: 'self_onboarding_active', context: resumed };
  }

  private async dispatchSelfOnboardingMessage(
    account: { id: string; userId: string },
    chatId: number,
    update: TelegramUpdate,
    state: TelegramState,
    context: SessionContext,
    from: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<boolean> {
    if (!this.selfOnboardingHandler) return false;
    if (state !== 'self_onboarding_active') return false;

    const accessState = await this.identityGuard.getAccessState(from.id);
    if (accessState === 'active') {
      await this.saveSession(account.id, 'idle', {});
      return false;
    }

    if (await this.trySelfOnboardingMedia(account, chatId, update, state, context, from)) {
      return true;
    }

    const resolved = await this.resolveSelfOnboardingContext(account, state, context);
    if (resolved.state !== 'self_onboarding_active') return false;

    const text = update.message?.text?.trim() ?? '';
    if (text) {
      if (text === '/start') {
        if (await this.tryRestartSelfOnboarding(account, chatId)) return true;
        if (await this.identityGuard.getAccessState(from.id) === 'active') {
          await this.showMainMenu(chatId, account.userId);
          await this.saveSession(account.id, 'idle', {});
          return true;
        }
      }
      await this.handleOnboardingText(
        account,
        chatId,
        text,
        resolved.state,
        resolved.context,
        from,
      );
      return true;
    }

    if (update.message) {
      await this.selfOnboardingHandler.handleNonTextInput(chatId, resolved.context);
      return true;
    }

    return false;
  }

  private async trySelfOnboardingMedia(
    account: { id: string; userId: string },
    chatId: number,
    update: TelegramUpdate,
    state: TelegramState,
    context: SessionContext,
    from: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<boolean> {
    if (!this.selfOnboardingHandler) return false;
    if (state !== 'self_onboarding_active') return false;

    const message = update.message as {
      photo?: Array<{ file_id: string; file_unique_id: string }>;
      document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string };
    } | undefined;
    if (!message?.photo?.length && !message?.document) return false;

    const resolved = await this.resolveSelfOnboardingContext(account, state, context);
    state = resolved.state;
    context = resolved.context;
    if (state !== 'self_onboarding_active') return false;

    const saveSession = (id: string, s: TelegramState, ctx: SessionContext) => this.saveSession(id, s, ctx);

    const photos = message.photo;
    if (photos?.length) {
      const largest = photos[photos.length - 1];
      await this.selfOnboardingHandler.handlePhoto(
        account,
        chatId,
        largest.file_id,
        `${largest.file_unique_id}.jpg`,
        'image/jpeg',
        context,
        saveSession,
      );
      return true;
    }

    const doc = message.document;
    if (doc) {
      const mime = doc.mime_type ?? '';
      if (mime && !mime.startsWith('image/')) {
        await this.gateway.sendMessage({
          chatId,
          text:
            '❌ ไฟล์นี้ไม่ใช่รูปภาพ\n' +
            'กรุณาส่งเป็นรูป (ถ่ายหรือเลือกจากแกลเลอรี) ไม่ใช่ PDF หรือเอกสารอื่น',
        });
        return true;
      }
      await this.selfOnboardingHandler.handlePhoto(
        account,
        chatId,
        doc.file_id,
        doc.file_name ?? `${doc.file_unique_id}.jpg`,
        mime || 'image/jpeg',
        context,
        saveSession,
      );
      return true;
    }

    return false;
  }

  private async startOnboarding(accountId: string, chatId: number): Promise<void> {
    await this.verification.start(accountId, chatId, (id, state, ctx) => this.saveSession(id, state, ctx));
  }

  /** /start and /status while account is not yet verified. */
  private async handleUnverifiedOnboardingCommand(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    from: { id: number },
  ): Promise<boolean> {
    if (text === '/status') {
      await this.verification.showRegistrationStatus(chatId, from.id);
      return true;
    }
    if (text === '/start') {
      const accessState = await this.identityGuard.getAccessState(from.id);
      if (accessState === 'pending' || state === 'identity_pending') {
        await this.verification.showRegistrationStatus(chatId, from.id);
        return true;
      }
      await this.startOnboarding(account.id, chatId);
      return true;
    }
    if (state === 'idle') {
      await this.startOnboarding(account.id, chatId);
      return true;
    }
    return false;
  }

  private async handleOnboardingText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
    from: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<void> {
    if (state === 'self_onboarding_active' && this.selfOnboardingHandler) {
      await this.selfOnboardingHandler.handleText(
        account,
        chatId,
        text,
        context,
        (id, s, ctx) => this.saveSession(id, s, ctx),
      );
      return;
    }
    if (state.startsWith('identity_')) {
      await this.verification.handleText(
        account,
        chatId,
        text,
        state,
        context,
        (id, s, ctx) => this.saveSession(id, s, ctx),
        {
          telegramUserId: from.id,
          username: from.username,
          firstName: from.first_name,
          lastName: from.last_name,
        },
        {
          assignDefaultEmployeeRole: (userId, companyId) => this.assignDefaultEmployeeRole(userId, companyId),
          showMainMenu: (cid, userId) => this.showMainMenu(cid, userId),
        },
      );
      return;
    }
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
    from: { id: number; username?: string; first_name?: string; last_name?: string },
  ): Promise<void> {
    if (data.startsWith('so:') && this.selfOnboardingHandler) {
      await this.selfOnboardingHandler.handleCallback(
        account,
        chatId,
        data,
        context,
        (id, s, ctx) => this.saveSession(id, s, ctx),
      );
      return;
    }
    if (data.startsWith('identity:') || state.startsWith('identity_')) {
      await this.verification.handleCallback(
        account,
        chatId,
        data,
        (id, s, ctx) => this.saveSession(id, s, ctx),
      );
      return;
    }
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
          [{ text: '🔀 อนุมัติสลับกะ', callback_data: 'approvals:shift_swap' }],
          [{ text: '⏰ อนุมัติ OT', callback_data: 'approvals:ot' }],
          [{ text: '💰 อนุมัติเบิกล่วงหน้า', callback_data: 'approvals:advance' }],
          [{ text: '🕐 อนุมัติแก้ไขเวลา', callback_data: 'approvals:correction' }],
          this.backRow(),
        ],
      },
    });
  }

  private actorFor(account: { userId: string }, companyId: string | null): ActorContext {
    return { userId: account.userId, impersonatorUserId: null, companyId };
  }

  private async showPendingWorkflowApprovals(
    account: { id: string; userId: string },
    chatId: number,
    entityType: WorkflowEntityType,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const instances = await this.workflowApprover.findPendingForActor(
        account.userId,
        entityType,
        emp.companyId,
        5,
      );

      if (instances.length === 0) {
        await this.gateway.sendMessage({
          chatId,
          text: '✅ ไม่มีคำร้องรออนุมัติ',
          replyMarkup: { inline_keyboard: [this.backRow()] },
        });
        return;
      }

      for (const inst of instances) {
        const workflowType = await this.approvalContext.resolveWorkflowType(entityType, inst.entityId);
        const display = await this.approvalContext.loadForInstance(
          inst.id,
          entityType,
          inst.entityId,
          inst.companyId,
          workflowType,
        );
        await this.gateway.sendMessage({
          chatId,
          text:
            `📋 <b>${display.requestTypeLabel}</b>\n` +
            `👤 ${display.requesterName}\n` +
            `🏢 ${display.companyName}\n` +
            `${display.teamName ? `👥 ${display.teamName}\n` : ''}` +
            `📅 ${display.createdAt}\n` +
            `${display.keyDetails}`,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '✅ อนุมัติ', callback_data: `approve:${entityType}:${inst.id}` },
                { text: '❌ ไม่อนุมัติ', callback_data: `reject:${entityType}:${inst.id}` },
              ],
              [{ text: '🔎 ดูรายละเอียด', callback_data: `detail:${entityType}:${inst.id}` }],
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
      this.logger.error(`Failed to load ${entityType} approvals`, err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดรายการอนุมัติไม่สำเร็จ' });
    }
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
                { text: '✅ อนุมัติ', callback_data: `approve:overtime:${inst.id}` },
                { text: '❌ ปฏิเสธ', callback_data: `reject:overtime:${inst.id}` },
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

  private async handleDisciplinaryAck(
    account: { userId: string },
    chatId: number,
    actionId: string,
  ): Promise<void> {
    try {
      await this.disciplinary.acknowledgeFromTelegram(account.userId, actionId);
      await this.gateway.sendMessage({
        chatId,
        text: '✅ รับทราบแล้ว — บันทึกถาวร (คำเตือนไม่มีวันหมดอายุ)',
      });
    } catch (err) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ${(err as Error).message}`,
      });
    }
  }

  private async handleProbationCallback(
    account: { userId: string },
    chatId: number,
    data: string,
  ): Promise<void> {
    const match = data.match(/^probation:(pass|extend|fail):(.+)$/);
    if (!match) return;

    const [, action, reviewId] = match;
    const outcome = action === 'pass' ? 'PASS' : action === 'extend' ? 'EXTEND' : 'FAIL';
    const dto = action === 'extend'
      ? { outcome: 'EXTEND' as const, extensionDays: 30, notes: 'Resolved via Telegram (EMP-010b)' }
      : { outcome: outcome as 'PASS' | 'FAIL', notes: 'Resolved via Telegram (EMP-010b)' };

    try {
      const result = await this.performance.resolveProbationFromTelegram(account.userId, reviewId, dto);
      const label = result.outcome === 'passed'
        ? 'ผ่านทดลองงาน (PASS)'
        : result.outcome === 'extended'
          ? 'ขยายทดลองงาน (EXTEND)'
          : 'ไม่ผ่านทดลองงาน (FAIL)';
      await this.gateway.sendMessage({
        chatId,
        text: `✅ บันทึกผลทดลองงานแล้ว\n\n${label}`,
      });
    } catch (err) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ${(err as Error).message}`,
      });
    }
  }

  private async actOnWorkflow(
    account: { id: string; userId: string },
    chatId: number,
    instanceId: string,
    action: 'approve' | 'reject',
    entityType: WorkflowEntityType,
    comment?: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    try {
      const allowed = await this.workflowApprover.isActorCurrentApprover(account.userId, instanceId);
      const isOwner = await this.workflowApprover.isBusinessOwnerOrSecretary(account.userId);
      if (!allowed && !isOwner) {
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
          channel: 'telegram',
          isOwnerOverride: !allowed && isOwner,
        },
      );

      const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
      const outcome = action === 'approve' ? 'approved' as const : 'rejected' as const;
      let messageUpdated = false;
      if (source) {
        messageUpdated = await this.approvalNotifier.editResolvedApprovalMessage(
          source.chat.id,
          source.message_id,
          instanceId,
          entityType,
          emp.companyId,
          null,
          outcome,
          comment,
        );
      }
      if (!messageUpdated) {
        const inst = await this.prisma.workflowInstance.findFirst({
          where: { id: instanceId, deletedAt: null },
        });
        if (inst) {
          const workflowType = await this.approvalContext.resolveWorkflowType(entityType, inst.entityId);
          const display = await this.approvalContext.loadForInstance(
            instanceId,
            entityType,
            inst.entityId,
            inst.companyId,
            workflowType,
          );
          await this.gateway.sendMessage({
            chatId,
            text: this.approvalNotifier.formatResolvedApprovalMessage(display, outcome, comment),
            parseMode: 'HTML',
            telegramAccountId: account.id,
            messageType: 'approval_outcome',
          });
        }
      }
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

  private normalizeWorkflowEntityType(entityType: string): string {
    return entityType === 'ot' ? 'overtime' : entityType;
  }

  private async handleApprovalCallback(
    account: { id: string; userId: string },
    chatId: number,
    action: 'approve' | 'reject',
    entityType: string,
    id: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    entityType = this.normalizeWorkflowEntityType(entityType);
    if (CUSTOM_APPROVAL_TYPES.has(entityType)) {
      if (action === 'approve') {
        await this.actOnCustomApproval(account, chatId, entityType, id, sourceMessage);
      } else {
        await this.startCustomRejectionFlow(account, chatId, entityType, id, sourceMessage);
      }
      return;
    }
    if (WORKFLOW_ENTITY_TYPES.has(entityType)) {
      if (action === 'approve') {
        await this.actOnWorkflow(account, chatId, id, 'approve', entityType as WorkflowEntityType, undefined, sourceMessage);
      } else {
        await this.startRejectionFlow(account, chatId, id, entityType as WorkflowEntityType, sourceMessage);
      }
    }
  }

  private async handleDetailCallback(
    account: { id: string; userId: string },
    chatId: number,
    entityType: string,
    id: string,
  ): Promise<void> {
    if (CUSTOM_APPROVAL_TYPES.has(entityType)) {
      await this.gateway.sendMessage({
        chatId,
        text: '🔎 ดูรายละเอียดเพิ่มเติมได้ที่เว็บ WorkHQ',
        replyMarkup: { inline_keyboard: [this.backRow()] },
      });
      return;
    }
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id, deletedAt: null },
      select: { companyId: true, entityId: true, entityType: true },
    });
    if (!instance) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบคำร้อง' });
      return;
    }
    const workflowType = await this.approvalContext.resolveWorkflowType(
      instance.entityType as WorkflowEntityType,
      instance.entityId,
    );
    const display = await this.approvalContext.loadForInstance(
      id,
      instance.entityType as WorkflowEntityType,
      instance.entityId,
      instance.companyId,
      workflowType,
    );
    const text = [
      '🔎 <b>รายละเอียดคำร้อง</b>',
      '',
      `<b>ประเภท</b>: ${display.requestTypeLabel}`,
      `<b>ผู้ขอ</b>: ${display.requesterName}`,
      `<b>บริษัท</b>: ${display.companyName}`,
      `<b>ทีม</b>: ${display.teamName ?? '—'}`,
      `<b>ตำแหน่ง</b>: ${display.positionName ?? '—'}`,
      `<b>วันที่สร้าง</b>: ${display.createdAt}`,
      '',
      display.keyDetails,
    ].join('\n');
    await this.gateway.sendMessage({
      chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '✅ อนุมัติ', callback_data: `approve:${entityType}:${id}` },
            { text: '❌ ไม่อนุมัติ', callback_data: `reject:${entityType}:${id}` },
          ],
          this.backRow(),
        ],
      },
    });
  }

  private async actOnCustomApproval(
    account: { id: string; userId: string },
    chatId: number,
    entityType: string,
    reviewId: string,
    sourceMessage?: TelegramSourceMessage,
  ): Promise<void> {
    const actor = this.actorFor(account, null);
    try {
      if (entityType === 'salary_review') {
        await this.salaryReviews.approve(actor, reviewId);
      } else if (entityType === 'promotion_review') {
        await this.promotionReviews.approve(actor, reviewId);
      } else if (entityType === 'referral') {
        await this.employeeReferrals.approveBonus(actor, reviewId);
      } else if (entityType === 'exit_settlement') {
        await this.finalSettlements.approve(actor, reviewId);
      } else if (entityType === 'exit_case') {
        await this.exitCases.leaderReviewFromTelegram(actor, reviewId, { notes: 'Approved via Telegram' });
      } else {
        await this.gateway.sendMessage({ chatId, text: '🚧 ประเภทคำร้องนี้ยังไม่รองรับการอนุมัติผ่าน Telegram' });
        return;
      }

      const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
      const outcome = 'approved' as const;
      let messageUpdated = false;
      if (source) {
        messageUpdated = await this.approvalNotifier.editResolvedCustomApprovalMessage(
          source.chat.id,
          source.message_id,
          entityType,
          reviewId,
          outcome,
        );
      }
      if (!messageUpdated) {
        const display = await this.approvalNotifier.loadCustomApprovalDisplay(entityType, reviewId);
        if (display) {
          await this.gateway.sendMessage({
            chatId,
            text: this.approvalNotifier.formatResolvedApprovalMessage(display, outcome),
            parseMode: 'HTML',
            telegramAccountId: account.id,
            messageType: 'approval_outcome',
          });
        } else {
          await this.gateway.sendMessage({ chatId, text: '✅ อนุมัติคำร้องแล้ว' });
        }
      }
      await this.saveSession(account.id, 'idle', {});
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async startCustomRejectionFlow(
    account: { id: string; userId: string },
    chatId: number,
    entityType: string,
    reviewId: string,
    sourceMessage?: TelegramSourceMessage,
  ): Promise<void> {
    await this.saveSession(account.id, 'custom:rejecting', {
      draft: { reviewId, entityType, sourceMessage },
    });
    await this.gateway.sendMessage({
      chatId,
      text: 'กรุณาระบุเหตุผลในการไม่อนุมัติ:',
      telegramAccountId: account.id,
    });
  }

  private async startRejectionFlow(
    account: { id: string; userId: string },
    chatId: number,
    instanceId: string,
    entityType: WorkflowEntityType,
    sourceMessage?: TelegramSourceMessage,
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

    await this.saveSession(account.id, 'workflow:rejecting', {
      draft: { workflowInstanceId: instanceId, entityType, sourceMessage },
    });
    await this.gateway.sendMessage({
      chatId,
      text: 'กรุณาระบุเหตุผลในการไม่อนุมัติ:',
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
    if (state === 'custom:rejecting') {
      const reviewId = ctx.draft?.['reviewId'] as string | undefined;
      const entityType = ctx.draft?.['entityType'] as string | undefined;
      const sourceMessage = ctx.draft?.['sourceMessage'] as TelegramSourceMessage | undefined;
      if (!reviewId || !entityType || !text.trim()) {
        await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการไม่อนุมัติ:' });
        return;
      }
      const actor = this.actorFor(account, null);
      try {
        if (entityType === 'salary_review') {
          await this.salaryReviews.reject(actor, reviewId, { reason: text.trim() });
        } else if (entityType === 'promotion_review') {
          await this.promotionReviews.reject(actor, reviewId, { reason: text.trim() });
        } else if (entityType === 'referral') {
          await this.employeeReferrals.rejectBonus(actor, reviewId, text.trim());
        } else if (entityType === 'exit_settlement') {
          await this.finalSettlements.reject(actor, reviewId, text.trim());
        } else if (entityType === 'exit_case') {
          await this.exitCases.rejectReviewFromTelegram(actor, reviewId, text.trim());
        }

        const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
        const outcome = 'rejected' as const;
        let messageUpdated = false;
        if (source) {
          messageUpdated = await this.approvalNotifier.editResolvedCustomApprovalMessage(
            source.chat.id,
            source.message_id,
            entityType,
            reviewId,
            outcome,
            text.trim(),
          );
        }
        if (!messageUpdated) {
          const display = await this.approvalNotifier.loadCustomApprovalDisplay(entityType, reviewId);
          if (display) {
            await this.gateway.sendMessage({
              chatId,
              text: this.approvalNotifier.formatResolvedApprovalMessage(display, outcome, text.trim()),
              parseMode: 'HTML',
              telegramAccountId: account.id,
              messageType: 'approval_outcome',
            });
          } else {
            await this.gateway.sendMessage({ chatId, text: '❌ ไม่อนุมัติคำร้องแล้ว' });
          }
        }
        await this.saveSession(account.id, 'idle', {});
      } catch (err: unknown) {
        await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
      }
      return;
    }

    const instanceId = ctx.draft?.['workflowInstanceId'] as string | undefined;
    const entityType = ctx.draft?.['entityType'] as WorkflowEntityType | undefined;
    const sourceMessage = ctx.draft?.['sourceMessage'] as TelegramSourceMessage | undefined;

    if (!instanceId || !entityType || !text.trim()) {
      await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลในการไม่อนุมัติ:' });
      return;
    }

    await this.actOnWorkflow(account, chatId, instanceId, 'reject', entityType, text.trim(), sourceMessage);
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
          [{ text: '📊 สรุปเข้างานเดือนนี้', callback_data: 'attendance:month_summary' }],
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
        replyMarkup: await this.getReplyKeyboardMarkup(account.userId),
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
    const companyId = await this.resolveActorCompanyId(account.userId, account.id);
    if (!companyId) return;

    try {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });
      const payload = await this.reporting.generateMorningBrief(companyId) as unknown as MorningBriefPayload;
      const missingCheckIn = await this.workdayBriefs.buildMissingCheckInBrief(companyId);
      await this.gateway.sendMessage({
        chatId,
        text: formatMorningReport(payload, company?.name ?? 'บริษัท', missingCheckIn.lines),
        parseMode: 'HTML',
        replyMarkup: await this.getReplyKeyboardMarkup(account.userId),
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
    const companyId = await this.resolveActorCompanyId(account.userId, account.id);
    if (!companyId) return;

    try {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });
      const payload = await this.reporting.generateEveningBrief(companyId) as unknown as EveningBriefPayload;
      const missingCheckOut = await this.workdayBriefs.buildMissingCheckOutBrief(companyId);
      await this.gateway.sendMessage({
        chatId,
        text: formatEveningReport(payload, company?.name ?? 'บริษัท', missingCheckOut.lines),
        parseMode: 'HTML',
        replyMarkup: await this.getReplyKeyboardMarkup(account.userId),
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
        replyMarkup: await this.getReplyKeyboardMarkup(account.userId),
      });
    } catch (err) {
      this.logger.error('Company summary failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสรุปบริษัทไม่สำเร็จ' });
    }
  }

  // ── Executive sprint: payslip, commission, referral, team, owner ────────────

  private async showPayslipMenu(
    chatId: number,
    employeeId?: string,
    sourceMessage?: { message_id: number; chat: { id: number } },
  ): Promise<void> {
    const multi = employeeId ? await this.usesMultiCompanyPayslip(employeeId) : false;
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: multi ? '📄 สลิปรวมล่าสุด' : '📄 สลิป PDF ล่าสุด', callback_data: 'payslip:latest' }],
    ];
    if (multi) {
      keyboard.push([{ text: '📄 สลิปแยกตามบริษัท (ล่าสุด)', callback_data: 'payslip:latest:separate' }]);
    }
    keyboard.push([{ text: '📚 สลิปย้อนหลัง', callback_data: 'payslip:history' }]);
    keyboard.push(this.backRow());

    const text = multi
      ? '💰 <b>เงินเดือน</b>\nคุณทำงานหลายบริษัท — เลือกรูปแบบสลิป PDF:'
      : '💰 <b>เงินเดือน</b>\nเลือกรายการ (ส่งเป็นไฟล์ PDF):';
    await this.sendInlineMenuMessage(chatId, sourceMessage, text, { inline_keyboard: keyboard });
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

    const salaryCheck = await this.salaryVisibility.canViewSalary(account.userId, emp.employeeId);
    if (!salaryCheck.canView) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${salaryCheck.reason}` });
      return;
    }

    try {
      const multi = await this.usesMultiCompanyPayslip(emp.employeeId);
      const payslip = await this.prisma.payslip.findFirst({
        where: {
          employeeId: emp.employeeId,
          deletedAt: null,
          ...(multi ? {} : { payrollCycle: { companyId: emp.companyId, deletedAt: null } }),
        },
        orderBy: { generatedAt: 'desc' },
        include: { payrollCycle: true },
      });
      const cycleId = payslip?.payrollCycleId
        ?? await this.payrollPdf.resolveLatestEmployeePayrollCycleId(emp.employeeId, {
          companyId: emp.companyId,
          multiCompany: multi,
        });
      if (!cycleId) {
        await this.gateway.sendMessage({
          chatId,
          text: '💰 ยังไม่มีสลิปเงินเดือน — รอ HR คำนวณเงินเดือนในรอบนี้ก่อน',
        });
        return;
      }
      await this.sendPayslipPdf(account, chatId, cycleId);
    } catch (err) {
      this.logger.error('Latest payslip failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสลิปไม่สำเร็จ' });
    }
  }

  private async sendLatestPayslipsSeparate(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const salaryCheck = await this.salaryVisibility.canViewSalary(account.userId, emp.employeeId);
    if (!salaryCheck.canView) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${salaryCheck.reason}` });
      return;
    }

    try {
      const payslip = await this.prisma.payslip.findFirst({
        where: { employeeId: emp.employeeId, deletedAt: null },
        orderBy: { generatedAt: 'desc' },
        include: { payrollCycle: true },
      });
      const cycleId = payslip?.payrollCycleId
        ?? await this.payrollPdf.resolveLatestEmployeePayrollCycleId(emp.employeeId, {
          companyId: emp.companyId,
          multiCompany: true,
        });
      if (!cycleId) {
        await this.gateway.sendMessage({ chatId, text: '💰 ยังไม่มีสลิปเงินเดือน' });
        return;
      }
      await this.sendSeparatePayslipsForPeriod(account, chatId, cycleId);
    } catch (err) {
      this.logger.error('Latest separate payslips failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสลิปไม่สำเร็จ' });
    }
  }

  private async sendPayslipHistory(
    account: { id: string; userId: string },
    chatId: number,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;

    const salaryCheck = await this.salaryVisibility.canViewSalary(account.userId, emp.employeeId);
    if (!salaryCheck.canView) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${salaryCheck.reason}` });
      return;
    }

    try {
      const multi = await this.usesMultiCompanyPayslip(emp.employeeId);
      const payslipRows = await this.prisma.payslip.findMany({
        where: {
          employeeId: emp.employeeId,
          deletedAt: null,
          ...(multi ? {} : { payrollCycle: { companyId: emp.companyId, deletedAt: null } }),
        },
        orderBy: { generatedAt: 'desc' },
        take: multi ? 24 : 6,
        include: { payrollCycle: true },
      });
      type PayslipHistoryRow = {
        payrollCycleId: string;
        payrollCycle: { periodStart: Date; periodEnd: Date };
        net: number;
      };
      let historyRows: PayslipHistoryRow[] = (multi
        ? this.dedupePayslipsByPeriod(payslipRows).slice(0, 6)
        : payslipRows
      ).map((p) => ({
        payrollCycleId: p.payrollCycleId,
        payrollCycle: p.payrollCycle,
        net: Number(p.net),
      }));
      if (historyRows.length === 0) {
        const cycleIds = await this.payrollPdf.listEmployeePayrollPeriodCycleIds(emp.employeeId, {
          companyId: emp.companyId,
          multiCompany: multi,
          limit: 6,
        });
        if (cycleIds.length === 0) {
          await this.gateway.sendMessage({ chatId, text: '💰 ไม่พบสลิปเงินเดือน' });
          return;
        }
        const cycles = await this.prisma.payrollCycle.findMany({
          where: { id: { in: cycleIds }, deletedAt: null },
        });
        const cycleById = new Map(cycles.map((c) => [c.id, c]));
        historyRows = [];
        for (const cycleId of cycleIds) {
          const payrollCycle = cycleById.get(cycleId);
          if (!payrollCycle) continue;
          historyRows.push({
            payrollCycleId: cycleId,
            payrollCycle,
            net: 0,
          });
        }
      }
      const rows: Array<Array<{ text: string; callback_data: string }>> = [];
      for (const p of historyRows) {
        const start = p.payrollCycle.periodStart.toISOString().slice(0, 10);
        const end = p.payrollCycle.periodEnd.toISOString().slice(0, 10);
        const net = p.net.toLocaleString('th-TH');
        if (multi) {
          rows.push([{
            text: `📄 รวม ${start} → ${end}`,
            callback_data: `payslip:pdf:${p.payrollCycleId}`,
          }]);
          rows.push([{
            text: `📄 แยกตามบริษัท ${start} → ${end}`,
            callback_data: `payslip:separate:${p.payrollCycleId}`,
          }]);
        } else {
          rows.push([{
            text: `📄 ${start} → ${end} · ฿${net}`,
            callback_data: `payslip:pdf:${p.payrollCycleId}`,
          }]);
        }
      }
      await this.sendInlineMenuMessage(
        chatId,
        undefined,
        multi
          ? '📚 <b>สลิปย้อนหลัง</b>\nเลือกรอบ — สลิปรวม (ไฟล์เดียว) หรือแยกตามบริษัท:'
          : '📚 <b>สลิปย้อนหลัง</b>\nเลือกไฟล์ PDF ที่ต้องการ:',
        { inline_keyboard: [...rows, this.backRow()] },
      );
    } catch (err) {
      this.logger.error('Payslip history failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ โหลดสลิปย้อนหลังไม่สำเร็จ' });
    }
  }

  private async sendPayslipPdf(
    account: { id: string; userId: string },
    chatId: number,
    cycleId: string,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const salaryCheck = await this.salaryVisibility.canViewSalary(account.userId, emp.employeeId);
    if (!salaryCheck.canView) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${salaryCheck.reason}` });
      return;
    }

    try {
      const multi = await this.usesMultiCompanyPayslip(emp.employeeId);
      const payslip = await this.prisma.payslip.findFirst({
        where: {
          employeeId: emp.employeeId,
          payrollCycleId: cycleId,
          deletedAt: null,
          ...(multi ? {} : { payrollCycle: { companyId: emp.companyId, deletedAt: null } }),
        },
        include: { payrollCycle: true },
      });
      if (!payslip && !multi) {
        const itemCount = await this.prisma.payrollItem.count({
          where: { payrollCycleId: cycleId, employeeId: emp.employeeId, deletedAt: null },
        });
        if (itemCount === 0) {
          await this.gateway.sendMessage({ chatId, text: '💰 ไม่พบสลิปในรอบนี้' });
          return;
        }
      }
      if (!payslip && multi) {
        const cycle = await this.prisma.payrollCycle.findFirst({
          where: { id: cycleId, deletedAt: null },
        });
        if (!cycle) {
          await this.gateway.sendMessage({ chatId, text: '💰 ไม่พบสลิปในรอบนี้' });
          return;
        }
      }

      const pdf = multi
        ? await this.payrollPdf.generateEmployeeConsolidatedPayslipPdf(
          account.userId,
          emp.employeeId,
          cycleId,
        )
        : await this.payrollPdf.generateEmployeePayslipPdf(
          account.userId,
          cycleId,
          emp.employeeId,
        );
      const periodStart = pdf.periodStart
        ?? payslip?.payrollCycle.periodStart.toISOString().slice(0, 10)
        ?? '';
      const periodEnd = pdf.periodEnd
        ?? payslip?.payrollCycle.periodEnd.toISOString().slice(0, 10)
        ?? '';
      const net = (pdf.net ?? Number(payslip?.net ?? 0)).toLocaleString('th-TH');
      const messageId = await this.gateway.sendDocument({
        chatId,
        buffer: pdf.buffer,
        filename: pdf.filename,
        contentType: pdf.contentType,
        caption: pdf.isConsolidated
          ? `💰 <b>สลิปรวม ${pdf.companyName ?? 'ทุกบริษัท'}</b>\n📅 ${periodStart} → ${periodEnd}\n✅ สุทธิรวม ฿${net}`
          : `💰 <b>สลิปเงินเดือน</b>\n📅 ${periodStart} → ${periodEnd}\n✅ สุทธิ ฿${net}`,
        telegramAccountId: account.id,
        messageType: 'payslip_pdf',
      });
      if (!messageId) {
        await this.gateway.sendMessage({ chatId, text: '❌ ส่งไฟล์ PDF ไม่สำเร็จ' });
      }
    } catch (err) {
      this.logger.error('Payslip PDF failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ สร้างสลิป PDF ไม่สำเร็จ' });
    }
  }

  private async sendSeparatePayslipsForPeriod(
    account: { id: string; userId: string },
    chatId: number,
    referenceCycleId: string,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบข้อมูลพนักงาน' });
      return;
    }

    const salaryCheck = await this.salaryVisibility.canViewSalary(account.userId, emp.employeeId);
    if (!salaryCheck.canView) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${salaryCheck.reason}` });
      return;
    }

    try {
      const pdfs = await this.payrollPdf.generateEmployeeSeparatePayslipPdfsForPeriod(
        account.userId,
        emp.employeeId,
        referenceCycleId,
      );
      if (pdfs.length === 0) {
        await this.gateway.sendMessage({ chatId, text: '💰 ไม่พบสลิปในรอบนี้' });
        return;
      }

      for (const pdf of pdfs) {
        const periodStart = pdf.periodStart ?? '';
        const periodEnd = pdf.periodEnd ?? '';
        const net = (pdf.net ?? 0).toLocaleString('th-TH');
        const companyLabel = pdf.companyName ? ` — ${pdf.companyName}` : '';
        await this.gateway.sendDocument({
          chatId,
          buffer: pdf.buffer,
          filename: pdf.filename,
          contentType: pdf.contentType,
          caption: `💰 <b>สลิปเงินเดือน${companyLabel}</b>\n📅 ${periodStart} → ${periodEnd}\n✅ สุทธิ ฿${net}`,
          telegramAccountId: account.id,
          messageType: 'payslip_pdf',
        });
      }

      if (pdfs.length > 1) {
        await this.gateway.sendMessage({
          chatId,
          text: `✅ ส่งสลิปแยกครบ ${pdfs.length} บริษัทแล้ว`,
          telegramAccountId: account.id,
        });
      }
    } catch (err) {
      this.logger.error('Separate payslip PDFs failed', err);
      await this.gateway.sendMessage({ chatId, text: '❌ สร้างสลิป PDF ไม่สำเร็จ' });
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
    const rows: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: '🏢 สรุปบริษัท', callback_data: 'owner:company' }],
      [{ text: '💵 สรุปการเงิน', callback_data: 'owner:finance' }],
      [{ text: '👥 สรุปการสรรหา', callback_data: 'owner:recruitment' }],
      [{ text: '💰 สรุปเงินเดือน', callback_data: 'owner:payroll' }],
    ];
    if (this.marketingEnabled) {
      rows.push(
        [{ text: '📈 ค่าคอมมิชชั่น', callback_data: 'owner:commission' }],
        [{ text: '💰 รอบค่าคอม', callback_data: 'owner:commission_cycles' }],
        [{ text: '🛠 ปรับปรุงค่าคอม', callback_data: 'owner:commission_adjustments' }],
        [{ text: '📈 Executive Brief', callback_data: 'owner:executive_brief' }],
      );
    }
    rows.push(this.backRow());
    await this.gateway.sendMessage({
      chatId,
      text: '👑 <b>แดชบอร์ดเจ้าของ</b>\nเลือกรายการ:',
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: rows },
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
    if (count > 0) return true;
    const assignment = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId: account.userId, isActive: true, deletedAt: null, role: 'owner' },
    });
    return Boolean(assignment);
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
    const emp = await this.getEmployeeForUser(account.userId);
    const companyId = emp?.companyId ?? '';
    if (companyId) {
      const summaryCheck = await this.salaryVisibility.canViewCompanyPayrollSummary(account.userId, companyId);
      if (!summaryCheck.canView) {
        await this.gateway.sendMessage({ chatId, text: `❌ ${summaryCheck.reason}` });
        return;
      }
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

  private async telegramProfileForAccount(accountId: string) {
    const acc = await this.prisma.telegramAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { telegramUserId: true, username: true },
    });
    if (!acc) return null;
    return {
      id: Number(acc.telegramUserId),
      username: acc.username ?? undefined,
    };
  }

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

  /** Shared payroll or marketing staff with 2+ company assignments. */
  private async usesMultiCompanyPayslip(employeeId: string): Promise<boolean> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { payrollAllocationMode: true },
    });
    if (emp?.payrollAllocationMode === 'shared_across_companies') return true;
    const companyCount = await this.payrollPdf.countEmployeePayrollCompanies(employeeId);
    if (companyCount >= 2) return true;
    // Shared staff may only have payroll items across multiple companies before migrate completes.
    const payrollCompanyRows = await this.prisma.payrollItem.findMany({
      where: { employeeId, deletedAt: null, payrollCycle: { deletedAt: null } },
      select: { payrollCycle: { select: { companyId: true } } },
      take: 100,
    });
    const payrollCompanyIds = new Set(payrollCompanyRows.map((row) => row.payrollCycle.companyId));
    return payrollCompanyIds.size >= 2;
  }

  /** One entry per pay period (shared staff may have payslips in multiple companies). */
  private dedupePayslipsByPeriod<
    T extends { payrollCycleId: string; payrollCycle: { periodStart: Date; periodEnd: Date; payDate: Date }; net: unknown; generatedAt: Date },
  >(rows: T[]): T[] {
    const byPeriod = new Map<string, T>();
    for (const row of rows) {
      const key = `${row.payrollCycle.periodStart.toISOString().slice(0, 10)}:${row.payrollCycle.periodEnd.toISOString().slice(0, 10)}`;
      const existing = byPeriod.get(key);
      if (!existing || row.generatedAt > existing.generatedAt) {
        byPeriod.set(key, row);
      }
    }
    return [...byPeriod.values()].sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
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
      text: `📊 <b>ส่งยอดการตลาด</b>\nกรุณากรอกวันที่รายงาน (${THAI_DATE_INPUT_HINT})\n\nพิมพ์ <code>today</code> สำหรับวันนี้`,
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
          await this.gateway.sendMessage({ chatId, text: `${THAI_DATE_INPUT_ERROR} หรือ today:` });
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

  private async handleMonthlyOffDatesText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    ctx: SessionContext,
  ): Promise<void> {
    const emp = await this.getEmployeeForUser(account.userId);
    if (!emp) return;
    const validStart = ctx.draft?.['validStart'] as string | undefined;
    const validEnd = ctx.draft?.['validEnd'] as string | undefined;
    const companyId = (ctx.draft?.['companyId'] as string | undefined) ?? emp.companyId;
    const isoDates = parseThaiDateListInput(text);
    if (!validStart || !validEnd || !isoDates?.length) {
      await this.gateway.sendMessage({
        chatId,
        text: `${THAI_DATE_INPUT_ERROR}\nกรุณาระบุวันที่หยุดคั่นด้วย comma หรือช่วง`,
      });
      return;
    }
    const invalidDate = isoDates.find((d) => d < validStart || d > validEnd);
    if (invalidDate) {
      await this.gateway.sendMessage({
        chatId,
        text:
          `❌ วันที่ ${formatIsoDateAsDdMmYyyy(invalidDate)} ไม่อยู่ในช่วงที่แจ้งได้\n` +
          `(${formatPayrollPeriodRangeTh(validStart, validEnd)})`,
      });
      return;
    }
    const grouped = groupDatesByPayrollPeriod(isoDates);
    try {
      const submitted: Array<{ periodStart: string; count: number; preview: Awaited<ReturnType<MonthlyOffService['buildSubmitPreview']>> }> = [];
      for (const [periodStart, dates] of grouped) {
        const result = await this.monthlyOff.submit(
          { userId: account.userId, impersonatorUserId: null, companyId },
          { employeeId: emp.employeeId, companyId, month: periodStart, selectedDates: dates },
        );
        submitted.push({ periodStart, count: dates.length, preview: result.preview });
      }
      const summary = submitted
        .map(
          (row) =>
            `${formatPayrollPeriodRangeTh(row.periodStart)} (${row.count} วัน)`,
        )
        .join(', ');
      const text = buildMonthlyOffSubmitTelegramMessage(
        summary,
        submitted[submitted.length - 1]?.preview ?? {
          periodLabel: summary,
          submittedDayCount: isoDates.length,
          monthlyOffAllowance: 4,
          excessMonthlyOffDays: 0,
          otPreview: {
            usedOffDayUnits: 0,
            eligibleBonusDays: 2,
            bonusAmount: 1200,
            ratePerDay: 600,
            maxBonusDays: 2,
          },
          shortNoticeDates: [],
          noticeDays: 7,
        },
      );
      await this.gateway.sendMessage({
        chatId,
        text,
      });
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
    await this.saveSession(account.id, 'idle', {});
    await this.showMainMenu(chatId, account.userId);
  }

  private formatBangkokDateTime(iso: string | null): string {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: this.bangkokTime.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  private formatShiftRange(startIso: string | null, endIso: string | null): string {
    if (!startIso || !endIso) return '-';
    const fmt = (iso: string) => new Intl.DateTimeFormat('th-TH', {
      timeZone: this.bangkokTime.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
    return `${fmt(startIso)} - ${fmt(endIso)}`;
  }
}
