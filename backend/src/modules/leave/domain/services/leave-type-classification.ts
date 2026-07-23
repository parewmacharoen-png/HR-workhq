// ============================================================================
// modules/leave/domain/services/leave-type-classification.ts
// Shared leave type classification for payroll and leave engines.
// Monthly off is a separate entity (MonthlyOffRequest) — not leave.
// ============================================================================

export function isMonthlyOffLeaveType(code: string): boolean {
  return code.toLowerCase() === 'monthly_off';
}

export function isOffDayLeaveType(code: string): boolean {
  const normalized = code.toLowerCase();
  if (isMonthlyOffLeaveType(normalized)) return false;
  if (isSickLeaveType(normalized)) return false;
  if (isEmergencyLeaveType(normalized)) return false;
  if (isUnpaidLeaveType(normalized)) return false;
  if (normalized.includes('off') || normalized === 'annual' || normalized.includes('personal')) {
    return true;
  }
  return false;
}

export function isEmergencyLeaveType(code: string): boolean {
  return code.toLowerCase().includes('emergency');
}

export function isSickLeaveType(code: string): boolean {
  return code.toLowerCase().includes('sick');
}

export function isUnpaidLeaveType(code: string): boolean {
  return code.toLowerCase().includes('unpaid');
}

/** Leave types that disqualify a day from meal allowance. */
export function isMealIneligibleLeaveType(code: string): boolean {
  return isSickLeaveType(code) || isEmergencyLeaveType(code) || isUnpaidLeaveType(code);
}
