// ============================================================================
// Telegram bot slash commands — shown in the "/" suggestion menu.
// ============================================================================

export interface TelegramBotCommandDef {
  command: string;
  description: string;
}

/** Registered via setMyCommands — keep in sync with dispatch handlers. */
export const TELEGRAM_BOT_COMMANDS: TelegramBotCommandDef[] = [
  { command: 'start', description: 'เปิดเมนูหลัก' },
  { command: 'menu', description: 'เปิดเมนูหลัก + ปุ่มลัด' },
  { command: 'checkin', description: 'เช็กอิน/เช็กเอาท์เข้างาน' },
  { command: 'checkout', description: 'ออกงาน (เลิกกะ)' },
  { command: 'help', description: 'ดูคำสั่งทั้งหมด' },
  { command: 'status', description: 'สถานะการลงทะเบียน Telegram' },
  { command: 'report', description: 'เมนูรายงาน' },
  { command: 'attendance', description: 'สรุปเข้างานรายเดือน' },
  { command: 'today', description: 'รายงานเข้างานวันนี้' },
  { command: 'morning', description: 'รายงานเช้า' },
  { command: 'evening', description: 'รายงานเย็น' },
  { command: 'company', description: 'สรุปภาพรวมบริษัท' },
  { command: 'brief', description: 'สรุป AI Manager (เช้า)' },
  { command: 'urgent', description: 'รายการเร่งด่วน' },
];

export function formatTelegramHelpText(): string {
  const lines = TELEGRAM_BOT_COMMANDS.map(
    (c) => `/${c.command} — ${c.description}`,
  );
  return [
    '📖 <b>คำสั่งที่ใช้ได้</b>',
    '',
    ...lines,
    '',
    '💡 พิมพ์ <code>/</code> หรือกดปุ่ม <b>Menu</b> ข้างช่องพิมพ์',
  ].join('\n');
}
