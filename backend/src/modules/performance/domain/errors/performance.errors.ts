// ============================================================================
// modules/performance/domain/errors/performance.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError, ForbiddenError,
} from '../../../../shared/kernel/domain-error';

export class PerformanceCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Performance cycle ${id} not found`); }
}
export class EvaluationNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Evaluation ${id} not found`); }
}
export class ProbationReviewNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Probation review ${id} not found`); }
}
export class EvaluationAlreadyExistsError extends ConflictError {
  constructor() { super('An evaluation already exists for this employee in this cycle'); }
}
export class EvaluationAlreadyFinalizedError extends ConflictError {
  constructor() { super('Evaluation is already finalized'); }
}
export class WeightSumError extends ValidationError {
  constructor(sum: number) {
    super(`Evaluation weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }
}
export class AiCannotFinalizeError extends ForbiddenError {
  constructor() { super('AI identities cannot finalize evaluations (advisory only)'); }
}
export class ScoreOutOfRangeError extends ValidationError {
  constructor(dim: string) { super(`Score for dimension "${dim}" must be between 0 and 100`); }
}
export class CycleNotOpenError extends ConflictError {
  constructor() { super('Performance cycle is not open'); }
}
