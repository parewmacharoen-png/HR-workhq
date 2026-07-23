// ============================================================================
// modules/commission/domain/errors/admin-commission.errors.ts
// ============================================================================

export class AdminCommissionCycleExistsError extends Error {
  constructor() {
    super('Admin commission cycle already exists for this company and earn cycle');
    this.name = 'AdminCommissionCycleExistsError';
  }
}

export class AdminCommissionCycleNotFoundError extends Error {
  constructor(id: string) {
    super(`Admin commission cycle ${id} not found`);
    this.name = 'AdminCommissionCycleNotFoundError';
  }
}

export class AdminPayCycleNotFoundError extends Error {
  constructor() {
    super('Pay cycle for admin commission not found');
    this.name = 'AdminPayCycleNotFoundError';
  }
}

export class AdminCommissionNoMembersError extends Error {
  constructor() {
    super('No active admin commission employee profiles found');
    this.name = 'AdminCommissionNoMembersError';
  }
}
