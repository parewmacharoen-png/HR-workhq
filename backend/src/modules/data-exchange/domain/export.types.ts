// ============================================================================
// Data Exchange — shared types
// ============================================================================

export interface ExportDataset {
  title: string;
  worksheetName: string;
  headers: string[];
  rows: (string | number | null)[][];
  generatedBy?: string;
  filtersSummary?: string;
  sensitive?: boolean;
}

export interface ExportDriverResult {
  googleSpreadsheetId?: string | null;
  googleWorksheetId?: string | null;
  googleSheetUrl?: string | null;
  fileName?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  buffer?: Buffer | null;
}

export interface ExportDriverContext {
  jobId: string;
  module: string;
  companyId: string;
  mode: string;
  shareMode: string;
  spreadsheetTitle?: string;
  existingSpreadsheetId?: string | null;
}

export const SENSITIVE_EXPORT_MODULES = new Set([
  'payroll', 'payroll_preview', 'payroll_history', 'payroll_export',
  'salary', 'salary_history', 'salary_review', 'final_settlement',
  'audit_logs', 'documents', 'disciplinary',
]);

export const HR_EXPORT_MODULES = [
  'employees', 'attendance', 'attendance_alerts', 'leave', 'leave_calendar',
  'shift', 'payroll', 'payroll_preview', 'payroll_history', 'payroll_export',
  'salary', 'salary_history', 'salary_review', 'promotion_review',
  'admin_commission', 'referral', 'exit', 'final_settlement',
  'kpi', 'performance', 'competency', 'succession', 'position_framework',
  'training', 'knowledge_center', 'announcements', 'documents',
  'workflow', 'approval_history', 'audit_logs', 'formula_execution_logs',
  'ai_manager_reports', 'morning_brief', 'qa_dashboard', 'traceability_dashboard',
  'operations_dashboard', 'health_dashboard', 'hr_analytics',
] as const;

export type HrExportModule = typeof HR_EXPORT_MODULES[number];

export const IMPORT_MODULES = [
  'employees', 'employee_bank', 'leave_balances', 'salary',
  'shift_assignments', 'off_days', 'holidays', 'position_assignments',
  'kpi_assignments', 'competencies', 'training_assignments',
] as const;
