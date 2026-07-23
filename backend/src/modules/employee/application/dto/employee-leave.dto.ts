export interface EmployeeLeaveYearUsageDto {
  leaveTypeCode: string;
  leaveTypeName: string;
  /** Days recorded as used before the system (manual opening balance). */
  priorUsed: number;
  /** Approved days recorded in the system this calendar year. */
  systemUsed: number;
  /** priorUsed + systemUsed */
  totalUsed: number;
  /** Remaining entitlement when applicable (emergency); otherwise null. */
  remaining: number | null;
}

export interface EmployeeLeaveBalanceEditDto {
  leaveTypeCode: 'emergency' | 'sick' | 'unpaid';
  leaveTypeName: string;
  priorUsed: number;
  entitled: number;
  entitledEditable: boolean;
}

export interface EmployeeLeaveSummaryDto {
  annualLeaveRemaining: number;
  emergencyLeaveRemaining: number;
  sickLeaveUsed: number;
  unpaidLeaveUsed: number;
  leaveRequestsThisYear: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  cancelledRequests: number;
  /** Calendar-year leave usage by type (excludes annual leave). */
  yearUsage: EmployeeLeaveYearUsageDto[];
}

export interface EmployeeLeaveHistoryItemDto {
  id: string;
  requestDate: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  approverName: string | null;
  reason: string | null;
  workflowInstanceId: string | null;
  /** True when submitted with fewer than notice-days advance. */
  shortNotice?: boolean;
  source?: 'leave_request' | 'monthly_off' | 'off_day_change';
  /** Previous off date when this row is a day-change (ISO YYYY-MM-DD). */
  previousDate?: string | null;
}

export interface EmployeeLeaveResponseDto {
  summary: EmployeeLeaveSummaryDto;
  history: EmployeeLeaveHistoryItemDto[];
  /** Opening-balance fields for HR go-live entry. */
  balances: EmployeeLeaveBalanceEditDto[];
}
