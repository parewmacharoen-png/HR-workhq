// ============================================================================
// Column catalog per HR export module (EXPORT-003)
// ============================================================================

export interface ExportColumnDef {
  key: string;
  label: string;
  sensitive?: boolean;
}

export const MODULE_COLUMN_CATALOG: Record<string, ExportColumnDef[]> = {
  employees: [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'status', label: 'Status' },
    { key: 'team', label: 'Team' },
    { key: 'company', label: 'Company' },
    { key: 'position', label: 'Position' },
    { key: 'department', label: 'Department' },
    { key: 'hireDate', label: 'Hire Date' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'salary', label: 'Salary', sensitive: true },
    { key: 'bankCode', label: 'Bank Code', sensitive: true },
    { key: 'bankAccount', label: 'Bank Account', sensitive: true },
  ],
  attendance: [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'date', label: 'Date' },
    { key: 'checkIn', label: 'Check In' },
    { key: 'checkOut', label: 'Check Out' },
    { key: 'status', label: 'Status' },
    { key: 'lateMinutes', label: 'Late (min)' },
  ],
  leave: [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Name' },
    { key: 'startDate', label: 'Start' },
    { key: 'endDate', label: 'End' },
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'status', label: 'Status' },
    { key: 'days', label: 'Days' },
  ],
  payroll: [
    { key: 'employeeCode', label: 'Employee Code' },
    { key: 'name', label: 'Name' },
    { key: 'gross', label: 'Gross', sensitive: true },
    { key: 'netPay', label: 'Net Pay', sensitive: true },
    { key: 'deductions', label: 'Deductions', sensitive: true },
    { key: 'bankAccount', label: 'Bank Account', sensitive: true },
  ],
  audit_logs: [
    { key: 'occurredAt', label: 'Occurred At' },
    { key: 'entityType', label: 'Entity Type' },
    { key: 'entityId', label: 'Entity ID' },
    { key: 'action', label: 'Action' },
    { key: 'actorUserId', label: 'Actor' },
  ],
};

export function columnsForModule(module: string): ExportColumnDef[] {
  return MODULE_COLUMN_CATALOG[module] ?? [
    { key: 'col1', label: 'Column 1' },
    { key: 'col2', label: 'Column 2' },
  ];
}

export function applyColumnSelection(
  headers: string[],
  rows: (string | number | null)[][],
  selectedKeys: string[],
  catalog: ExportColumnDef[],
): { headers: string[]; rows: (string | number | null)[][] } {
  if (!selectedKeys.length) return { headers, rows };
  const indexes = selectedKeys
    .map((k) => {
      const label = catalog.find((c) => c.key === k)?.label ?? k;
      return headers.findIndex((h) => h.toLowerCase().replace(/\s+/g, '') === label.toLowerCase().replace(/\s+/g, '')
        || h.toLowerCase().replace(/\s+/g, '') === k.toLowerCase());
    })
    .filter((i) => i >= 0);
  if (!indexes.length) return { headers, rows };
  return {
    headers: indexes.map((i) => headers[i]),
    rows: rows.map((row) => indexes.map((i) => row[i] ?? null)),
  };
}
