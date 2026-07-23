export type CorrectionField = 'checkInAt' | 'checkOutAt' | 'breakStartAt' | 'breakEndAt';

export function mapCorrectionTypeToField(correctionType: string): CorrectionField {
  switch (correctionType) {
    case 'check_in':
    case 'missed_in':
      return 'checkInAt';
    case 'check_out':
    case 'missed_out':
      return 'checkOutAt';
    case 'break_start':
      return 'breakStartAt';
    case 'break_return':
    case 'break_end':
      return 'breakEndAt';
    default:
      return 'checkInAt';
  }
}

export function parseWorkDateIso(value: unknown): string | null {
  const raw = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function bangkokTimeKey(iso: Date | string | null | undefined): string | null {
  if (!iso) return null;
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}
