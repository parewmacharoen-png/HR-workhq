export function formatLeaveDateSummary(values: Record<string, unknown>): string {
  const dates = parseLeaveDatesValue(values.leaveDates);
  if (dates.length > 1) return dates.join(', ');
  const start = String(values.startDate ?? '').slice(0, 10);
  const end = String(values.endDate ?? values.startDate ?? '').slice(0, 10);
  if (!start) return '—';
  return start === end ? start : `${start} → ${end}`;
}

function parseLeaveDatesValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      }
    } catch {
      // ignore
    }
  }
  return [];
}
