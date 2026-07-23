// ============================================================================
// modules/recruitment/application/recruitment.service.ts
// Orchestrates all eight recruitment features.
// Commission integration: when a candidate reaches started work and is not yet
// counted, mark them unique against the active payroll earn cycle.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CANDIDATE_REPOSITORY, INTERVIEW_REPOSITORY, OFFER_REPOSITORY,
  PIPELINE_EVENT_REPOSITORY, ANALYTICS_QUERY_REPOSITORY,
  CandidateRepository, InterviewRepository, OfferRepository,
  PipelineEventRepository, AnalyticsQueryRepository,
} from '../domain/repositories/recruitment.repository';
import { Candidate } from '../domain/entities/candidate.entity';
import { Interview } from '../domain/entities/interview.entity';
import { Offer } from '../domain/entities/offer.entity';
import { PipelineService, CandidateStage } from '../domain/services/pipeline.service';
import { AnalyticsService } from '../domain/services/analytics.service';
import {
  CandidateNotFoundError, DuplicateCandidatePhoneError,
  InterviewNotFoundError, OfferNotFoundError,
} from '../domain/errors/recruitment.errors';
import {
  CreateCandidateDto, UpdateCandidateDto, MovePipelineDto,
  CreateInterviewDto, ResolveInterviewDto,
  CreateOfferDto, OfferResponseDto, AnalyticsQuery,
  CandidateResponse, InterviewResponse, OfferResponse, PipelineEventResponse,
} from './dto/recruitment.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

@Injectable()
export class RecruitmentService {
  private readonly pipeline = new PipelineService();
  private readonly analytics = new AnalyticsService();

  constructor(
    @Inject(CANDIDATE_REPOSITORY)      private readonly candidates: CandidateRepository,
    @Inject(INTERVIEW_REPOSITORY)      private readonly interviews: InterviewRepository,
    @Inject(OFFER_REPOSITORY)          private readonly offers: OfferRepository,
    @Inject(PIPELINE_EVENT_REPOSITORY) private readonly events: PipelineEventRepository,
    @Inject(ANALYTICS_QUERY_REPOSITORY) private readonly analyticsQueries: AnalyticsQueryRepository,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  // ══ Candidate CRUD ══════════════════════════════════════════════════════════

  async createCandidate(actor: ActorContext, dto: CreateCandidateDto): Promise<CandidateResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    if (dto.phone) {
      const dup = await this.candidates.findByPhoneAndCompany(dto.phone, dto.companyId);
      if (dup) throw new DuplicateCandidatePhoneError(dto.phone);
    }
    const candidate = Candidate.create({ id: randomUUID(), ...dto });
    await this.candidates.save(candidate, actor.userId);
    // Record the initial pipeline event
    await this.events.append({
      candidateId: candidate.id, fromStage: null,
      toStage: 'lead', changedBy: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'Candidate', entityId: candidate.id, action: 'create', after: candidate.toPersistence(),
    });
    return this.toCandidateResponse(candidate);
  }

  async updateCandidate(actor: ActorContext, id: string, dto: UpdateCandidateDto): Promise<CandidateResponse> {
    const candidate = await this.getOrThrow(actor, id);
    const before = candidate.toPersistence();
    if (dto.phone && dto.phone !== before.phone) {
      const dup = await this.candidates.findByPhoneAndCompany(dto.phone, before.companyId);
      if (dup && dup.id !== id) throw new DuplicateCandidatePhoneError(dto.phone);
    }
    candidate.updateProfile(dto);
    await this.candidates.save(candidate, actor.userId);
    await this.audit.record(actor, { entityType: 'Candidate', entityId: id, action: 'update', before, after: candidate.toPersistence() });
    return this.toCandidateResponse(candidate);
  }

  async getCandidate(actor: ActorContext, id: string): Promise<CandidateResponse> {
    return this.toCandidateResponse(await this.getOrThrow(actor, id));
  }

  async listCandidates(actor: ActorContext, companyId: string, filters?: Partial<{
    stage: string; source: string; recruiterEmployeeId: string;
    from: string; to: string; limit: number; offset: number;
  }>): Promise<CandidateResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const list = await this.candidates.list({
      companyId,
      stage: filters?.stage as CandidateStage | undefined,
      source: filters?.source,
      recruiterEmployeeId: filters?.recruiterEmployeeId,
      from: filters?.from ? new Date(filters.from) : undefined,
      to: filters?.to ? new Date(filters.to) : undefined,
      limit: filters?.limit ?? 50,
      offset: filters?.offset ?? 0,
    });
    return list.map(c => this.toCandidateResponse(c));
  }

  async deleteCandidate(actor: ActorContext, id: string): Promise<void> {
    const candidate = await this.getOrThrow(actor, id);
    await this.candidates.softDelete(id, actor.userId);
    await this.audit.record(actor, { entityType: 'Candidate', entityId: id, action: 'delete', before: candidate.toPersistence() });
  }

  // ══ Pipeline transitions ════════════════════════════════════════════════════

  async movePipeline(actor: ActorContext, id: string, dto: MovePipelineDto): Promise<CandidateResponse> {
    const candidate = await this.getOrThrow(actor, id);
    const fromStage = candidate.stage;
    const toStage = dto.stage as CandidateStage;

    this.pipeline.assertValidTransition(fromStage, toStage);

    const before = candidate.toPersistence();
    candidate.moveTo(toStage);

    // Stage-specific side effects
    if (toStage === 'hired' || toStage === 'started') {
      candidate.markHired(new Date());
    }

    await this.candidates.save(candidate, actor.userId);
    await this.events.append({
      candidateId: id, fromStage, toStage, changedBy: actor.userId,
    });
    await this.audit.record(actor, { entityType: 'Candidate', entityId: id, action: 'stage_change', before, after: candidate.toPersistence() });
    return this.toCandidateResponse(candidate);
  }

  async getPipelineHistory(actor: ActorContext, candidateId: string): Promise<PipelineEventResponse[]> {
    await this.getOrThrow(actor, candidateId);
    const list = await this.events.listByCandidate(candidateId);
    return list.map(e => ({
      fromStage: e.fromStage, toStage: e.toStage,
      changedAt: e.changedAt.toISOString(),
    }));
  }

  // ══ Interviews ══════════════════════════════════════════════════════════════

  async scheduleInterview(actor: ActorContext, dto: CreateInterviewDto): Promise<InterviewResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const candidate = await this.getOrThrow(actor, dto.candidateId);
    const interview = Interview.create({
      id: randomUUID(), candidateId: dto.candidateId, companyId: dto.companyId,
      round: dto.round ?? 1, scheduledAt: new Date(dto.scheduledAt),
      location: dto.location, interviewerIds: dto.interviewerIds ?? [],
    });
    candidate.scheduleInterview(new Date(dto.scheduledAt));
    await this.interviews.save(interview, actor.userId);
    await this.candidates.save(candidate, actor.userId);
    await this.audit.record(actor, { entityType: 'Interview', entityId: interview.id, action: 'schedule', after: interview.toPersistence() });
    return this.toInterviewResponse(interview);
  }

  async resolveInterview(actor: ActorContext, id: string, dto: ResolveInterviewDto): Promise<InterviewResponse> {
    const interview = await this.interviews.findById(id);
    if (!interview) throw new InterviewNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, interview.toPersistence().companyId);
    const before = interview.toPersistence();

    if (dto.outcome === 'passed') {
      interview.pass(dto.score, dto.notes);
    } else if (dto.outcome === 'failed') {
      interview.fail(dto.notes);
    } else {
      interview.complete(dto.outcome, dto.score, dto.notes);
    }

    await this.interviews.save(interview, actor.userId);
    await this.audit.record(actor, { entityType: 'Interview', entityId: id, action: 'resolve', before, after: interview.toPersistence() });
    return this.toInterviewResponse(interview);
  }

  async listInterviews(actor: ActorContext, candidateId: string): Promise<InterviewResponse[]> {
    await this.getOrThrow(actor, candidateId);
    const list = await this.interviews.listByCandidate(candidateId);
    return list.map(i => this.toInterviewResponse(i));
  }

  // ══ Offers ═════════════════════════════════════════════════════════════════

  async createOffer(actor: ActorContext, dto: CreateOfferDto): Promise<OfferResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.getOrThrow(actor, dto.candidateId);
    const offer = Offer.create({
      id: randomUUID(), candidateId: dto.candidateId, companyId: dto.companyId,
      position: dto.position, baseSalary: dto.baseSalary,
      expiryDate: new Date(dto.expiryDate),
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      notes: dto.notes,
    });
    await this.offers.save(offer, actor.userId);
    await this.audit.record(actor, { entityType: 'Offer', entityId: offer.id, action: 'create', after: offer.toPersistence() });
    return this.toOfferResponse(offer);
  }

  async sendOffer(actor: ActorContext, id: string): Promise<OfferResponse> {
    const offer = await this.getOfferOrThrow(actor, id);
    const before = offer.toPersistence();
    offer.send();

    // Sync candidate stage → offer
    const candidate = await this.candidates.findById(offer.candidateId);
    if (candidate && !this.pipeline.isTerminal(candidate.stage)) {
      const prevStage = candidate.stage;
      this.pipeline.assertValidTransition(candidate.stage, 'offer');
      candidate.moveTo('offer');
      candidate.recordOffer(offer.baseSalary, offer.toPersistence().expiryDate);
      await this.candidates.save(candidate, actor.userId);
      await this.events.append({ candidateId: candidate.id, fromStage: prevStage, toStage: 'offer', changedBy: actor.userId });
    }

    await this.offers.save(offer, actor.userId);
    await this.audit.record(actor, { entityType: 'Offer', entityId: id, action: 'send', before, after: offer.toPersistence() });
    return this.toOfferResponse(offer);
  }

  async respondToOffer(actor: ActorContext, id: string, dto: OfferResponseDto): Promise<OfferResponse> {
    const offer = await this.getOfferOrThrow(actor, id);
    const before = offer.toPersistence();

    switch (dto.action) {
      case 'accept': offer.accept(); break;
      case 'decline': offer.decline(dto.notes); break;
      case 'withdraw': offer.withdraw(dto.notes); break;
    }

    // If accepted, advance candidate to hired
    if (dto.action === 'accept') {
      const candidate = await this.candidates.findById(offer.candidateId);
      if (candidate) {
        candidate.moveTo('hired');
        candidate.markHired(new Date());
        await this.candidates.save(candidate, actor.userId);
        await this.events.append({ candidateId: candidate.id, fromStage: 'offer', toStage: 'hired', changedBy: actor.userId });
      }
    }

    await this.offers.save(offer, actor.userId);
    await this.audit.record(actor, { entityType: 'Offer', entityId: id, action: dto.action, before, after: offer.toPersistence() });
    return this.toOfferResponse(offer);
  }

  async listOffers(actor: ActorContext, candidateId: string): Promise<OfferResponse[]> {
    await this.getOrThrow(actor, candidateId);
    const list = await this.offers.listByCandidate(candidateId);
    return list.map(o => this.toOfferResponse(o));
  }

  // ══ Analytics ═══════════════════════════════════════════════════════════════

  async getPipelineFunnel(query: AnalyticsQuery) {
    const counts = await this.analyticsQueries.stageCounts(
      query.companyId, new Date(query.from), new Date(query.to),
    );
    return this.analytics.buildFunnel(counts);
  }

  async getCostPerHire(query: AnalyticsQuery) {
    const values = await this.analyticsQueries.costPerHireValues(
      query.companyId, new Date(query.from), new Date(query.to),
    );
    return this.analytics.costPerHire(values);
  }

  async getTimeToHire(query: AnalyticsQuery) {
    const spans = await this.analyticsQueries.timeToHireDaySpans(
      query.companyId, new Date(query.from), new Date(query.to),
    );
    return this.analytics.timeToHire(spans);
  }

  async getRecruiterPerformance(query: AnalyticsQuery) {
    const rows = await this.analyticsQueries.recruiterRows(
      query.companyId, new Date(query.from), new Date(query.to),
    );
    return this.analytics.recruiterPerformance(rows);
  }

  async getSourceBreakdown(query: AnalyticsQuery) {
    const rows = await this.analyticsQueries.sourceRows(
      query.companyId, new Date(query.from), new Date(query.to),
    );
    return this.analytics.sourceBreakdown(rows);
  }

  /** Commission integration: count unique candidates for a recruiter in a cycle. */
  async getUniqueCandidateCount(recruiterEmployeeId: string, cycleId: string): Promise<{ count: number }> {
    const count = await this.analyticsQueries.uniqueCountedForRecruiter(recruiterEmployeeId, cycleId);
    return { count };
  }

  // ══ Helpers ═════════════════════════════════════════════════════════════════

  private async getOrThrow(actor: ActorContext, id: string): Promise<Candidate> {
    const c = await this.candidates.findById(id);
    if (!c) throw new CandidateNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, c.companyId);
    return c;
  }
  private async getOfferOrThrow(actor: ActorContext, id: string): Promise<Offer> {
    const o = await this.offers.findById(id);
    if (!o) throw new OfferNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, o.toPersistence().companyId);
    return o;
  }

  private toCandidateResponse(c: Candidate): CandidateResponse {
    const p = c.toPersistence();
    return {
      id: p.id, companyId: p.companyId, recruiterEmployeeId: p.recruiterEmployeeId,
      fullName: p.fullName, phone: p.phone, email: p.email, position: p.position,
      source: p.source, stage: p.stage, isUniqueCounted: p.isUniqueCounted,
      hiredAt: p.hiredAt ? p.hiredAt.toISOString() : null,
    };
  }
  private toInterviewResponse(i: Interview): InterviewResponse {
    const p = i.toPersistence();
    return { id: p.id, candidateId: p.candidateId, round: p.round, scheduledAt: p.scheduledAt.toISOString(), outcome: p.outcome, score: p.score };
  }
  private toOfferResponse(o: Offer): OfferResponse {
    const p = o.toPersistence();
    return { id: p.id, candidateId: p.candidateId, position: p.position, baseSalary: p.baseSalary, status: p.status, expiryDate: p.expiryDate.toISOString().slice(0, 10) };
  }
}
