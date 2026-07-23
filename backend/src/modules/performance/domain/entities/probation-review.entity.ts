// ============================================================================
// modules/performance/domain/entities/probation-review.entity.ts
// Tracks each probation period outcome. Separate from Evaluation so multiple
// probation events per employee (e.g. after rehire) are fully audited.
// ============================================================================

export type ProbationOutcome = 'pending' | 'passed' | 'extended' | 'failed';

export interface ProbationReviewProps {
  id: string;
  employeeId: string;
  companyId: string;
  evaluationId: string | null;
  probationStartDate: Date;
  probationEndDate: Date;
  outcome: ProbationOutcome;
  extendedUntil: Date | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  deletedAt: Date | null;
}

export class ProbationReview {
  private constructor(private props: ProbationReviewProps) {}

  static rehydrate(props: ProbationReviewProps): ProbationReview {
    return new ProbationReview(props);
  }

  static create(input: {
    id: string;
    employeeId: string;
    companyId: string;
    probationStartDate: Date;
    probationEndDate: Date;
    evaluationId?: string | null;
    notes?: string | null;
  }): ProbationReview {
    if (input.probationEndDate < input.probationStartDate) {
      throw new Error('probationEndDate must be after probationStartDate');
    }
    return new ProbationReview({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      evaluationId: input.evaluationId ?? null,
      probationStartDate: input.probationStartDate,
      probationEndDate: input.probationEndDate,
      outcome: 'pending',
      extendedUntil: null,
      notes: input.notes ?? null,
      reviewedBy: null,
      reviewedAt: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get outcome(): ProbationOutcome { return this.props.outcome; }
  get isResolved(): boolean { return this.props.outcome !== 'pending'; }

  pass(reviewerId: string): void {
    this.props.outcome = 'passed';
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
  }

  extend(until: Date, reviewerId: string, notes?: string): void {
    if (until <= this.props.probationEndDate) {
      throw new Error('Extension date must be after original probation end date');
    }
    this.props.outcome = 'extended';
    this.props.extendedUntil = until;
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
    if (notes) this.props.notes = notes;
  }

  fail(reviewerId: string, notes?: string): void {
    this.props.outcome = 'failed';
    this.props.reviewedBy = reviewerId;
    this.props.reviewedAt = new Date();
    if (notes) this.props.notes = notes;
  }

  toPersistence(): ProbationReviewProps {
    return { ...this.props };
  }
}
