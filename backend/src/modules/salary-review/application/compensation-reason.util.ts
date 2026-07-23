// ============================================================================
// modules/salary-review/application/compensation-reason.util.ts
// SAL-001b — combine reason + optional note for storage.
// ============================================================================

export function mergeReasonNote(reason?: string | null, note?: string | null): string | null {
  const parts = [reason?.trim(), note?.trim()].filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;
  return `${parts[0]}\n\n${parts[1]}`;
}
