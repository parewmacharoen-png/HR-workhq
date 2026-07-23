export const EMPLOYEE_ONBOARDING_TYPE_KEY = 'employee_onboarding';
export const TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY = 'telegram_registration_review';

export const ONBOARDING_REQUEST_TYPE_KEYS = [
  EMPLOYEE_ONBOARDING_TYPE_KEY,
  TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY,
] as const;

export type OnboardingRequestTypeKey = typeof ONBOARDING_REQUEST_TYPE_KEYS[number];

export function isOnboardingRequestTypeKey(key: string): boolean {
  return (ONBOARDING_REQUEST_TYPE_KEYS as readonly string[]).includes(key);
}

export const ONBOARDING_REQUEST_DISPLAY_TH = 'รับพนักงานใหม่';

export const ONBOARDING_TIMELINE_EVENTS = {
  invitation_created: 'สร้างลิงก์เชิญ',
  invitation_started: 'เริ่มลงทะเบียนผ่าน Telegram',
  onboarding_submitted: 'ส่งข้อมูลให้ HR ตรวจสอบ',
  onboarding_approved: 'HR อนุมัติการรับพนักงาน',
  employee_created_from_invitation: 'สร้างข้อมูลพนักงานจากลิงก์เชิญ',
  telegram_link_approved: 'เชื่อม Telegram สำเร็จ',
  onboarding_rejected: 'HR ปฏิเสธการรับพนักงาน',
} as const;

export type OnboardingTimelineEventKey = keyof typeof ONBOARDING_TIMELINE_EVENTS;
