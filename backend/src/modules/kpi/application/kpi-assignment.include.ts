// ============================================================================
// modules/kpi/application/kpi-assignment.include.ts
// KPI-001 — shared Prisma include for assignment queries
// ============================================================================

export const KPI_ASSIGNMENT_INCLUDE = {
  cycle: true,
  template: true,
    employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
  score: { include: { items: { include: { metric: true } } } },
} as const;
