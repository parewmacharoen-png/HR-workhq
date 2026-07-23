/** HR / leadership roles that may edit employee attendance records. */
export function canEditEmployeeAttendance(
  can: (permission: string) => boolean,
  businessRole: string | null | undefined,
): boolean {
  if (can('attendance:write')) return true;
  return businessRole === 'secretary' || businessRole === 'big_leader';
}
