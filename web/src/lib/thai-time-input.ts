/** Parse HH.mm or HH:mm for web forms. */
export function parseThaiTimeInput(input: string): { hours: number; minutes: number } | null {
  const trimmed = input.trim();
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export const THAI_TIME_INPUT_HINT = '21.00 หรือ 21:00';
