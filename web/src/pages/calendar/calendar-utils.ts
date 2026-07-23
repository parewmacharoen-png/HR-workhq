export function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthBounds(base: Date): { start: string; end: string } {
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  return { start: formatYmd(start), end: formatYmd(end) };
}

export function weekBounds(base: Date): { start: string; end: string } {
  const day = base.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() + mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: formatYmd(start), end: formatYmd(end) };
}
