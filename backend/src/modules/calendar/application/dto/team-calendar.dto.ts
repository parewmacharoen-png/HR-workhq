// ============================================================================
// modules/calendar/application/dto/team-calendar.dto.ts
// TEAM-001
// ============================================================================

export type CalendarEventCategory =
  | 'off_day'
  | 'monthly_off'
  | 'approved_leave'
  | 'sick_leave'
  | 'emergency_leave'
  | 'unpaid_leave'
  | 'shift_change';

export interface CalendarEventDto {
  id: string;
  employeeId: string;
  employeeName: string;
  teamId: string | null;
  teamName: string | null;
  companyId: string;
  startDate: string;
  endDate: string;
  category: CalendarEventCategory;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  status: string;
  source: 'leave' | 'shift_swap' | 'monthly_off';
}

export interface TeamCalendarResponse {
  events: CalendarEventDto[];
  scope: { companyId: string | null; teamId: string | null; role: string };
  summary: {
    todayOff: number;
    tomorrowOff: number;
    upcoming7Days: number;
  };
}

export interface LeaveConflictResponse {
  overlappingCount: number;
  overlappingEmployees: Array<{ employeeId: string; name: string }>;
  message: string;
}
