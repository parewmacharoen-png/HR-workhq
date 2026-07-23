// ============================================================================
// Side-effect port for commission declaration workflow (implemented in Telegram).
// ============================================================================

export const COMMISSION_DECLARATION_SIDE_EFFECTS = Symbol('COMMISSION_DECLARATION_SIDE_EFFECTS');

export interface CommissionDeclarationSideEffects {
  onRejected(employeeId: string, reason: string): Promise<void>;
}
