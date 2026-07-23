// ============================================================================
// modules/telegram/application/telegram-menu.builder.ts
// Pilot Release — state-first Today UX menus (testable, no bot deps).
// ============================================================================

import type { WorkDayDto, WorkDayState } from '../../workday/domain/workday-state.types';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

export interface TelegramMenuButton {
  label: string;
  state: string;
}

export const EMPLOYEE_SECONDARY_ACTIONS: TelegramMenuButton[] = [
  { label: '📅 ตารางทีม', state: 'calendar:menu' },
  { label: '🗓 แจ้งวันหยุด', state: 'monthlyoff:menu' },
  { label: '📝 คำร้อง', state: 'request:menu' },
  { label: '💰 เงินเดือน/สลิป', state: 'payroll:view_payslip' },
];

export const MANAGER_OPERATIONS_MENU: TelegramMenuButton[] = [
  { label: '📍 วันนี้', state: 'home' },
  { label: '🧭 ศูนย์ปฏิบัติการ', state: 'ops:center' },
  { label: '⚠️ ความเสี่ยงกำลังคน', state: 'workforce:risk' },
  { label: '✅ งานรออนุมัติ', state: 'unified:inbox' },
  { label: '👥 พนักงาน', state: 'owner:dashboard' },
  { label: '💰 เงินเดือน', state: 'payroll:view_payslip' },
  { label: '📅 ปฏิทินบริษัท', state: 'calendar:company' },
  { label: '⚙️ เพิ่มเติม', state: 'menu:more_ops' },
];

/** Items hidden from employee v1 main menu — accessible via เพิ่มเติม only. */
export const EMPLOYEE_MORE_MENU_V1: TelegramMenuButton[] = [
  { label: '📊 ค่าคอมมิชชั่น', state: 'commission:view_summary' },
  { label: '🤝 แนะนำเพื่อน', state: 'referral:status' },
];

export const EMPLOYEE_MORE_LEADER_V1: TelegramMenuButton[] = [
  { label: '✅ งานรออนุมัติ', state: 'unified:inbox' },
  { label: '👥 ทีมของฉัน', state: 'leader:team_dashboard' },
];

export const OPS_MORE_MENU_V1: TelegramMenuButton[] = [
  { label: '📊 Morning Brief', state: 'ai:brief:today' },
  { label: '🚨 Attendance Alerts', state: 'attendance:alerts' },
  { label: '📄 Documents', state: 'document-center:my' },
  { label: '📢 Announcements', state: 'announcement:list' },
];

/** Back-office operator main menu — no attendance / employee self-service. */
export const OPERATOR_MAIN_MENU: TelegramMenuButton[] = [
  { label: '✅ งานรออนุมัติ', state: 'unified:inbox' },
  { label: '📊 สรุปวันนี้', state: 'operator:digest' },
  { label: '🧭 ศูนย์ปฏิบัติการ', state: 'ops:center' },
  { label: '⚠️ ความเสี่ยงกำลังคน', state: 'workforce:risk' },
  { label: '👥 พนักงาน', state: 'owner:dashboard' },
  { label: '📅 ปฏิทินบริษัท', state: 'calendar:company' },
  { label: '🏖 วันลาวันนี้', state: 'operator:leave_today' },
  { label: '🤖 คุยกับ AI', state: 'ai:chatting' },
  { label: '⚙️ เพิ่มเติม', state: 'menu:more_ops' },
];

/** Manager shortcuts for owner / secretary / big_leader — under เพิ่มเติม. */
export const EMPLOYEE_MORE_MANAGER_OPS: TelegramMenuButton[] = [
  { label: '🧭 ศูนย์ปฏิบัติการ', state: 'ops:center' },
  { label: '⚠️ ความเสี่ยงกำลังคน', state: 'workforce:risk' },
  { label: '✅ งานรออนุมัติ', state: 'unified:inbox' },
  { label: '👥 พนักงาน', state: 'owner:dashboard' },
  { label: '📅 ปฏิทินบริษัท', state: 'calendar:company' },
];

/** Marketing extras — only when marketing feature flag is on; shown under เพิ่มเติม. */
export const MARKETING_EMPLOYEE_MORE_MENU: TelegramMenuButton[] = [
  { label: '📊 ส่งยอดการตลาด', state: 'marketing:submit' },
  { label: '📋 รายงานล่าสุดของฉัน', state: 'marketing:latest_report' },
  { label: '📈 KPI ของฉัน', state: 'marketing:my_kpi' },
  { label: '💸 บันทึกรายจ่ายการตลาด', state: 'marketing:expense_submit' },
];

export const MENU_CLOSE: TelegramMenuButton = { label: '❌ ปิด', state: 'menu:close' };

/** Persistent bottom reply keyboard — returns to main menu. */
export const REPLY_KEYBOARD_HOME: TelegramMenuButton = { label: '📋 เมนู', state: 'home' };

export interface EmployeeReplyKeyboardOptions {
  isSubLeader?: boolean;
  isSecretary?: boolean;
  isBigLeader?: boolean;
  isOwner?: boolean;
}

/** Compact reply keyboard (2+2+up to 5+home) for employees, owners, and leaders. */
export function buildEmployeeReplyKeyboard(
  day: WorkDayDto,
  options?: EmployeeReplyKeyboardOptions,
): TelegramMenuButton[][] {
  const primary = buildEmployeePrimaryActions(day.state, day.attendance);
  const row1: TelegramMenuButton[] = primary.length >= 2
    ? [primary[0], primary[1]]
    : primary.length === 1
      ? [primary[0], { label: '📝 คำร้อง', state: 'request:menu' }]
      : [ATTENDANCE_MENU_BUTTON, { label: '📝 คำร้อง', state: 'request:menu' }];

  const row2: TelegramMenuButton[] = [
    { label: '📅 ตารางทีม', state: 'calendar:menu' },
    { label: '💰 เงินเดือน/สลิป', state: 'payroll:view_payslip' },
  ];

  const showApprovals = Boolean(
    options?.isSubLeader || options?.isOwner || options?.isSecretary || options?.isBigLeader,
  );
  const showOps = Boolean(options?.isOwner || options?.isSecretary || options?.isBigLeader);

  const row3: TelegramMenuButton[] = [
    { label: '🗓 แจ้งวันหยุด', state: 'monthlyoff:menu' },
    { label: '📊 สรุปวันนี้', state: 'today:summary' },
  ];
  if (canShowAttendanceMenu(day.state)) {
    row3.push({ label: '⏰ เข้า-ออก', state: 'attendance:menu' });
  }
  if (showApprovals) {
    row3.push({ label: '✅ อนุมัติ', state: 'unified:inbox' });
  }
  if (showOps) {
    row3.push({ label: '🧭 ปฏิบัติการ', state: 'ops:center' });
  } else {
    row3.push({ label: '⚙️ เพิ่มเติม', state: 'menu:more_employee' });
  }
  while (row3.length > 5) {
    row3.splice(2, 1);
  }

  return [row1, row2, row3, [REPLY_KEYBOARD_HOME]];
}

/** Reply keyboard for back-office operators (no attendance self-service). */
export function buildOperatorReplyKeyboard(options?: { multiCompany?: boolean }): TelegramMenuButton[][] {
  const row1: TelegramMenuButton[] = [
    { label: '✅ งานรออนุมัติ', state: 'unified:inbox' },
    { label: '📊 สรุปวันนี้', state: 'operator:digest' },
  ];
  const row2: TelegramMenuButton[] = [
    { label: '🧭 ศูนย์ปฏิบัติการ', state: 'ops:center' },
    { label: '👥 พนักงาน', state: 'owner:dashboard' },
  ];
  const row3: TelegramMenuButton[] = [
    { label: '⚠️ ความเสี่ยง', state: 'workforce:risk' },
    { label: '📅 ปฏิทิน', state: 'calendar:company' },
    { label: '🤖 AI', state: 'ai:chatting' },
    { label: '⚙️ เพิ่มเติม', state: 'menu:more_ops' },
  ];
  if (options?.multiCompany) {
    row3.unshift({ label: '🏢 บริษัท', state: 'operator:company' });
    while (row3.length > 5) row3.pop();
  }
  return [row1, row2, row3, [REPLY_KEYBOARD_HOME]];
}

export function resolveReplyKeyboardState(
  text: string,
  rows: TelegramMenuButton[][],
): string | null {
  const trimmed = text.trim();
  for (const row of rows) {
    for (const button of row) {
      if (button.label === trimmed) return button.state;
    }
  }
  if (trimmed === '📋 เมนูหลัก' || trimmed === '🏠 Home') return 'home';
  return null;
}

/** Always-visible fallback — opens attendance submenu (check-in/out/break). */
export const ATTENDANCE_MENU_BUTTON: TelegramMenuButton = {
  label: '⏰ เข้า-ออกงาน',
  state: 'attendance:menu',
};

/** Legacy states that must redirect to the v1 main menu (old keyboards / pinned messages). */
export const LEGACY_MAIN_MENU_REDIRECT_STATES = [
  'attendance:confirming_checkin',
] as const;

/** States that must NOT appear on employee main menu in v1. */
export const V1_EXCLUDED_EMPLOYEE_MAIN_STATES = [
  'performance:team',
  'competency:my',
  'succession:overview',
  'ai:manager:menu',
  'graph:query:menu',
  'training:menu',
  'hr:summary',
  'attendance:alerts',
  'ai:brief:today',
] as const;

export function canShowAttendanceMenu(state: WorkDayState): boolean {
  return state !== 'LEAVE' && state !== 'MONTHLY_OFF' && state !== 'HOLIDAY';
}

export function buildEmployeePrimaryActions(
  state: WorkDayState,
  attendance?: { checkInAt?: string | null; checkOutAt?: string | null } | null,
): TelegramMenuButton[] {
  if (state === 'LEAVE' || state === 'MONTHLY_OFF' || state === 'HOLIDAY') {
    return [];
  }

  const hasCheckIn = Boolean(attendance?.checkInAt);
  const hasCheckOut = Boolean(attendance?.checkOutAt);

  if (!hasCheckIn) {
    return [{ label: '🟢 เข้างาน', state: 'confirm:checkin' }];
  }

  switch (state) {
    case 'MISSING_CHECK_OUT':
      return [{ label: '🔴 เลิกงาน', state: 'confirm:checkout' }];
    case 'WORKING':
      return [
        { label: '☕ ไปพัก', state: 'confirm:break_start' },
        { label: '🚫 แจ้งไม่พักเบรก', state: 'request:quick:no_break' },
        { label: '🔴 เลิกงาน', state: 'confirm:checkout' },
      ];
    case 'BREAK':
      return [{ label: '▶️ กลับจากพัก', state: 'confirm:break_end' }];
    case 'FINISHED':
    case 'OT':
      return [
        { label: '🚫 แจ้งไม่พักเบรก', state: 'request:quick:no_break' },
        { label: '📋 สรุปวันนี้', state: 'today:summary' },
      ];
    default:
      if (!hasCheckOut) {
        return [{ label: '🔴 เลิกงาน', state: 'confirm:checkout' }];
      }
      return [{ label: '📋 สรุปวันนี้', state: 'today:summary' }];
  }
}

export interface EmployeeTodayHeaderOptions {
  /** Calendar date (Bangkok) — when set, shows carry-over hint for open night shifts. */
  calendarDateIso?: string;
}

export function buildEmployeeTodayHeader(
  day: WorkDayDto,
  options?: EmployeeTodayHeaderOptions,
): string {
  const shiftLabel = day.shift?.shiftName ?? '—';
  const lines = ['📍 <b>วันนี้</b>', `กะ: ${shiftLabel}`];
  const openFromPriorDay = Boolean(
    options?.calendarDateIso
    && day.date !== options.calendarDateIso
    && day.attendance?.checkInAt
    && !day.attendance?.checkOutAt,
  );
  if (openFromPriorDay) {
    lines.push(
      `⚠️ กะค้างจากวันที่ ${formatDateShort(day.date)} — กด <b>🔴 เลิกงาน</b> ก่อนเข้างานใหม่`,
    );
  }

  switch (day.state) {
    case 'WORKING':
      lines.push('สถานะ: กำลังทำงาน');
      if (day.attendance?.checkInAt) lines.push(`เข้างาน: ${formatTime(day.attendance.checkInAt)}`);
      if ((day.attendance?.lateMinutes ?? 0) > 0) {
        lines.push(`สาย ${day.attendance!.lateMinutes} นาที`);
      }
      break;
    case 'BREAK':
      lines.push('สถานะ: กำลังพัก');
      break;
    case 'FINISHED':
    case 'OT':
      lines.push('สถานะ: เลิกงานแล้ว');
      if (day.attendance?.checkInAt) lines.push(`เข้า: ${formatTime(day.attendance.checkInAt)}`);
      if (day.attendance?.checkOutAt) lines.push(`ออก: ${formatTime(day.attendance.checkOutAt)}`);
      break;
    case 'MONTHLY_OFF':
      lines.push('วันนี้เป็นวันหยุดของคุณ');
      break;
    case 'LEAVE':
      lines.push(`วันนี้คุณลา${day.leave?.leaveTypeName ? ` (${day.leave.leaveTypeName})` : ''}`);
      break;
    case 'NEEDS_RECALCULATION':
      lines.push('⚠️ มีรายการรอตรวจสอบ');
      break;
    case 'MISSING_CHECK_IN':
      lines.push('ยังไม่ได้กดเข้างาน');
      break;
    case 'MISSING_CHECK_OUT':
      lines.push('ยังไม่ได้กดเลิกงาน');
      break;
    case 'ABSENT':
      lines.push('ยังไม่ได้กดเข้างาน');
      break;
    case 'SCHEDULED':
      lines.push('พร้อมเข้างาน — กดปุ่ม 🟢 เข้างาน');
      break;
    case 'HOLIDAY':
      lines.push('วันนี้เป็นวันหยุด');
      break;
    default:
      lines.push('พร้อมเข้างาน');
      break;
  }
  return lines.join('\n');
}

export interface EmployeeMenuBuildOptions {
  includeMore?: boolean;
  includeClose?: boolean;
  isSubLeader?: boolean;
  marketingEnabled?: boolean;
  calendarDateIso?: string;
  /** @deprecated Owner now uses the same Today menu as employees (with check-in). */
  skipAttendanceActions?: boolean;
}

/** Single employee main-menu keyboard — primary WorkDay action, 4 secondary rows, เพิ่มเติม. */
export function buildEmployeeTodayKeyboard(
  day: WorkDayDto,
  options?: EmployeeMenuBuildOptions,
): TelegramMenuButton[][] {
  const rows: TelegramMenuButton[][] = [];
  const primary = buildEmployeePrimaryActions(day.state, day.attendance);
  rows.push(...primary.map((b) => [b]));

  if (canShowAttendanceMenu(day.state)) {
    rows.push([ATTENDANCE_MENU_BUTTON]);
  }

  for (const secondary of EMPLOYEE_SECONDARY_ACTIONS.slice(0, 4)) {
    rows.push([secondary]);
  }

  if (options?.includeMore !== false) {
    rows.push([{ label: '⚙️ เพิ่มเติม', state: 'menu:more_employee' }]);
  }
  if (options?.includeClose) {
    rows.push([MENU_CLOSE]);
  }
  return rows;
}

/** Dedicated attendance submenu — fallback when main-menu primary row was dismissed. */
export function buildAttendanceMenuKeyboard(day: WorkDayDto): TelegramMenuButton[][] {
  const rows: TelegramMenuButton[][] = [];
  const actions = buildEmployeePrimaryActions(day.state, day.attendance);
  if (actions.length === 0) {
    rows.push([{ label: '📋 สรุปวันนี้', state: 'today:summary' }]);
  } else {
    rows.push(...actions.map((b) => [b]));
  }
  rows.push([{ label: '📊 สรุปเดือนนี้', state: 'attendance:month_summary' }]);
  rows.push([{ label: '🔙 กลับเมนูหลัก', state: 'home' }]);
  return rows;
}

export function buildEmployeeMoreMenuButtons(options: {
  isSubLeader?: boolean;
  isSecretary?: boolean;
  isBigLeader?: boolean;
  isOwner?: boolean;
  marketingEnabled?: boolean;
}): TelegramMenuButton[] {
  const buttons: TelegramMenuButton[] = [ATTENDANCE_MENU_BUTTON];
  if (options.isSubLeader) buttons.push(...EMPLOYEE_MORE_LEADER_V1);
  if (options.isOwner || options.isSecretary || options.isBigLeader) {
    buttons.push(...EMPLOYEE_MORE_MANAGER_OPS);
  }
  if (options.marketingEnabled) {
    buttons.push(...EMPLOYEE_MORE_MENU_V1, ...MARKETING_EMPLOYEE_MORE_MENU);
  }
  return buttons;
}

export function buildEmployeeMoreMenuKeyboard(options: {
  isSubLeader?: boolean;
  isSecretary?: boolean;
  isBigLeader?: boolean;
  isOwner?: boolean;
  marketingEnabled?: boolean;
}): TelegramMenuButton[][] {
  return [
    ...buildEmployeeMoreMenuButtons(options).map((b) => [b]),
    [{ label: '🔙 กลับ', state: 'home' }],
  ];
}

export function buildOpsMoreMenuKeyboard(): TelegramMenuButton[][] {
  return [
    ...OPS_MORE_MENU_V1.map((b) => [b]),
    [{ label: '🔙 กลับ', state: 'home' }],
  ];
}

export function buildManagerOperationsKeyboard(includeClose = false): TelegramMenuButton[][] {
  const rows = MANAGER_OPERATIONS_MENU.map((b) => [b]);
  if (includeClose) rows.push([MENU_CLOSE]);
  return rows;
}

export function buildOperatorMainMenu(options?: {
  displayName?: string;
  businessRole?: string | null;
  companyName?: string;
  multiCompany?: boolean;
  companyCount?: number;
  includeClose?: boolean;
}): { header: string; keyboard: TelegramMenuButton[][] } {
  const roleLabel = options?.businessRole === 'owner'
    ? 'เจ้าของ'
    : options?.businessRole === 'secretary'
      ? 'เลขา / HR'
      : options?.businessRole === 'big_leader'
        ? 'หัวหน้าทีมใหญ่'
        : 'ผู้บริหาร';
  const name = options?.displayName?.trim();
  const lines = [
    '🏢 <b>WorkHQ ผู้บริหาร</b>',
    name ? `สวัสดี ${name} (${roleLabel})` : roleLabel,
  ];
  if (options?.companyName) {
    const extraCompanies = (options.companyCount ?? 0) > 1
      ? ` (มีอีก ${(options.companyCount ?? 0) - 1} บริษัท — กด 🏢 เลือกบริษัท)`
      : '';
    lines.push(`บริษัทที่เลือก: <b>${options.companyName}</b>${extraCompanies}`);
  }
  lines.push('', 'ดูรายงาน อนุมัติคำขอ ปฏิทิน และคุยกับ AI ได้จากเมนูด้านล่าง');
  const rows: TelegramMenuButton[][] = [];
  if (options?.multiCompany) {
    rows.push([{ label: '🏢 เลือกบริษัท', state: 'operator:company' }]);
  }
  rows.push(...OPERATOR_MAIN_MENU.map((b) => [b]));
  if (options?.includeClose !== false) rows.push([MENU_CLOSE]);
  return { header: lines.join('\n'), keyboard: rows };
}

export function buildEmployeeMainMenu(
  day: WorkDayDto,
  options?: EmployeeMenuBuildOptions,
): { header: string; keyboard: TelegramMenuButton[][] } {
  return {
    header: buildEmployeeTodayHeader(day, { calendarDateIso: options?.calendarDateIso }),
    keyboard: buildEmployeeTodayKeyboard(day, options),
  };
}

export function buildOwnerMainMenu(
  day: WorkDayDto,
  options?: Omit<EmployeeMenuBuildOptions, 'skipAttendanceActions'>,
): { header: string; keyboard: TelegramMenuButton[][] } {
  return buildEmployeeMainMenu(day, options);
}

export function buildManagerMainMenu(
  day: WorkDayDto | null,
  options?: { includeClose?: boolean },
): { header: string; keyboard: TelegramMenuButton[][] } {
  const lines = ['🧭 <b>ศูนย์ปฏิบัติการ</b>'];
  if (day) lines.push(buildEmployeeTodayHeader(day));
  return {
    header: lines.join('\n\n'),
    keyboard: buildManagerOperationsKeyboard(options?.includeClose),
  };
}

export function isLegacyMainMenuState(state: string): boolean {
  return (LEGACY_MAIN_MENU_REDIRECT_STATES as readonly string[]).includes(state);
}

/** Business role drives Telegram main menu (manager ops vs employee Today). */
export function isTelegramOwnerRole(businessRole: BusinessRoleCode | null | undefined): boolean {
  return businessRole === 'owner';
}

/** Secretary / big_leader use employee Today menu (check-in required) with manager shortcuts in เพิ่มเติม. */
export function shouldShowManagerOperationsMenu(businessRole: BusinessRoleCode | null | undefined): boolean {
  return false;
}

export type TelegramMainMenuKind = 'manager_ops' | 'employee_today' | 'owner';

export function resolveTelegramMainMenuKind(
  businessRole: BusinessRoleCode | null | undefined,
): TelegramMainMenuKind {
  if (isTelegramOwnerRole(businessRole)) return 'owner';
  return 'employee_today';
}

export function isTelegramSubLeaderRole(businessRole: BusinessRoleCode | null | undefined): boolean {
  return businessRole === 'sub_leader';
}

export function employeeMainMenuExcludesV1Features(buttons: TelegramMenuButton[]): boolean {
  const states = buttons.map((b) => b.state);
  return V1_EXCLUDED_EMPLOYEE_MAIN_STATES.every((excluded) => !states.includes(excluded));
}

export function toInlineKeyboard(
  rows: TelegramMenuButton[][],
): Array<Array<{ text: string; callback_data: string }>> {
  return rows.map((row) => row.map((b) => ({ text: b.label, callback_data: b.state })));
}

export function toReplyKeyboardMarkup(rows: TelegramMenuButton[][]): {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  is_persistent: true;
} {
  return {
    keyboard: rows.map((row) => row.map((b) => ({ text: b.label }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Temporary /start debug footer — proves menu builder + deployment build. */
export function formatTelegramMenuDebugFooter(input: {
  menuKind: 'employee' | 'manager' | 'owner';
  businessRole: string | null;
  buildSha: string;
}): string {
  return [
    `menuKind=${input.menuKind}`,
    `businessRole=${input.businessRole ?? 'null'}`,
    'builder=telegram-menu.builder.ts',
    `WorkHQ Bot Build: ${input.buildSha}`,
  ].join('\n');
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}
