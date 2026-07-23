import {
  normalizeThaiPhoneInput,
  validateSelfOnboardingFullName,
  validateSelfOnboardingPhone,
} from './self-onboarding-validation';

describe('self-onboarding-validation', () => {
  it('accepts valid Thai mobile numbers', () => {
    expect(validateSelfOnboardingPhone('0812345678')).toBeNull();
    expect(validateSelfOnboardingPhone('081-234-5678')).toBeNull();
    expect(normalizeThaiPhoneInput('081-234-5678')).toBe('0812345678');
  });

  it('rejects invalid phone numbers', () => {
    expect(validateSelfOnboardingPhone('123')).not.toBeNull();
    expect(validateSelfOnboardingPhone('0712345678')).not.toBeNull();
  });

  it('requires first and last name', () => {
    expect(validateSelfOnboardingFullName('สมชาย')).not.toBeNull();
    expect(validateSelfOnboardingFullName('สมชาย ใจดี')).toBeNull();
  });
});
