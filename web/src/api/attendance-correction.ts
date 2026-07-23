import { apiPost } from './client';

export type AttendanceCorrectionField =
  | 'checkInAt'
  | 'checkOutAt'
  | 'breakStartAt'
  | 'breakEndAt';

export interface SubmitAttendanceCorrectionInput {
  companyId: string;
  field: AttendanceCorrectionField;
  correctedAt: string;
  reason: string;
  workDate?: string;
}

export interface AttendanceCorrectionResponse {
  id: string;
  attendanceRecordId: string;
  field: string;
  status: string;
  workflowInstanceId: string | null;
  reason: string | null;
}

export function submitAttendanceCorrection(
  employeeId: string,
  body: SubmitAttendanceCorrectionInput,
) {
  return apiPost<AttendanceCorrectionResponse>(
    `/attendance/employees/${employeeId}/corrections`,
    body,
  );
}
