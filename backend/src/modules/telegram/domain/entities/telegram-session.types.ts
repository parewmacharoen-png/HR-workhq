// ============================================================================
// modules/telegram/domain/entities/telegram-session.types.ts
// Finite-state-machine states for the Telegram menu. Every employee interaction
// moves through a typed state so the bot always knows what to show next.
// ============================================================================

export type TelegramState =
  | 'idle'
  // attendance
  | 'attendance:confirming_checkin'
  | 'attendance:confirming_checkout'
  | 'attendance:break_menu'
  | 'attendance:correction_field'
  | 'attendance:correction_time'
  | 'attendance:correction_reason'
  | 'attendance:correction_confirm'
  | 'checkout:ot_prompt'
  | 'checkout:ot_time'
  | 'monthlyoff:enter_dates'
  // document request (DOC-002)
  | 'document:select_type'
  | 'document:confirm'
  // leave
  | 'leave:select_type'
  | 'leave:enter_start'
  | 'leave:enter_end'
  | 'leave:enter_reason'
  | 'leave:confirm'
  | 'leave:rejecting'
  | 'leave_reschedule:select_request'
  | 'workflow:rejecting'
  | 'custom:rejecting'
  | 'unified:rejecting'
  | 'leave_reschedule:enter_start'
  | 'leave_reschedule:enter_reason'
  | 'leave_reschedule:confirm'
  | 'leave_shift_swap:select_own'
  | 'leave_shift_swap:select_partner'
  | 'ot:rejecting'
  // payroll
  | 'payroll:view_payslip'
  // commission
  | 'commission:view_summary'
  // marketing
  | 'marketing:enter_date'
  | 'marketing:enter_contacted'
  | 'marketing:enter_new_members'
  | 'marketing:enter_deposit'
  | 'marketing:enter_started'
  | 'marketing:confirm'
  | 'marketing:expense_category'
  | 'marketing:expense_amount'
  | 'marketing:expense_description'
  | 'marketing:expense_confirm'
  // ai assistant
  | 'ai:chatting'
  | 'ai:knowledge'
  | 'graph:querying'
  // training
  | 'training:menu'
  // hr analytics
  | 'hr:summary'
  // self-registration onboarding
  | 'onboarding_name'
  | 'onboarding_lastname'
  | 'onboarding_phone'
  | 'onboarding_assign_company'
  | 'onboarding_assign_team'
  | 'onboarding_assign_type'
  | 'onboarding_assign_method'
  | 'onboarding_assign_split_leader'
  | 'onboarding_assign_split_employee'
  | 'onboarding_assign_review'
  | 'onboarding_confirm'
  // employee identity verification (HR-11.5)
  | 'identity_enter_code'
  | 'identity_enter_phone'
  | 'identity_enter_invite'
  | 'identity_pending'
  // EMP-001c self-onboarding via Telegram invite link
  | 'self_onboarding_active'
  // commission declaration correction (after rejection)
  | 'declaration_assign_company'
  | 'declaration_assign_team'
  | 'declaration_assign_type'
  | 'declaration_assign_method'
  | 'declaration_assign_split_leader'
  | 'declaration_assign_split_employee'
  | 'declaration_assign_review'
  | 'declaration_confirm'
  // universal request platform (REQ-001)
  | 'request:menu'
  | 'request:field:0'
  | 'request:confirm'
  | 'request:rejecting'
  // employee referral candidate flow (REC-002)
  | 'referral:candidate:menu'
  | 'referral:candidate:name'
  | 'referral:candidate:phone'
  | 'referral:candidate:position'
  // org graph query (phase 2)
  | 'graph:querying';

// Employee/manager main menus: see telegram-menu.builder.ts (single source of truth).

export interface SessionContext {
  /** Pending data being collected across turns. */
  draft?: Record<string, unknown>;
  /** Last menu message_id for editing in-place. */
  lastMessageId?: number;
  /** Fingerprint of the last synced reply-keyboard layout (label join). */
  replyKeyboardFingerprint?: string;
  /** Per-chat blue Menu button configured via setChatMenuButton. */
  chatMenuButtonSynced?: boolean;
}
