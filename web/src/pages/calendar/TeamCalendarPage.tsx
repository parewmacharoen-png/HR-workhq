import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTeamCalendar, type CalendarEvent } from '../../api/calendar';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { formatThaiDate } from '../../lib/employee-date-utils';
import { fetchForEachCompany } from '../../utils/multi-company';
import { WorkHQButton, WorkHQCard } from '../../components/ui';
import { formatYmd, monthBounds, weekBounds } from './calendar-utils';

const CATEGORY_COLORS: Record<string, string> = {
  off_day: '#2563eb',
  monthly_off: '#2563eb',
  approved_leave: '#7c3aed',
  sick_leave: '#ea580c',
  emergency_leave: '#dc2626',
  unpaid_leave: '#64748b',
  shift_change: '#9333ea',
};

const CATEGORY_LABELS: Record<string, string> = {
  off_day: 'วันหยุด',
  monthly_off: 'วันหยุดประจำเดือน',
  approved_leave: 'ลา',
  sick_leave: 'ลาป่วย',
  emergency_leave: 'ลากรณีฉุกเฉิน',
  unpaid_leave: 'ลาไม่รับค่าจ้าง',
  shift_change: 'สลับกะ',
};

const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

type ViewMode = 'list' | 'week' | 'month';

function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function eventOnDate(event: CalendarEvent, dateStr: string): boolean {
  return event.startDate <= dateStr && event.endDate >= dateStr;
}

function eventTypeLabel(event: CalendarEvent): string {
  if (event.leaveTypeName?.trim()) return event.leaveTypeName.trim();
  switch (event.leaveTypeCode) {
    case 'sick':
      return 'ลาป่วย';
    case 'emergency':
      return 'ลากรณีฉุกเฉิน';
    case 'unpaid':
      return 'ลาไม่รับค่าจ้าง';
    case 'annual':
      return 'ลาพักร้อน';
    case 'monthly_off':
      return 'วันหยุดประจำเดือน';
    default:
      break;
  }
  return CATEGORY_LABELS[event.category] ?? event.category;
}

function eventStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
      return 'อนุมัติแล้ว';
    case 'pending':
      return 'รออนุมัติ';
    case 'rejected':
      return 'ไม่อนุมัติ';
    case 'cancelled':
      return 'ยกเลิก';
    default:
      return status;
  }
}

function eventColor(event: CalendarEvent): string {
  return CATEGORY_COLORS[event.category]
    ?? CATEGORY_COLORS[event.leaveTypeCode ?? '']
    ?? '#94a3b8';
}

function shortName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function eventChipLabel(event: CalendarEvent): string {
  return `${shortName(event.employeeName)} · ${eventTypeLabel(event)}`;
}

function eventDetailLine(event: CalendarEvent): string {
  const parts = [
    event.employeeName,
    eventTypeLabel(event),
    eventStatusLabel(event.status),
  ];
  if (event.teamName) parts.push(event.teamName);
  if (event.startDate !== event.endDate) {
    parts.push(`${formatThaiDate(event.startDate)} – ${formatThaiDate(event.endDate)}`);
  }
  return parts.join(' · ');
}

export default function TeamCalendarPage() {
  const { companyId, scopedCompanyIds, hasCompanyScope, companyLabel, isAllCompanies } = useCompanyScope();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [summary, setSummary] = useState({ todayOff: 0, tomorrowOff: 0, upcoming7Days: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [categoryFilter, setCategoryFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  const range = useMemo(() => (
    view === 'week' ? weekBounds(cursor) : monthBounds(cursor)
  ), [view, cursor]);

  const load = useCallback(async () => {
    if (!hasCompanyScope) {
      setEvents([]);
      setSummary({ todayOff: 0, tomorrowOff: 0, upcoming7Days: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const companyIds = isAllCompanies
        ? scopedCompanyIds
        : (companyId ? [companyId] : scopedCompanyIds);
      const results = await fetchForEachCompany(companyIds, (cid) =>
        fetchTeamCalendar({
          companyId: cid,
          startDate: range.start,
          endDate: range.end,
        }),
      );
      const merged = results.flatMap((row) => row.result.events);
      const seen = new Set<string>();
      const unique = merged.filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
      setEvents(unique);
      setSummary({
        todayOff: results.reduce((sum, row) => sum + row.result.summary.todayOff, 0),
        tomorrowOff: results.reduce((sum, row) => sum + row.result.summary.tomorrowOff, 0),
        upcoming7Days: results.reduce((sum, row) => sum + row.result.summary.upcoming7Days, 0),
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, hasCompanyScope, isAllCompanies, range.end, range.start, scopedCompanyIds]);

  useEffect(() => { void load(); }, [load]);

  const employees = useMemo(
    () => [...new Set(events.map((e) => e.employeeName))].sort((a, b) => a.localeCompare(b, 'th')),
    [events],
  );
  const teams = useMemo(
    () => [...new Set(events.map((e) => e.teamName).filter(Boolean))].sort() as string[],
    [events],
  );

  const filtered = events.filter((e) => {
    if (categoryFilter && e.category !== categoryFilter && e.leaveTypeCode !== categoryFilter) {
      return false;
    }
    if (employeeFilter && e.employeeName !== employeeFilter) return false;
    if (teamFilter && e.teamName !== teamFilter) return false;
    return true;
  });

  const monthDays = useMemo(() => {
    const { start, end } = monthBounds(cursor);
    const days: string[] = [];
    let cur = parseYmd(start);
    const last = parseYmd(end);
    while (cur <= last) {
      days.push(formatYmd(cur));
      cur = new Date(cur);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const { start, end } = weekBounds(cursor);
    const days: string[] = [];
    let cur = parseYmd(start);
    const last = parseYmd(end);
    while (cur <= last) {
      days.push(formatYmd(cur));
      cur = new Date(cur);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }, [cursor]);

  const todayStr = formatYmd(new Date());
  const firstWeekday = monthDays.length
    ? (parseYmd(monthDays[0]).getUTCDay() + 6) % 7
    : 0;

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const n = new Date(c);
      n.setUTCMonth(n.getUTCMonth() + delta);
      return n;
    });
  }

  function shiftWeek(delta: number) {
    setCursor((c) => {
      const n = new Date(c);
      n.setUTCDate(n.getUTCDate() + delta * 7);
      return n;
    });
  }

  return (
    <div className="whq-page whq-team-calendar">
      <header className="whq-att-cc-hero">
        <p className="whq-att-cc-eyebrow">วันลา / วันหยุด › ปฏิทินทีม</p>
        <h1 className="whq-att-cc-title">ปฏิทินทีม</h1>
        <p className="whq-att-cc-subtitle">
          กำลังดู: <strong>{companyLabel || '—'}</strong>
          {isAllCompanies ? ` · ${scopedCompanyIds.length} บริษัท` : ''}
          {' · '}ใครลา / หยุดวันไหน ประเภทอะไร
        </p>
        <div className="whq-att-cc-toolbar">
          <WorkHQButton to="/leave" variant="secondary">กลับเมนูวันลา</WorkHQButton>
          <WorkHQButton to="/dashboard" variant="secondary">แดชบอร์ด</WorkHQButton>
        </div>
      </header>

      <div className="whq-stat-grid whq-team-calendar__stats">
        <div className="whq-stat-card">
          <div className="whq-stat-value">{summary.todayOff}</div>
          <div className="whq-stat-label">วันนี้ลา / หยุด</div>
        </div>
        <div className="whq-stat-card">
          <div className="whq-stat-value">{summary.tomorrowOff}</div>
          <div className="whq-stat-label">พรุ่งนี้ลา / หยุด</div>
        </div>
        <div className="whq-stat-card">
          <div className="whq-stat-value">{summary.upcoming7Days}</div>
          <div className="whq-stat-label">7 วันถัดไป</div>
        </div>
      </div>

      <WorkHQCard className="whq-team-calendar__toolbar-card">
        <div className="whq-team-calendar__toolbar">
          <div className="whq-btn-group">
            {([
              ['list', 'รายการ'],
              ['week', 'สัปดาห์'],
              ['month', 'เดือน'],
            ] as const).map(([mode, label]) => (
              <WorkHQButton
                key={mode}
                type="button"
                variant={view === mode ? 'primary' : 'secondary'}
                onClick={() => setView(mode)}
              >
                {label}
              </WorkHQButton>
            ))}
          </div>
          <div className="whq-btn-group">
            <WorkHQButton type="button" variant="secondary" onClick={() => setCursor(new Date())}>
              วันนี้
            </WorkHQButton>
            <WorkHQButton
              type="button"
              variant="secondary"
              onClick={() => (view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
            >
              ←
            </WorkHQButton>
            <WorkHQButton
              type="button"
              variant="secondary"
              onClick={() => (view === 'week' ? shiftWeek(1) : shiftMonth(1))}
            >
              →
            </WorkHQButton>
          </div>
          <span className="whq-team-calendar__range">
            {formatThaiDate(range.start)} – {formatThaiDate(range.end)}
          </span>
        </div>

        <div className="whq-team-calendar__filters">
          <label>
            <span>ประเภท</span>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">ทุกประเภท</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>พนักงาน</span>
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="">ทุกคน</option>
              {employees.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>ทีม</span>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="">ทุกทีม</option>
              {teams.map((team) => <option key={team} value={team}>{team}</option>)}
            </select>
          </label>
        </div>

        <div className="whq-team-calendar__legend">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <span key={key} className="whq-team-calendar__legend-item">
              <i style={{ background: CATEGORY_COLORS[key] }} />
              {label}
            </span>
          ))}
        </div>
      </WorkHQCard>

      {loading ? (
        <WorkHQCard><p className="whq-muted">กำลังโหลด…</p></WorkHQCard>
      ) : (
        <>
          {view === 'month' && (
            <WorkHQCard>
              <div className="whq-team-calendar__month">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="whq-team-calendar__weekday">{label}</div>
                ))}
                {Array.from({ length: firstWeekday }, (_, index) => (
                  <div key={`pad-${index}`} className="whq-team-calendar__day whq-team-calendar__day--empty" />
                ))}
                {monthDays.map((day) => {
                  const dayEvents = filtered.filter((event) => eventOnDate(event, day));
                  return (
                    <div
                      key={day}
                      className={`whq-team-calendar__day${day === todayStr ? ' whq-team-calendar__day--today' : ''}`}
                    >
                      <div className="whq-team-calendar__day-num">{Number(day.slice(8))}</div>
                      <div className="whq-team-calendar__chips">
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="whq-team-calendar__chip"
                            title={eventDetailLine(event)}
                            style={{ borderLeftColor: eventColor(event) }}
                          >
                            <strong>{shortName(event.employeeName)}</strong>
                            <span>{eventTypeLabel(event)}</span>
                            {event.status === 'pending' && (
                              <em>รออนุมัติ</em>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </WorkHQCard>
          )}

          {view === 'week' && (
            <div className="whq-team-calendar__week">
              {weekDays.map((day) => {
                const dayEvents = filtered.filter((event) => eventOnDate(event, day));
                return (
                  <WorkHQCard
                    key={day}
                    className={day === todayStr ? 'whq-team-calendar__week-day--today' : ''}
                  >
                    <div className="whq-team-calendar__week-title">{formatThaiDate(day)}</div>
                    {dayEvents.length === 0 ? (
                      <p className="whq-muted">ไม่มีรายการ</p>
                    ) : (
                      <ul className="whq-team-calendar__week-list">
                        {dayEvents.map((event) => (
                          <li key={event.id} style={{ borderLeftColor: eventColor(event) }}>
                            <strong>{event.employeeName}</strong>
                            <span>{eventTypeLabel(event)}</span>
                            <span>{eventStatusLabel(event.status)}</span>
                            {event.teamName && <span>{event.teamName}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </WorkHQCard>
                );
              })}
            </div>
          )}

          {view === 'list' && (
            <WorkHQCard>
              <div className="whq-table-wrap">
                <table className="whq-table">
                  <thead>
                    <tr>
                      <th>พนักงาน</th>
                      <th>ทีม</th>
                      <th>ประเภท</th>
                      <th>ตั้งแต่</th>
                      <th>ถึง</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((event) => (
                      <tr key={event.id}>
                        <td>{event.employeeName}</td>
                        <td>{event.teamName ?? '—'}</td>
                        <td>
                          <span
                            className="whq-team-calendar__type"
                            style={{ borderLeftColor: eventColor(event) }}
                          >
                            {eventTypeLabel(event)}
                          </span>
                        </td>
                        <td>{formatThaiDate(event.startDate)}</td>
                        <td>{formatThaiDate(event.endDate)}</td>
                        <td>{eventStatusLabel(event.status)}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="whq-muted">ไม่มีรายการในช่วงนี้</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </WorkHQCard>
          )}
        </>
      )}
    </div>
  );
}
