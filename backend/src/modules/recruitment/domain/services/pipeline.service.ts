// ============================================================================
// modules/recruitment/domain/services/pipeline.service.ts
// Pure transition rules for the recruitment pipeline. All valid forward and
// backward transitions are declared here as the single source of truth.
//
// Pipeline: lead → interview → offer → started → passed_probation
//           (any stage can move to rejected; rejected cannot move forward)
//
// Maps requested pipeline stages to the existing CandidateStage enum values:
//   lead             → 'lead'             (new alias added by migration)
//   interview        → 'interview'
//   offer            → 'offer'
//   started          → 'started'          (new alias for first day)
//   passed_probation → 'passed_probation' (new value)
//   rejected         → 'rejected'
// ============================================================================

import { InvalidStageTransitionError } from '../errors/recruitment.errors';

export type CandidateStage =
  | 'new' | 'screened' | 'lead'
  | 'interview' | 'offer'
  | 'hired' | 'started' | 'passed_probation'
  | 'rejected';

// Valid transitions: key = from, value = set of allowed tos
const ALLOWED_TRANSITIONS: Record<CandidateStage, CandidateStage[]> = {
  new:              ['lead', 'screened', 'interview', 'rejected'],
  lead:             ['screened', 'interview', 'rejected'],
  screened:         ['interview', 'rejected'],
  interview:        ['offer', 'rejected', 'screened'],   // can return to screened
  offer:            ['hired', 'started', 'rejected'],
  hired:            ['started', 'passed_probation'],
  started:          ['passed_probation', 'rejected'],
  passed_probation: [],     // terminal success state
  rejected:         [],     // terminal rejection state
};

// Marketing KPI / commission unique count — "เด็กลงงาน" (started work) only
export const COMMISSION_QUALIFYING_STAGES: CandidateStage[] = ['started'];

export class PipelineService {
  assertValidTransition(from: CandidateStage, to: CandidateStage): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidStageTransitionError(from, to);
    }
  }

  isValidTransition(from: CandidateStage, to: CandidateStage): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
  }

  isTerminal(stage: CandidateStage): boolean {
    return stage === 'passed_probation' || stage === 'rejected';
  }

  qualifiesForCommission(stage: CandidateStage): boolean {
    return COMMISSION_QUALIFYING_STAGES.includes(stage);
  }

  stageOrder(stage: CandidateStage): number {
    const order: CandidateStage[] = [
      'new', 'lead', 'screened', 'interview', 'offer',
      'hired', 'started', 'passed_probation',
    ];
    return order.indexOf(stage);
  }
}
