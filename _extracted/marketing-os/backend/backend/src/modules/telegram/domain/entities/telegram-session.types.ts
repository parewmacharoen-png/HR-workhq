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
  // leave
  | 'leave:select_type'
  | 'leave:enter_start'
  | 'leave:enter_end'
  | 'leave:enter_reason'
  | 'leave:confirm'
  | 'leave:rejecting'
  | 'leave_reschedule:select_request'
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
  // commission declaration correction (after rejection)
  | 'declaration_assign_company'
  | 'declaration_assign_team'
  | 'declaration_assign_type'
  | 'declaration_assign_method'
  | 'declaration_assign_split_leader'
  | 'declaration_assign_split_employee'
  | 'declaration_assign_review'
  | 'declaration_confirm';

export interface SessionContext {
  /** Pending data being collected across turns. */
  draft?: Record<string, unknown>;
  /** Last menu message_id for editing in-place. */
  lastMessageId?: number;
}

export const MENU_ROOT_EMPLOYEE = [
  { label: '📋 Attendance', state: 'attendance:confirming_checkin' },
  { label: '🌴 Leave', state: 'leave:select_type' },
  { label: '💰 Payroll', state: 'payroll:view_payslip' },
  { label: '📊 Commission', state: 'commission:view_summary' },
  { label: '🤖 AI Assistant', state: 'ai:chatting' },
] as const;

export const MENU_ROOT_LEADER = [
  ...MENU_ROOT_EMPLOYEE,
  { label: '✅ อนุมัติการลา', state: 'approvals:leave' },
  { label: '⏰ อนุมัติ OT', state: 'approvals:ot' },
  { label: '👥 Team Dashboard', state: 'idle' },
] as const;
