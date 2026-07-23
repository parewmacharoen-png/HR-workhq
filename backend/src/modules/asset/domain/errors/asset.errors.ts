// ============================================================================
// modules/asset/domain/errors/asset.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class AssetNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Asset not found: ${id}`);
  }
}

export class AssetTagConflictError extends ConflictError {
  constructor(assetTag: string) {
    super(`Asset tag already in use: ${assetTag}`);
  }
}

export class AssetNotAvailableError extends ConflictError {
  constructor(id: string) {
    super(`Asset ${id} is not available for assignment`);
  }
}

export class AssetNotAssignedError extends ConflictError {
  constructor(id: string) {
    super(`Asset ${id} has no active assignment to return`);
  }
}

export class AssetDamageReportNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Asset damage report not found: ${id}`);
  }
}

export class AssetAlreadyRetiredError extends ValidationError {
  constructor() {
    super('Retired assets cannot be modified');
  }
}

export class EmployeeNotInCompanyError extends ValidationError {
  constructor(employeeId: string, companyId: string) {
    super(`Employee ${employeeId} is not assigned to company ${companyId}`);
  }
}
