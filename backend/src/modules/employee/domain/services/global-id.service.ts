// ============================================================================
// modules/employee/domain/services/global-id.service.ts
// Domain service that allocates the next EMPxxxxxx id. The sequence source is
// abstracted behind a port so it can be a DB sequence/table in infrastructure.
// ============================================================================

import { EmployeeGlobalId } from '../value-objects/employee-global-id.vo';

export const GLOBAL_ID_SEQUENCE = Symbol('GLOBAL_ID_SEQUENCE');

export interface GlobalIdSequence {
  /** Atomically returns the next integer in the global employee sequence. */
  next(): Promise<number>;
}

export class GlobalIdService {
  constructor(private readonly sequence: GlobalIdSequence) {}

  async allocate(): Promise<EmployeeGlobalId> {
    const n = await this.sequence.next();
    return EmployeeGlobalId.fromSequence(n);
  }
}
