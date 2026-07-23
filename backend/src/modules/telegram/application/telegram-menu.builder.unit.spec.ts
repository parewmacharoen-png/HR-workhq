// ============================================================================
// modules/telegram/application/telegram-menu.builder.unit.spec.ts
// ============================================================================

import {
  ATTENDANCE_MENU_BUTTON,
  buildAttendanceMenuKeyboard,
  buildEmployeeMainMenu,
  buildEmployeeMoreMenuKeyboard,
  buildEmployeePrimaryActions,
  buildEmployeeReplyKeyboard,
  buildEmployeeTodayHeader,
  buildEmployeeTodayKeyboard,
  buildManagerMainMenu,
  buildManagerOperationsKeyboard,
  buildOperatorReplyKeyboard,
  buildOpsMoreMenuKeyboard,
  buildOwnerMainMenu,
  canShowAttendanceMenu,
  employeeMainMenuExcludesV1Features,
  EMPLOYEE_SECONDARY_ACTIONS,
  formatTelegramMenuDebugFooter,
  isLegacyMainMenuState,
  isTelegramOwnerRole,
  LEGACY_MAIN_MENU_REDIRECT_STATES,
  MANAGER_OPERATIONS_MENU,
  MENU_CLOSE,
  REPLY_KEYBOARD_HOME,
  resolveReplyKeyboardState,
  resolveTelegramMainMenuKind,
  shouldShowManagerOperationsMenu,
  toReplyKeyboardMarkup,
  V1_EXCLUDED_EMPLOYEE_MAIN_STATES,
} from './telegram-menu.builder';
import type { WorkDayDto } from '../../workday/domain/workday-state.types';

const baseDay: WorkDayDto = {
  employee: { id: 'e1', globalId: 'G1', firstName: 'A', lastName: 'B', teamName: null },
  date: '2026-06-29',
  state: 'SCHEDULED',
  shift: { shiftId: null, shiftName: 'กะเช้า', shiftStartAt: null, shiftEndAt: null, startMinutes: 540, endMinutes: 1080, crossesMidnight: false },
  attendance: null,
  monthlyOff: { requestId: null, status: null },
  leave: { requestId: null, leaveTypeCode: null, leaveTypeName: null, status: null },
  overtime: { id: null, otHours: 0, amount: 0, status: null },
  exceptions: [],
  payrollImpact: null,
  timeline: [],
};

describe('telegram-menu.builder', () => {
  it('employee secondary actions has max 4 items', () => {
    expect(EMPLOYEE_SECONDARY_ACTIONS.length).toBeLessThanOrEqual(4);
  });

  it('employee main keyboard excludes v1 blocked features', () => {
    const keyboard = buildEmployeeTodayKeyboard(baseDay);
    const flat = keyboard.flat().map((b) => b.state);
    expect(employeeMainMenuExcludesV1Features(keyboard.flat())).toBe(true);
    for (const excluded of V1_EXCLUDED_EMPLOYEE_MAIN_STATES) {
      expect(flat).not.toContain(excluded);
    }
  });

  it('employee main keyboard uses one row per secondary action', () => {
    const keyboard = buildEmployeeTodayKeyboard(baseDay);
    const secondaryRows = keyboard.filter((row) =>
      row.length === 1 && EMPLOYEE_SECONDARY_ACTIONS.some((s) => s.state === row[0].state),
    );
    expect(secondaryRows).toHaveLength(4);
  });

  it('scheduled employee main menu has primary + attendance fallback + 4 secondary + more', () => {
    const { keyboard } = buildEmployeeMainMenu(baseDay);
    const labels = keyboard.flat().map((b) => b.label);
    expect(labels).toContain('🟢 เข้างาน');
    expect(labels).toContain('⏰ เข้า-ออกงาน');
    expect(labels).toContain('📅 ตารางทีม');
    expect(labels).toContain('🗓 แจ้งวันหยุด');
    expect(labels).toContain('📝 คำร้อง');
    expect(labels).toContain('💰 เงินเดือน/สลิป');
    expect(labels).toContain('⚙️ เพิ่มเติม');
    expect(labels).not.toContain('✅ เข้างาน');
    expect(labels).not.toContain('🤖 AI Manager');
  });

  it('legacy main menu states are flagged for redirect', () => {
    for (const legacy of LEGACY_MAIN_MENU_REDIRECT_STATES) {
      expect(isLegacyMainMenuState(legacy)).toBe(true);
    }
    expect(isLegacyMainMenuState('confirm:checkin')).toBe(false);
    expect(isLegacyMainMenuState('attendance:menu')).toBe(false);
  });

  it('attendance submenu exposes check-in and back to home', () => {
    const keyboard = buildAttendanceMenuKeyboard(baseDay);
    const states = keyboard.flat().map((b) => b.state);
    expect(states).toContain('confirm:checkin');
    expect(states).toContain('attendance:month_summary');
    expect(states).toContain('home');
  });

  it('leave day hides attendance fallback on main menu', () => {
    const day: WorkDayDto = { ...baseDay, state: 'LEAVE' };
    const states = buildEmployeeTodayKeyboard(day).flat().map((b) => b.state);
    expect(canShowAttendanceMenu(day.state)).toBe(false);
    expect(states).not.toContain(ATTENDANCE_MENU_BUTTON.state);
  });

  it('formats temporary menu debug footer', () => {
    const footer = formatTelegramMenuDebugFooter({
      menuKind: 'employee',
      businessRole: 'owner',
      buildSha: 'abc1234',
    });
    expect(footer).toContain('menuKind=employee');
    expect(footer).toContain('businessRole=owner');
    expect(footer).toContain('builder=telegram-menu.builder.ts');
    expect(footer).toContain('WorkHQ Bot Build: abc1234');
  });

  it('manager main menu uses operations keyboard only', () => {
    const { header, keyboard } = buildManagerMainMenu(baseDay);
    expect(header).toContain('ศูนย์ปฏิบัติการ');
    const states = keyboard.flat().map((b) => b.state);
    expect(states).toEqual(expect.arrayContaining([
      'ops:center',
      'workforce:risk',
      'unified:inbox',
    ]));
    expect(states).not.toContain('attendance:menu');
    expect(states).not.toContain('ai:chatting');
  });

  it('scheduled shows check-in primary action', () => {
    expect(buildEmployeePrimaryActions('SCHEDULED', null)[0].state).toBe('confirm:checkin');
  });

  it('absent still offers check-in', () => {
    expect(buildEmployeePrimaryActions('ABSENT', null)[0].state).toBe('confirm:checkin');
  });

  it('working shows break, no-break report, and checkout when checked in', () => {
    const actions = buildEmployeePrimaryActions('WORKING', {
      checkInAt: '2026-06-29T02:00:00.000Z',
      checkOutAt: null,
    });
    expect(actions.map((a) => a.state)).toEqual([
      'confirm:break_start',
      'request:quick:no_break',
      'confirm:checkout',
    ]);
  });

  it('header hints carry-over night shift when work date differs from calendar date', () => {
    const day: WorkDayDto = {
      ...baseDay,
      date: '2026-07-05',
      state: 'WORKING',
      attendance: {
        id: 'a1',
        checkInAt: '2026-07-05T14:00:00.000Z',
        checkOutAt: null,
        breakStartAt: null,
        breakEndAt: null,
        lateMinutes: 0,
        roundedLateHours: 0,
        lateDeduction: 0,
        workedMinutes: 0,
        needsRecalculation: false,
      },
    };
    const header = buildEmployeeTodayHeader(day, { calendarDateIso: '2026-07-06' });
    expect(header).toContain('กะค้างจากวันที่');
    expect(header).toContain('เลิกงาน');
  });

  it('break shows back button when on break', () => {
    expect(buildEmployeePrimaryActions('BREAK', {
      checkInAt: '2026-06-29T02:00:00.000Z',
      checkOutAt: null,
    })[0].state).toBe('confirm:break_end');
  });

  it('finished shows no-break report and summary after checkout', () => {
    expect(buildEmployeePrimaryActions('FINISHED', {
      checkInAt: '2026-06-29T02:00:00.000Z',
      checkOutAt: '2026-06-29T10:00:00.000Z',
    }).map((a) => a.state)).toEqual([
      'request:quick:no_break',
      'today:summary',
    ]);
  });

  it('manager menu shows operations/risk/approval', () => {
    const states = MANAGER_OPERATIONS_MENU.map((b) => b.state);
    expect(states).toContain('ops:center');
    expect(states).toContain('workforce:risk');
    expect(states).toContain('unified:inbox');
    expect(buildManagerOperationsKeyboard().length).toBe(MANAGER_OPERATIONS_MENU.length);
  });

  it('owner main menu includes check-in like other employees', () => {
    const { header, keyboard } = buildOwnerMainMenu(baseDay);
    const states = keyboard.flat().map((b) => b.state);
    expect(header).toContain('วันนี้');
    expect(states).toContain('confirm:checkin');
    expect(states).toContain('attendance:menu');
    expect(states).toContain('request:menu');
  });

  it('employee business role shows Today menu with attendance', () => {
    expect(resolveTelegramMainMenuKind('employee')).toBe('employee_today');
    expect(shouldShowManagerOperationsMenu('employee')).toBe(false);
    expect(buildEmployeeMainMenu(baseDay).keyboard.flat().map((b) => b.state)).not.toContain('ops:center');
    expect(buildEmployeeMainMenu(baseDay).keyboard.flat().map((b) => b.state)).toContain('confirm:checkin');
  });

  it('owner uses owner menu kind; secretary/big_leader still use employee Today', () => {
    expect(resolveTelegramMainMenuKind('owner')).toBe('owner');
    expect(isTelegramOwnerRole('owner')).toBe(true);
    expect(resolveTelegramMainMenuKind('secretary')).toBe('employee_today');
    expect(resolveTelegramMainMenuKind('big_leader')).toBe('employee_today');
    expect(shouldShowManagerOperationsMenu('owner')).toBe(false);
    expect(shouldShowManagerOperationsMenu('secretary')).toBe(false);
  });

  it('manager operations keyboard still available for legacy/debug builders', () => {
    const { header, keyboard } = buildManagerMainMenu(baseDay);
    expect(header).toContain('ศูนย์ปฏิบัติการ');
    const states = keyboard.flat().map((b) => b.state);
    expect(states).toEqual(expect.arrayContaining([
      'ops:center',
      'workforce:risk',
      'unified:inbox',
    ]));
  });

  it('employee reply keyboard uses 4 rows ending with home button', () => {
    const rows = buildEmployeeReplyKeyboard(baseDay);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(2);
    expect(rows[3]).toEqual([REPLY_KEYBOARD_HOME]);
  });

  it('employee reply keyboard adds approval and ops shortcuts for owners', () => {
    const rows = buildEmployeeReplyKeyboard(baseDay, { isOwner: true });
    const labels = rows[2].map((b) => b.label);
    expect(labels).toContain('✅ อนุมัติ');
    expect(labels).toContain('🧭 ปฏิบัติการ');
  });

  it('operator reply keyboard exposes inbox and home', () => {
    const rows = buildOperatorReplyKeyboard();
    const states = rows.flat().map((b) => b.state);
    expect(states).toContain('unified:inbox');
    expect(states).toContain('home');
  });

  it('resolveReplyKeyboardState maps label to callback state', () => {
    const rows = buildEmployeeReplyKeyboard(baseDay);
    expect(resolveReplyKeyboardState('📋 เมนู', rows)).toBe('home');
    expect(resolveReplyKeyboardState('📝 คำร้อง', rows)).toBe('request:menu');
    expect(resolveReplyKeyboardState('unknown', rows)).toBeNull();
  });

  it('toReplyKeyboardMarkup enables persistent resized keyboard', () => {
    const markup = toReplyKeyboardMarkup(buildEmployeeReplyKeyboard(baseDay));
    expect(markup.resize_keyboard).toBe(true);
    expect(markup.is_persistent).toBe(true);
    expect(markup.keyboard[0][0].text).toBe('🟢 เข้างาน');
  });
});
