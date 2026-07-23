import type { EmployeeTimelineCategory, EmployeeTimelineItem } from '../api/employee-timeline';

export type TimelineFilterId =
  | 'all'
  | 'personal'
  | 'employment'
  | 'documents'
  | 'education'
  | 'experience'
  | 'status'
  | 'system';

export const TIMELINE_FILTERS: Array<{ id: TimelineFilterId; label: string; category?: EmployeeTimelineCategory }> = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'personal', label: 'ข้อมูลส่วนตัว', category: 'PERSONAL' },
  { id: 'employment', label: 'การจ้างงาน', category: 'EMPLOYMENT' },
  { id: 'documents', label: 'เอกสาร', category: 'DOCUMENT' },
  { id: 'education', label: 'การศึกษา', category: 'EDUCATION' },
  { id: 'experience', label: 'ประสบการณ์', category: 'WORK_EXPERIENCE' },
  { id: 'status', label: 'สถานะ', category: 'STATUS' },
  { id: 'system', label: 'ระบบ', category: 'SYSTEM' },
];

export type TimelineGroupKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export const TIMELINE_GROUP_LABELS: Record<TimelineGroupKey, string> = {
  today: 'วันนี้',
  yesterday: 'เมื่อวาน',
  thisWeek: 'สัปดาห์นี้',
  earlier: 'ก่อนหน้านี้',
};

export function sortTimelineNewestFirst(items: EmployeeTimelineItem[]): EmployeeTimelineItem[] {
  return [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function filterTimelineItems(
  items: EmployeeTimelineItem[],
  filter: TimelineFilterId,
): EmployeeTimelineItem[] {
  if (filter === 'all') return items;
  const meta = TIMELINE_FILTERS.find((f) => f.id === filter);
  if (!meta?.category) return items;
  return items.filter((item) => item.category === meta.category);
}

export function searchTimelineItems(items: EmployeeTimelineItem[], query: string): EmployeeTimelineItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const actorName = item.actor?.name?.toLowerCase() ?? '';
    const role = item.actor?.businessRole?.toLowerCase() ?? '';
    return (
      item.title.toLowerCase().includes(q)
      || item.description.toLowerCase().includes(q)
      || actorName.includes(q)
      || role.includes(q)
    );
  });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export function timelineGroupKey(timestamp: string, now = new Date()): TimelineGroupKey {
  const date = new Date(timestamp);
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = startOfWeek(now);
  const itemDay = startOfDay(date);

  if (itemDay.getTime() === today.getTime()) return 'today';
  if (itemDay.getTime() === yesterday.getTime()) return 'yesterday';
  if (itemDay.getTime() >= weekStart.getTime()) return 'thisWeek';
  return 'earlier';
}

export function groupTimelineItems(
  items: EmployeeTimelineItem[],
  now = new Date(),
): Array<{ key: TimelineGroupKey; label: string; items: EmployeeTimelineItem[] }> {
  const sorted = sortTimelineNewestFirst(items);
  const groups: Record<TimelineGroupKey, EmployeeTimelineItem[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const item of sorted) {
    groups[timelineGroupKey(item.timestamp, now)].push(item);
  }

  return (['today', 'yesterday', 'thisWeek', 'earlier'] as TimelineGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({
      key,
      label: TIMELINE_GROUP_LABELS[key],
      items: groups[key],
    }));
}

export function categoryLabel(category: EmployeeTimelineCategory): string {
  const map: Record<EmployeeTimelineCategory, string> = {
    PERSONAL: 'ข้อมูลส่วนตัว',
    EMPLOYMENT: 'การจ้างงาน',
    DOCUMENT: 'เอกสาร',
    EDUCATION: 'การศึกษา',
    WORK_EXPERIENCE: 'ประสบการณ์',
    STATUS: 'สถานะ',
    SYSTEM: 'ระบบ',
    OTHER: 'อื่นๆ',
  };
  return map[category] ?? category;
}

export function timelineIconGlyph(icon: string): string {
  switch (icon) {
    case 'user': return '👤';
    case 'briefcase': return '💼';
    case 'file': return '📄';
    case 'book': return '📚';
    case 'building': return '🏢';
    case 'flag': return '🚩';
    case 'cog': return '⚙️';
    default: return '•';
  }
}

export function formatTimelineWhen(timestamp: string, now = new Date()): { dayLabel: string; timeLabel: string } {
  const date = new Date(timestamp);
  const group = timelineGroupKey(timestamp, now);
  const dayLabel = group === 'today'
    ? 'วันนี้'
    : group === 'yesterday'
      ? 'เมื่อวาน'
      : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return { dayLabel, timeLabel };
}
