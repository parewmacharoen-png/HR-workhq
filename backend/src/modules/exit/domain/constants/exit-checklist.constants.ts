// ============================================================================
// modules/exit/domain/constants/exit-checklist.constants.ts
// EMP-012 — default exit clearance checklist items.
// ============================================================================

export interface ExitChecklistTemplate {
  itemKey: string;
  label: string;
  sortOrder: number;
}

export const DEFAULT_EXIT_CHECKLIST: ExitChecklistTemplate[] = [
  { itemKey: 'return_keys', label: 'Return keys', sortOrder: 1 },
  { itemKey: 'return_laptop', label: 'Return laptop', sortOrder: 2 },
  { itemKey: 'return_phone', label: 'Return phone', sortOrder: 3 },
  { itemKey: 'remove_telegram_permissions', label: 'Remove Telegram permissions', sortOrder: 4 },
  { itemKey: 'remove_system_access', label: 'Remove system access', sortOrder: 5 },
  { itemKey: 'payroll_settlement_completed', label: 'Payroll settlement completed', sortOrder: 6 },
];
