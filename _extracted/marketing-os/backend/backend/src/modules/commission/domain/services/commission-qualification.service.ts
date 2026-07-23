// ============================================================================
// modules/commission/domain/services/commission-qualification.service.ts
// Pure rules for whether a commission record qualifies, should be held, or
// should be redistributed. Spec:
//   • Target: 24 unique candidates/month
//   • Miss → Hold for 1 cycle
//   • Still miss next cycle → Redistribute to team
//   • Paid one cycle behind
//   • Big-leader: supports negative carry-forward
// ============================================================================

export interface QualificationInput {
  achieved: number;
  target: number;
}

export type QualificationVerdict = 'qualified' | 'hold' | 'redistribute';

export interface HoldDecisionInput {
  /** Was the current cycle qualified? */
  currentQualified: boolean;
  /** Was this record already in hold last cycle? */
  wasOnHold: boolean;
}

export class CommissionQualificationService {
  qualifies(input: QualificationInput): boolean {
    return input.achieved >= input.target;
  }

  /**
   * After determining qualification, decide what to do with the record.
   *   qualified          → 'qualified'  (release held or new)
   *   not qualified, first miss → 'hold'
   *   not qualified, second miss (was already on hold) → 'redistribute'
   */
  verdictAfterHold(input: HoldDecisionInput): QualificationVerdict {
    if (input.currentQualified) return 'qualified';
    if (input.wasOnHold) return 'redistribute';
    return 'hold';
  }

  /**
   * Big-leader carry-forward: opening balance + earned; may be negative.
   * Payout is max(0, closing); negative rolls to next cycle.
   */
  bigLeaderClosing(openingCarry: number, earned: number): {
    closing: number;
    payout: number;
  } {
    const closing = openingCarry + earned;
    return { closing, payout: Math.max(0, closing) };
  }
}
