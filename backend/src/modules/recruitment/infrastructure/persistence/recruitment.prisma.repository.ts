// ============================================================================
// modules/recruitment/infrastructure/persistence/recruitment.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { Candidate } from '../../domain/entities/candidate.entity';
import { Interview } from '../../domain/entities/interview.entity';
import { Offer } from '../../domain/entities/offer.entity';
import type { CandidateStage } from '../../domain/services/pipeline.service';
import {
  CandidateRepository, InterviewRepository, OfferRepository,
  PipelineEventRepository, AnalyticsQueryRepository,
  CandidateFilters, StageCounts,
} from '../../domain/repositories/recruitment.repository';

// ── Candidate ─────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaCandidateRepository implements CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Candidate | null> {
    const row = await this.prisma.candidate.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByPhoneAndCompany(phone: string, companyId: string): Promise<Candidate | null> {
    const row = await this.prisma.candidate.findFirst({ where: { phone, companyId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async list(filters: CandidateFilters): Promise<Candidate[]> {
    const where: any = { deletedAt: null };
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.recruiterEmployeeId) where.recruiterEmployeeId = filters.recruiterEmployeeId;
    if (filters.stage) where.stage = filters.stage;
    if (filters.source) where.source = filters.source;
    if (filters.isUniqueCounted !== undefined) where.isUniqueCounted = filters.isUniqueCounted;
    if (filters.from || filters.to) where.createdAt = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
    const rows = await this.prisma.candidate.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50, skip: filters.offset ?? 0,
    });
    return rows.map(r => this.toDomain(r));
  }
  async count(filters: CandidateFilters): Promise<number> {
    const where: any = { deletedAt: null };
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.stage) where.stage = filters.stage;
    return this.prisma.candidate.count({ where });
  }
  async save(candidate: Candidate, actorUserId: string): Promise<void> {
    const p = candidate.toPersistence();
    await this.prisma.candidate.upsert({
      where: { id: p.id },
      create: {
        id: p.id, companyId: p.companyId, recruiterEmployeeId: p.recruiterEmployeeId,
        fullName: p.fullName, phone: p.phone ?? undefined, source: p.source ?? undefined,
        stage: p.stage as $Enums.CandidateStage, isUniqueCounted: p.isUniqueCounted,
        countedCycleId: p.countedCycleId ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        fullName: p.fullName, phone: p.phone ?? undefined, source: p.source ?? undefined,
        stage: p.stage as $Enums.CandidateStage, isUniqueCounted: p.isUniqueCounted,
        countedCycleId: p.countedCycleId ?? undefined,
        updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.candidate.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): Candidate {
    return Candidate.rehydrate({
      id: r.id, companyId: r.companyId, recruiterEmployeeId: r.recruiterEmployeeId,
      fullName: r.fullName, phone: r.phone, source: r.source, stage: r.stage,
      isUniqueCounted: r.isUniqueCounted, countedCycleId: r.countedCycleId,
      email: r.email ?? null, position: r.position ?? null, notes: r.notes ?? null,
      interviewDate: r.interviewDate ?? null,
      offerAmount: r.offerAmount != null ? Number(r.offerAmount) : null,
      offerDate: r.offerDate ?? null, hiredAt: r.hiredAt ?? null,
      hiredEmployeeId: r.hiredEmployeeId ?? null,
      costPerHire: r.costPerHire != null ? Number(r.costPerHire) : null,
      deletedAt: r.deletedAt,
    });
  }
}

// ── Pipeline Events ────────────────────────────────────────────────────────────
@Injectable()
export class PrismaPipelineEventRepository implements PipelineEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: {
    candidateId: string; fromStage: CandidateStage | null;
    toStage: CandidateStage; changedBy: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.prisma.recruitmentPipelineEvent.create({
      data: { id, candidateId: input.candidateId, fromStage: input.fromStage as $Enums.CandidateStage | null,
        toStage: input.toStage as $Enums.CandidateStage, changedBy: input.changedBy },
    });
    return id;
  }
  async listByCandidate(candidateId: string) {
    const rows = await this.prisma.recruitmentPipelineEvent.findMany({
      where: { candidateId }, orderBy: { changedAt: 'asc' },
    });
    return rows.map(r => ({
      id: r.id, fromStage: r.fromStage as CandidateStage | null,
      toStage: r.toStage as CandidateStage,
      changedBy: r.changedBy ?? null, changedAt: r.changedAt,
    }));
  }
}

// ── Interviews ─────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaInterviewRepository implements InterviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Interview | null> {
    const row = await this.prisma.interview.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async listByCandidate(candidateId: string): Promise<Interview[]> {
    const rows = await this.prisma.interview.findMany({ where: { candidateId, deletedAt: null }, orderBy: { round: 'asc' } });
    return rows.map(r => this.toDomain(r));
  }
  async listByCompany(companyId: string, from: Date, to: Date): Promise<Interview[]> {
    const rows = await this.prisma.interview.findMany({
      where: { companyId, scheduledAt: { gte: from, lte: to }, deletedAt: null },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map(r => this.toDomain(r));
  }
  async save(interview: Interview, actorUserId: string): Promise<void> {
    const p = interview.toPersistence();
    await this.prisma.interview.upsert({
      where: { id: p.id },
      create: {
        id: p.id, candidateId: p.candidateId, companyId: p.companyId, round: p.round,
        scheduledAt: p.scheduledAt, location: p.location ?? undefined,
        interviewerIds: p.interviewerIds, outcome: p.outcome as 'scheduled' | 'completed' | 'passed' | 'failed' | 'no_show' | 'cancelled',
        score: p.score != null ? new Prisma.Decimal(p.score) : undefined,
        notes: p.notes ?? undefined, completedAt: p.completedAt ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        outcome: p.outcome as 'scheduled' | 'completed' | 'passed' | 'failed' | 'no_show' | 'cancelled', score: p.score != null ? new Prisma.Decimal(p.score) : undefined,
        notes: p.notes ?? undefined, completedAt: p.completedAt ?? undefined, updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.interview.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): Interview {
    return Interview.rehydrate({
      id: r.id, candidateId: r.candidateId, companyId: r.companyId, round: r.round,
      scheduledAt: r.scheduledAt, location: r.location, interviewerIds: r.interviewerIds ?? [],
      outcome: r.outcome, score: r.score != null ? Number(r.score) : null,
      notes: r.notes, completedAt: r.completedAt, deletedAt: r.deletedAt,
    });
  }
}

// ── Offers ─────────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaOfferRepository implements OfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Offer | null> {
    const row = await this.prisma.offer.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findActiveForCandidate(candidateId: string): Promise<Offer | null> {
    const row = await this.prisma.offer.findFirst({
      where: { candidateId, status: { in: ['draft', 'sent'] }, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }
  async listByCandidate(candidateId: string): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({ where: { candidateId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => this.toDomain(r));
  }
  async listByCompany(companyId: string): Promise<Offer[]> {
    const rows = await this.prisma.offer.findMany({ where: { companyId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => this.toDomain(r));
  }
  async save(offer: Offer, actorUserId: string): Promise<void> {
    const p = offer.toPersistence();
    await this.prisma.offer.upsert({
      where: { id: p.id },
      create: {
        id: p.id, candidateId: p.candidateId, companyId: p.companyId,
        position: p.position, baseSalary: new Prisma.Decimal(p.baseSalary),
        startDate: p.startDate ?? undefined, expiryDate: p.expiryDate,
        status: p.status as 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn', terms: (p.terms ?? undefined) as Prisma.InputJsonValue | undefined,
        sentAt: p.sentAt ?? undefined, respondedAt: p.respondedAt ?? undefined,
        notes: p.notes ?? undefined, createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        status: p.status as 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn', sentAt: p.sentAt ?? undefined,
        respondedAt: p.respondedAt ?? undefined, notes: p.notes ?? undefined,
        updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.offer.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): Offer {
    return Offer.rehydrate({
      id: r.id, candidateId: r.candidateId, companyId: r.companyId,
      position: r.position, baseSalary: Number(r.baseSalary),
      startDate: r.startDate, expiryDate: r.expiryDate, status: r.status,
      terms: r.terms, sentAt: r.sentAt, respondedAt: r.respondedAt,
      notes: r.notes, deletedAt: r.deletedAt,
    });
  }
}

// ── Analytics Queries ──────────────────────────────────────────────────────────
@Injectable()
export class PrismaAnalyticsQueryRepository implements AnalyticsQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async stageCounts(companyId: string, from: Date, to: Date): Promise<StageCounts> {
    const grouped = await this.prisma.candidate.groupBy({
      by: ['stage'],
      where: { companyId, createdAt: { gte: from, lte: to }, deletedAt: null },
      _count: { id: true },
    });
    const result: StageCounts = {};
    for (const g of grouped) result[g.stage] = g._count.id;
    return result;
  }

  async costPerHireValues(_companyId: string, _from: Date, _to: Date): Promise<number[]> {
    return [];
  }

  async timeToHireDaySpans(_companyId: string, _from: Date, _to: Date): Promise<number[]> {
    return [];
  }

  async recruiterRows(companyId: string, from: Date, to: Date) {
    const rows = await this.prisma.candidate.findMany({
      where: { companyId, createdAt: { gte: from, lte: to }, deletedAt: null },
      select: {
        recruiterEmployeeId: true, isUniqueCounted: true,
        stage: true, createdAt: true,
      },
    });
    return rows.map(r => ({
      recruiterId: r.recruiterEmployeeId, isUniqueCounted: r.isUniqueCounted,
      stage: r.stage as CandidateStage,
      daySpan: null,
    }));
  }

  async sourceRows(companyId: string, from: Date, to: Date) {
    const rows = await this.prisma.candidate.findMany({
      where: { companyId, createdAt: { gte: from, lte: to }, deletedAt: null },
      select: { source: true, stage: true },
    });
    return rows.map(r => ({ source: r.source, stage: r.stage as CandidateStage }));
  }

  async uniqueCountedForRecruiter(recruiterEmployeeId: string, cycleId: string): Promise<number> {
    return this.prisma.candidate.count({
      where: { recruiterEmployeeId, countedCycleId: cycleId, isUniqueCounted: true, deletedAt: null },
    });
  }
}
