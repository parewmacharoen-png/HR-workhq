// ============================================================================
// modules/recruitment/domain/entities/interview.entity.ts
// ============================================================================

export type InterviewOutcome =
  | 'scheduled' | 'completed' | 'passed' | 'failed' | 'no_show' | 'cancelled';

export interface InterviewProps {
  id: string;
  candidateId: string;
  companyId: string;
  round: number;
  scheduledAt: Date;
  location: string | null;
  interviewerIds: string[];
  outcome: InterviewOutcome;
  score: number | null;
  notes: string | null;
  completedAt: Date | null;
  deletedAt: Date | null;
}

export class Interview {
  private constructor(private props: InterviewProps) {}

  static rehydrate(props: InterviewProps): Interview {
    return new Interview(props);
  }

  static create(input: {
    id: string;
    candidateId: string;
    companyId: string;
    round: number;
    scheduledAt: Date;
    location?: string | null;
    interviewerIds?: string[];
  }): Interview {
    if (input.round < 1) throw new Error('Interview round must be >= 1');
    return new Interview({
      id: input.id,
      candidateId: input.candidateId,
      companyId: input.companyId,
      round: input.round,
      scheduledAt: input.scheduledAt,
      location: input.location ?? null,
      interviewerIds: input.interviewerIds ?? [],
      outcome: 'scheduled',
      score: null,
      notes: null,
      completedAt: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get candidateId(): string { return this.props.candidateId; }
  get outcome(): InterviewOutcome { return this.props.outcome; }

  complete(outcome: 'passed' | 'failed' | 'no_show', score?: number | null, notes?: string | null): void {
    this.props.outcome = outcome === 'no_show' ? 'no_show' : outcome;
    if (outcome !== 'no_show') this.props.outcome = 'completed';
    this.props.completedAt = new Date();
    if (score !== undefined) this.props.score = score;
    if (notes !== undefined) this.props.notes = notes;
  }

  pass(score?: number | null, notes?: string | null): void {
    this.props.outcome = 'passed';
    this.props.completedAt = new Date();
    if (score !== undefined) this.props.score = score;
    if (notes !== undefined) this.props.notes = notes;
  }

  fail(notes?: string | null): void {
    this.props.outcome = 'failed';
    this.props.completedAt = new Date();
    if (notes !== undefined) this.props.notes = notes;
  }

  cancel(): void { this.props.outcome = 'cancelled'; }

  toPersistence(): InterviewProps { return { ...this.props }; }
}
