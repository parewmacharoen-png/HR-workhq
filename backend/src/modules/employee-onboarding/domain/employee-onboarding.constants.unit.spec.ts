import {
  EMPLOYEE_ONBOARDING_TYPE_KEY,
  isOnboardingRequestTypeKey,
  ONBOARDING_REQUEST_DISPLAY_TH,
  ONBOARDING_TIMELINE_EVENTS,
  TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY,
} from './employee-onboarding.constants';

describe('employee-onboarding.constants', () => {
  it('recognizes both onboarding request type keys', () => {
    expect(isOnboardingRequestTypeKey(EMPLOYEE_ONBOARDING_TYPE_KEY)).toBe(true);
    expect(isOnboardingRequestTypeKey(TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY)).toBe(true);
    expect(isOnboardingRequestTypeKey('leave_request')).toBe(false);
  });

  it('uses Thai display label for onboarding requests', () => {
    expect(ONBOARDING_REQUEST_DISPLAY_TH).toBe('รับพนักงานใหม่');
  });

  it('maps timeline event keys to Thai labels', () => {
    expect(ONBOARDING_TIMELINE_EVENTS.invitation_created).toBe('สร้างลิงก์เชิญ');
    expect(ONBOARDING_TIMELINE_EVENTS.onboarding_approved).toBe('HR อนุมัติการรับพนักงาน');
    expect(ONBOARDING_TIMELINE_EVENTS.onboarding_rejected).toBe('HR ปฏิเสธการรับพนักงาน');
  });
});
