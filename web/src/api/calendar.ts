import { apiGet } from './client';

export interface CalendarEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  teamId: string | null;
  teamName: string | null;
  companyId: string;
  startDate: string;
  endDate: string;
  category: string;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  status: string;
  source: string;
}

export interface TeamCalendarResponse {
  events: CalendarEvent[];
  scope: { companyId: string | null; teamId: string | null; role: string };
  summary: { todayOff: number; tomorrowOff: number; upcoming7Days: number };
}

export async function fetchTeamCalendar(params: Record<string, string | undefined>) {
  return apiGet<TeamCalendarResponse>('/calendar/team', params);
}

export async function fetchCalendarToday(companyId?: string) {
  return apiGet<{ date: string; events: CalendarEvent[]; count: number }>(
    '/calendar/today',
    companyId ? { companyId } : undefined,
  );
}

export async function fetchCalendarUpcoming(companyId?: string, days = 7) {
  const params: Record<string, string> = { days: String(days) };
  if (companyId) params.companyId = companyId;
  return apiGet<TeamCalendarResponse>('/calendar/upcoming', params);
}
