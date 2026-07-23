// ============================================================================
// modules/recruitment/domain/entities/candidate.entity.ts
// Candidate aggregate. Owns the current pipeline stage and all profile data.
// Stage transitions are guarded by PipelineService (injected at the
// application layer, not here, to keep the entity pure value-state).
// ============================================================================

import type { CandidateStage } from '../services/pipeline.service';

export interface CandidateProps {
  id: string;
  companyId: string;
  recruiterEmployeeId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  source: string | null;
  notes: string | null;
  stage: CandidateStage;
  isUniqueCounted: boolean;
  countedCycleId: string | null;
  interviewDate: Date | null;
  offerAmount: number | null;
  offerDate: Date | null;
  hiredAt: Date | null;
  hiredEmployeeId: string | null;
  costPerHire: number | null;
  deletedAt: Date | null;
}

export class Candidate {
  private constructor(private props: CandidateProps) {}

  static rehydrate(props: CandidateProps): Candidate {
    return new Candidate(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    recruiterEmployeeId: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    position?: string | null;
    source?: string | null;
    notes?: string | null;
  }): Candidate {
    if (!input.fullName.trim()) throw new Error('Candidate full name is required');
    return new Candidate({
      id: input.id,
      companyId: input.companyId,
      recruiterEmployeeId: input.recruiterEmployeeId,
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() ?? null,
      email: input.email?.trim().toLowerCase() ?? null,
      position: input.position?.trim() ?? null,
      source: input.source?.trim() ?? null,
      notes: input.notes ?? null,
      stage: 'lead',
      isUniqueCounted: false,
      countedCycleId: null,
      interviewDate: null,
      offerAmount: null,
      offerDate: null,
      hiredAt: null,
      hiredEmployeeId: null,
      costPerHire: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get recruiterEmployeeId(): string { return this.props.recruiterEmployeeId; }
  get stage(): CandidateStage { return this.props.stage; }
  get isHired(): boolean { return ['hired', 'started', 'passed_probation'].includes(this.props.stage); }
  get phone(): string | null { return this.props.phone; }

  /** Advance to a new stage. Caller must have validated the transition first. */
  moveTo(stage: CandidateStage): void {
    this.props.stage = stage;
  }

  scheduleInterview(at: Date): void {
    this.props.interviewDate = at;
  }

  recordOffer(amount: number, date: Date): void {
    this.props.offerAmount = amount;
    this.props.offerDate = date;
  }

  markHired(at: Date, employeeId?: string | null): void {
    this.props.hiredAt = at;
    this.props.hiredEmployeeId = employeeId ?? null;
  }

  markUniqueCounted(cycleId: string): void {
    this.props.isUniqueCounted = true;
    this.props.countedCycleId = cycleId;
  }

  setCostPerHire(cost: number): void {
    this.props.costPerHire = cost;
  }

  updateProfile(input: {
    fullName?: string;
    phone?: string | null;
    email?: string | null;
    position?: string | null;
    source?: string | null;
    notes?: string | null;
  }): void {
    if (input.fullName !== undefined) this.props.fullName = input.fullName.trim();
    if (input.phone !== undefined) this.props.phone = input.phone?.trim() ?? null;
    if (input.email !== undefined) this.props.email = input.email?.trim().toLowerCase() ?? null;
    if (input.position !== undefined) this.props.position = input.position?.trim() ?? null;
    if (input.source !== undefined) this.props.source = input.source?.trim() ?? null;
    if (input.notes !== undefined) this.props.notes = input.notes ?? null;
  }

  toPersistence(): CandidateProps {
    return { ...this.props };
  }
}
