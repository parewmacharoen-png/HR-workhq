// ============================================================================
// modules/recruitment/domain/repositories/recruitment.repository.ts
// ============================================================================

import { Candidate } from '../entities/candidate.entity';
import { Interview } from '../entities/interview.entity';
import { Offer } from '../entities/offer.entity';
import type { CandidateStage } from '../services/pipeline.service';

export const CANDIDATE_REPOSITORY  = Symbol('CANDIDATE_REPOSITORY');
export const INTERVIEW_REPOSITORY  = Symbol('INTERVIEW_REPOSITORY');
export const OFFER_REPOSITORY      = Symbol('OFFER_REPOSITORY');
export const PIPELINE_EVENT_REPOSITORY = Symbol('PIPELINE_EVENT_REPOSITORY');
export const ANALYTICS_QUERY_REPOSITORY = Symbol('ANALYTICS_QUERY_REPOSITORY');

export interface CandidateFilters {
  companyId?: string;
  recruiterEmployeeId?: string;
  stage?: CandidateStage;
  source?: string;
  isUniqueCounted?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface CandidateRepository {
  findById(id: string): Promise<Candidate | null>;
  findByPhoneAndCompany(phone: string, companyId: string): Promise<Candidate | null>;
  list(filters: CandidateFilters): Promise<Candidate[]>;
  count(filters: CandidateFilters): Promise<number>;
  save(candidate: Candidate, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface PipelineEventRepository {
  /** Append-only; returns the new event id. */
  append(input: {
    candidateId: string;
    fromStage: CandidateStage | null;
    toStage: CandidateStage;
    changedBy: string;
  }): Promise<string>;
  listByCandidate(candidateId: string): Promise<Array<{
    id: string;
    fromStage: CandidateStage | null;
    toStage: CandidateStage;
    changedBy: string | null;
    changedAt: Date;
  }>>;
}

export interface InterviewRepository {
  findById(id: string): Promise<Interview | null>;
  listByCandidate(candidateId: string): Promise<Interview[]>;
  listByCompany(companyId: string, from: Date, to: Date): Promise<Interview[]>;
  save(interview: Interview, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface OfferRepository {
  findById(id: string): Promise<Offer | null>;
  findActiveForCandidate(candidateId: string): Promise<Offer | null>;
  listByCandidate(candidateId: string): Promise<Offer[]>;
  listByCompany(companyId: string): Promise<Offer[]>;
  save(offer: Offer, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

// ── Analytics data types ─────────────────────────────────────────────────────
export interface StageCounts { [stage: string]: number }

export interface AnalyticsQueryRepository {
  stageCounts(companyId: string, from: Date, to: Date): Promise<StageCounts>;
  costPerHireValues(companyId: string, from: Date, to: Date): Promise<number[]>;
  timeToHireDaySpans(companyId: string, from: Date, to: Date): Promise<number[]>;
  recruiterRows(companyId: string, from: Date, to: Date): Promise<Array<{
    recruiterId: string;
    isUniqueCounted: boolean;
    stage: CandidateStage;
    daySpan: number | null;
  }>>;
  sourceRows(companyId: string, from: Date, to: Date): Promise<Array<{
    source: string | null;
    stage: CandidateStage;
  }>>;
  uniqueCountedForRecruiter(recruiterEmployeeId: string, cycleId: string): Promise<number>;
}
