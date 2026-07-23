import { describe, expect, it } from 'vitest';
import { sanitizeApiErrorMessage } from './sanitize-api-error';

describe('sanitizeApiErrorMessage', () => {
  it('replaces database errors with safe Thai message', () => {
    expect(sanitizeApiErrorMessage('Database Error: connection failed', 500)).toBe(
      'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    );
    expect(sanitizeApiErrorMessage('PrismaClientKnownRequestError', 500)).toBe(
      'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    );
  });

  it('returns permission message for 403', () => {
    expect(sanitizeApiErrorMessage('Forbidden', 403)).toBe('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
  });
});
