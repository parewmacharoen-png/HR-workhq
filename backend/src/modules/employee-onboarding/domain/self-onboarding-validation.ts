// Input validation for Telegram self-onboarding text fields.

export function normalizeThaiPhoneInput(value: string): string {
  return value.replace(/\D/g, '');
}

/** Thai mobile: 10 digits starting with 06, 08, or 09. */
export function validateSelfOnboardingPhone(value: string): string | null {
  const digits = normalizeThaiPhoneInput(value);
  if (!/^0[689]\d{8}$/.test(digits)) {
    return (
      '❌ เบอร์โทรไม่ถูกต้อง\n' +
      'กรุณากรอก <b>10 หลัก</b> ขึ้นต้น 06, 08 หรือ 09\n' +
      'เช่น <code>0812345678</code>'
    );
  }
  return null;
}

export function validateSelfOnboardingFullName(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 3) {
    return '❌ กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน';
  }
  if (!trimmed.includes(' ')) {
    return '❌ กรุณากรอกทั้งชื่อและนามสกุล (คั่นด้วยเว้นวรรค)';
  }
  return null;
}

export const SELF_ONBOARDING_FIELD_HINTS: Record<string, string> = {
  phone: 'กรอกเบอร์มือถือ 10 หลัก เช่น 0812345678',
  emergencyContactPhone: 'กรอกเบอร์ติดต่อฉุกเฉิน 10 หลัก เช่น 0898765432',
  fullName: 'กรอกชื่อและนามสกุล เช่น สมชาย ใจดี',
  bankAccountNumber: 'กรอกเลขบัญชีเป็นตัวเลข 10–15 หลัก',
  dateOfBirth: 'กรอกวัน/เดือน/ปี เช่น 15/06/1995',
};
