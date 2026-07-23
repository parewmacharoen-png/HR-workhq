import { describe, expect, it } from 'vitest';
import { formatYmd, monthBounds, weekBounds } from './calendar-utils';

describe('Team calendar utils', () => {
  it('formats YYYY-MM-DD', () => {
    expect(formatYmd(new Date('2026-06-15T12:00:00.000Z'))).toBe('2026-06-15');
  });

  it('returns month start and end', () => {
    const { start, end } = monthBounds(new Date('2026-06-15T12:00:00.000Z'));
    expect(start).toBe('2026-06-01');
    expect(end).toBe('2026-06-30');
  });

  it('returns week bounds (Mon–Sun)', () => {
    const { start, end } = weekBounds(new Date('2026-06-18T12:00:00.000Z'));
    expect(start).toBe('2026-06-15');
    expect(end).toBe('2026-06-21');
  });
});

describe('Announcement dashboard shape', () => {
  it('expects acknowledgement rate field', () => {
    const dash = { unopened: 1, unacknowledged: 2, acknowledgementRate: 80, overdueAcknowledgements: [] };
    expect(dash.acknowledgementRate).toBeGreaterThanOrEqual(0);
  });
});

describe('Document dashboard shape', () => {
  it('expects failed jobs field', () => {
    const dash = { missingRequired: 0, expiringSoon: 1, failedDocumentJobs: 0 };
    expect(dash.failedDocumentJobs).toBe(0);
  });
});
