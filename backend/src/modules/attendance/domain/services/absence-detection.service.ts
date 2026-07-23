// ============================================================================
// modules/attendance/domain/services/absence-detection.service.ts
// Auto-flag criteria ABS-001 (1–3). Criterion (4) contact is human attestation at approval.
// ============================================================================

export interface AbsenceDetectionInput {
  hasApprovedLeave: boolean;
  hasApprovedMonthlyOff: boolean;
  isHoliday: boolean;
  hasCheckIn: boolean;
  isActiveOnDate: boolean;
}

export function isAbsenceCandidate(input: AbsenceDetectionInput): boolean {
  return input.isActiveOnDate
    && !input.hasApprovedLeave
    && !input.hasApprovedMonthlyOff
    && !input.isHoliday
    && !input.hasCheckIn;
}

export function isEmployeeActiveOnDate(input: {
  employmentStatus: string;
  hireDate: Date;
  terminationDate: Date | null;
  workDate: Date;
}): boolean {
  if (input.employmentStatus !== 'active' && input.employmentStatus !== 'probation') {
    return false;
  }
  const day = startOfUtcDay(input.workDate);
  const hire = startOfUtcDay(input.hireDate);
  if (hire > day) return false;
  if (input.terminationDate) {
    const term = startOfUtcDay(input.terminationDate);
    if (term <= day) return false;
  }
  return true;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
