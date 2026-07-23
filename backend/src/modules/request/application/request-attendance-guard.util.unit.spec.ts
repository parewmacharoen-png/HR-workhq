import {
  assertNoBreakReportAllowed,
  assertOtOutsideShiftHours,
  assertOtRequestAllowed,
  buildOtWindowOnWorkDate,
  intervalsOverlap,
  type AttendanceDaySnapshot,
} from './request-attendance-guard.util';

function baseSnapshot(overrides: Partial<AttendanceDaySnapshot> = {}): AttendanceDaySnapshot {
  return {
    recordId: 'rec-1',
    checkInAt: new Date('2026-07-02T02:00:00.000Z'),
    checkOutAt: null,
    breakStartAt: null,
    totalBreakMinutes: 0,
    breakRecordCount: 0,
    onApprovedLeave: false,
    hasAbsencePenalty: false,
    existingOtRecords: 0,
    existingOpenOtRequests: 0,
    existingOpenNoBreakRequests: 0,
    shiftStartAt: new Date('2026-07-02T02:00:00.000Z'), // 09:00 Bangkok
    shiftEndAt: new Date('2026-07-02T14:00:00.000Z'), // 21:00 Bangkok
    shiftName: 'กะกลางวัน',
    ...overrides,
  };
}

describe('request-attendance-guard.util', () => {
  it('blocks OT without check-in', () => {
    expect(() => assertOtRequestAllowed(baseSnapshot({ recordId: null, checkInAt: null })))
      .toThrow('ต้องเช็กอิน');
  });

  it('blocks OT when absence flagged and no check-in', () => {
    expect(() => assertOtRequestAllowed(baseSnapshot({ hasAbsencePenalty: true })))
      .toThrow('ขาดงาน');
  });

  it('blocks duplicate OT', () => {
    expect(() => assertOtRequestAllowed(baseSnapshot({ existingOtRecords: 1 })))
      .toThrow('มีรายการ OT');
  });

  it('blocks no-break when break was taken', () => {
    expect(() => assertNoBreakReportAllowed(baseSnapshot({ totalBreakMinutes: 15 })))
      .toThrow('พบการพักเบรก');
  });

  it('allows no-break when checked in and no break', () => {
    expect(() => assertNoBreakReportAllowed(baseSnapshot())).not.toThrow();
  });

  it('blocks OT fully inside regular shift hours', () => {
    expect(() => assertOtOutsideShiftHours({
      workDateIso: '2026-07-02',
      startTime: '13.00',
      endTime: '14.00',
      shiftStartAt: new Date('2026-07-02T02:00:00.000Z'),
      shiftEndAt: new Date('2026-07-02T14:00:00.000Z'),
      shiftName: 'กะกลางวัน',
    })).toThrow('นอกเวลาทำงาน');
  });

  it('allows OT after shift ends', () => {
    expect(() => assertOtOutsideShiftHours({
      workDateIso: '2026-07-02',
      startTime: '21.00',
      endTime: '22.00',
      shiftStartAt: new Date('2026-07-02T02:00:00.000Z'),
      shiftEndAt: new Date('2026-07-02T14:00:00.000Z'),
      shiftName: 'กะกลางวัน',
    })).not.toThrow();
  });

  it('blocks OT that partially overlaps shift', () => {
    expect(() => assertOtOutsideShiftHours({
      workDateIso: '2026-07-02',
      startTime: '20.00',
      endTime: '22.00',
      shiftStartAt: new Date('2026-07-02T02:00:00.000Z'),
      shiftEndAt: new Date('2026-07-02T14:00:00.000Z'),
    })).toThrow('นอกเวลาทำงาน');
  });

  it('builds overnight OT window on next calendar day', () => {
    const window = buildOtWindowOnWorkDate('2026-07-02', '22.00', '01.00');
    expect(window).not.toBeNull();
    expect(window!.end.getTime()).toBeGreaterThan(window!.start.getTime());
  });

  it('detects interval overlap', () => {
    const aStart = new Date('2026-07-02T06:00:00.000Z');
    const aEnd = new Date('2026-07-02T07:00:00.000Z');
    const bStart = new Date('2026-07-02T02:00:00.000Z');
    const bEnd = new Date('2026-07-02T14:00:00.000Z');
    expect(intervalsOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });
});
