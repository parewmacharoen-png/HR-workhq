// Thai-friendly time input: 21.00 or 21:00 → normalized HH:mm internally.

export const THAI_TIME_INPUT_HINT = '21.00 หรือ 21:00';
export const THAI_TIME_VALIDATION_ERROR = 'รูปแบบเวลาไม่ถูกต้อง (เช่น 21.00)';

export interface ThaiTimeParts {
  hours: number;
  minutes: number;
}

/** Parse HH.mm or HH:mm (1–2 digit hour). */
export function parseThaiTimeInput(input: string): ThaiTimeParts | null {
  const trimmed = input.trim();
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Normalize to HH:mm for storage and APIs. */
export function normalizeThaiTimeInput(input: string): string | null {
  const parts = parseThaiTimeInput(input);
  if (!parts) return null;
  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Display as HH.mm for Thai users. */
export function formatTimeAsThaiDot(value: string): string {
  const normalized = normalizeThaiTimeInput(value) ?? value.trim();
  return normalized.replace(':', '.');
}

/** Combine Bangkok work date (YYYY-MM-DD) with HH.mm / HH:mm local time. */
export function combineBangkokWorkDateAndTime(workDateIso: string, timeInput: string): Date | null {
  const parts = parseThaiTimeInput(timeInput.trim());
  if (!parts) return null;
  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  return new Date(`${workDateIso}T${hh}:${mm}:00+07:00`);
}

/**
 * Fix timestamps saved with UTC clock hours instead of Asia/Bangkok (+07:00).
 * Legacy bug: combineDateAndTime used setUTCHours(localTime) on the work date anchor.
 */
export function repairUtcHoursStoredAsBangkok(
  wrongIso: string | Date,
  workDateIso: string,
): Date | null {
  const wrong = typeof wrongIso === 'string' ? new Date(wrongIso) : wrongIso;
  if (Number.isNaN(wrong.getTime())) return null;

  const utcH = wrong.getUTCHours();
  const utcM = wrong.getUTCMinutes();
  if (wrong.getUTCSeconds() !== 0 || wrong.getUTCMilliseconds() !== 0) return null;
  // Real check-ins before 07:00Z are valid Bangkok morning times; legacy bug used local hour as UTC (>= 07:00).
  if (utcH < 7) return null;

  const buggyAnchor = new Date(`${workDateIso}T00:00:00.000Z`);
  buggyAnchor.setUTCHours(utcH, utcM, 0, 0);
  if (buggyAnchor.getTime() !== wrong.getTime()) return null;

  const correct = combineBangkokWorkDateAndTime(
    workDateIso,
    `${utcH}:${String(utcM).padStart(2, '0')}`,
  );
  if (!correct || correct.getTime() === wrong.getTime()) return null;
  return correct;
}
