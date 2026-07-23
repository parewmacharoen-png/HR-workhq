/** Patterns that must never be shown to end users. */
const SENSITIVE_PATTERNS = [
  /database error/i,
  /prisma/i,
  /sql/i,
  /postgres/i,
  /connection refused/i,
  /ECONNREFUSED/i,
  /internal server error/i,
  /unique constraint/i,
  /foreign key constraint/i,
  /P\d{4}/i,
];

const DEFAULT_USER_MESSAGE = 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function sanitizeApiErrorMessage(raw: string, status?: number): string {
  if (!raw?.trim()) {
    return status === 403
      ? 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
      : DEFAULT_USER_MESSAGE;
  }

  if (status === 403) return 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้';
  if (status === 404) return 'ไม่พบข้อมูลที่ต้องการ';
  if (status === 401) return 'กรุณาเข้าสู่ระบบใหม่';

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(raw)) return DEFAULT_USER_MESSAGE;
  }

  if (status != null && status >= 500) return DEFAULT_USER_MESSAGE;

  return raw;
}

export function extractReferenceCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'requestId' in error) {
    const id = (error as { requestId?: string }).requestId;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}
