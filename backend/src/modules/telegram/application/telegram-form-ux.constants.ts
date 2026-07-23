// UX-001 — predefined options for button-based Telegram forms

/** Default daytime slots (non-OT forms). */
export const QUICK_TIME_SLOTS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
] as const;

/** Hourly OT slots to offer after shift end. */
export const OT_QUICK_TIME_SLOT_COUNT = 8;

export const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000] as const;

export const THAI_BANKS = [
  { label: 'กสิกรไทย', value: 'kbank' },
  { label: 'ไทยพาณิชย์', value: 'scb' },
  { label: 'กรุงเทพ', value: 'bbl' },
  { label: 'กรุงไทย', value: 'ktb' },
  { label: 'กรุงศรี', value: 'bay' },
  { label: 'ทหารไทยธนชาต', value: 'ttb' },
  { label: 'ออมสิน', value: 'gsb' },
  { label: 'ธ.ก.ส.', value: 'baac' },
  { label: 'อื่น ๆ', value: 'other' },
] as const;

export const EMERGENCY_RELATIONSHIPS = [
  { label: 'พ่อ', value: 'father' },
  { label: 'แม่', value: 'mother' },
  { label: 'คู่สมรส', value: 'spouse' },
  { label: 'พี่/น้อง', value: 'sibling' },
  { label: 'ญาติ', value: 'relative' },
  { label: 'เพื่อน', value: 'friend' },
  { label: 'อื่น ๆ', value: 'other' },
] as const;

export const BUTTON_FIELD_TYPES = new Set([
  'select',
  'radio',
  'button_select',
  'button_multi_select',
  'boolean',
  'leave_type_picker',
  'shift_picker',
  'document_type_picker',
  'bank_picker',
  'relationship_picker',
  'employee_picker',
  'company_picker',
  'team_picker',
  'position_picker',
]);

export const QUICK_DATE_FIELD_TYPES = new Set(['date', 'quick_date', 'datetime']);

export const QUICK_TIME_FIELD_TYPES = new Set(['time', 'quick_time']);

export const QUICK_AMOUNT_FIELD_TYPES = new Set(['currency', 'number', 'quick_amount']);

/** Not collectable in Telegram — skip in bot forms (use web HR or skip). */
export const TELEGRAM_SKIP_FIELD_TYPES = new Set(['file_upload', 'image_upload']);

export const FREE_TEXT_FIELD_TYPES = new Set(['text', 'textarea']);
