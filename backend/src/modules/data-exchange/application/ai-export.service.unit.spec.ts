// ============================================================================
// Unit tests — AI export parser
// ============================================================================

import { AiExportService } from './ai-export.service';

describe('AiExportService.parsePrompt', () => {
  const service = new AiExportService({} as never, {} as never, {} as never, {} as never, {} as never);

  it('maps sick leave Thai prompt', () => {
    const r = service.parsePrompt('ส่งรายงานคนที่ลาป่วยเดือนนี้');
    expect(r.module).toBe('leave');
    expect(r.filters.leaveType).toBe('sick');
  });

  it('maps payroll English prompt', () => {
    const r = service.parsePrompt('export payroll summary this month');
    expect(r.module).toBe('payroll');
  });

  it('maps telegram unlinked employees', () => {
    const r = service.parsePrompt('สร้าง Google Sheet คนที่ยังไม่เชื่อม Telegram');
    expect(r.module).toBe('employees');
    expect(r.filters.telegramLinked).toBe(false);
  });
});
