// ============================================================================
// System report templates (REPORT-001 / EXPORT-003)
// ============================================================================

export interface SystemTemplateSeed {
  module: string;
  name: string;
  description: string;
  columns: string[];
}

export const SYSTEM_REPORT_TEMPLATES: SystemTemplateSeed[] = [
  { module: 'employees', name: 'Standard', description: 'Basic employee list', columns: ['employeeCode', 'firstName', 'lastName', 'status', 'team', 'hireDate'] },
  { module: 'employees', name: 'Payroll', description: 'Payroll context', columns: ['employeeCode', 'firstName', 'lastName', 'salary', 'bankCode', 'bankAccount'] },
  { module: 'employees', name: 'Contact', description: 'Contact details', columns: ['employeeCode', 'firstName', 'lastName', 'phone', 'email'] },
  { module: 'employees', name: 'Compliance', description: 'Compliance fields', columns: ['employeeCode', 'firstName', 'lastName', 'status', 'hireDate', 'department'] },
  { module: 'attendance', name: 'Daily Attendance', description: 'Daily attendance summary', columns: ['employeeCode', 'date', 'checkIn', 'checkOut', 'status'] },
  { module: 'attendance', name: 'Late Report', description: 'Late arrivals', columns: ['employeeCode', 'date', 'checkIn', 'lateMinutes'] },
  { module: 'leave', name: 'Leave Summary', description: 'Leave requests summary', columns: ['employeeCode', 'name', 'startDate', 'endDate', 'leaveType', 'status'] },
  { module: 'payroll', name: 'Payroll Summary', description: 'Payroll cycle summary', columns: ['employeeCode', 'name', 'gross', 'netPay', 'deductions'] },
  { module: 'payroll', name: 'Bank Transfer', description: 'Bank transfer export', columns: ['employeeCode', 'name', 'netPay', 'bankAccount'] },
  { module: 'audit_logs', name: 'Security Audit', description: 'Security audit log', columns: ['occurredAt', 'entityType', 'action', 'actorUserId'] },
];
