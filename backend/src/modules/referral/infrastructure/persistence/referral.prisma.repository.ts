// ============================================================================
// modules/referral/infrastructure/persistence/referral.prisma.repository.ts
// Adapters for all five referral repository ports.
// ReferralEmployeeRepository also implements checkDuplicateSignal() which is
// called by the service via duck-typing (any) to avoid a circular port dep.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ReferralEntity, ReferralStatus } from '../../domain/entities/referral.entity';
import type { DuplicateSignal } from '../../domain/services/duplicate-detection.service';
import {
  ReferralRepository, DuplicateCheckRepository, ReferralEmployeeRepository,
  ReferralPayrollRepository, ReferralAnalyticsRepository,
  ReferralFilters, DuplicateCheckRecord, ReferredEmployeeData,
  ReferralSummary, ReferrerLeaderboardEntry,
} from '../../domain/repositories/referral.repository';

// ── Referral ─────────────────────────────────────────────────────────────────

@Injectable()
export class PrismaReferralRepository implements ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ReferralEntity | null> {
    const row = await this.prisma.referral.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findByReferredEmployee(referredEmployeeId: string): Promise<ReferralEntity | null> {
    const row = await this.prisma.referral.findFirst({
      where: { referredEmployeeId, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(filters: ReferralFilters): Promise<ReferralEntity[]> {
    const where: Prisma.ReferralWhereInput = { deletedAt: null };
    if (filters.companyId)           where.companyId = filters.companyId;
    if (filters.referrerEmployeeId)  where.referrerEmployeeId = filters.referrerEmployeeId;
    if (filters.status)              where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to   ? { lte: filters.to }   : {}),
      };
    }
    const rows = await this.prisma.referral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:  filters.limit  ?? 50,
      skip:  filters.offset ?? 0,
    });
    return rows.map(r => this.toDomain(r));
  }

  async save(referral: ReferralEntity, actorUserId: string): Promise<void> {
    const p = referral.toPersistence();
    await this.prisma.referral.upsert({
      where: { id: p.id },
      create: {
        id:                  p.id,
        referrerEmployeeId:  p.referrerEmployeeId,
        referredEmployeeId:  p.referredEmployeeId,
        companyId:           p.companyId,
        rewardAmount:        new Prisma.Decimal(p.rewardAmount),
        status:              p.status,
        qualifyingCondition: p.qualifyingCondition ?? undefined,
        qualifiedAt:         p.qualifiedAt ?? undefined,
        payrollItemId:       p.payrollItemId ?? undefined,
        createdBy:           actorUserId,
        updatedBy:           actorUserId,
      },
      update: {
        status:              p.status,
        qualifyingCondition: p.qualifyingCondition ?? undefined,
        qualifiedAt:         p.qualifiedAt ?? undefined,
        payrollItemId:       p.payrollItemId ?? undefined,
        updatedBy:           actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.referral.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  private toDomain(r: any): ReferralEntity {
    return ReferralEntity.rehydrate({
      id:                  r.id,
      referrerEmployeeId:  r.referrerEmployeeId,
      referredEmployeeId:  r.referredEmployeeId,
      companyId:           r.companyId,
      candidateId:         r.candidateId    ?? null,
      rewardAmount:        Number(r.rewardAmount),
      qualifyingCondition: r.qualifyingCondition ?? null,
      qualifiedAt:         r.qualifiedAt    ?? null,
      status:              r.status         as ReferralStatus,
      payrollItemId:       r.payrollItemId  ?? null,
      notes:               r.notes          ?? null,
      rejectionReason:     r.rejectionReason ?? null,
      deletedAt:           r.deletedAt      ?? null,
    });
  }
}

// ── Duplicate Checks (append-only) ────────────────────────────────────────────

@Injectable()
export class PrismaDuplicateCheckRepository implements DuplicateCheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(record: DuplicateCheckRecord): Promise<void> {
    await this.prisma.referralDuplicateCheck.create({
      data: {
        id:          randomUUID(),
        referralId:  record.referralId,
        checkedBy:   record.checkedBy   ?? undefined,
        signal:      record.signal      as 'phone' | 'national_id' | 'bank_account',
        matchFound:  record.matchFound,
        matchDetail: record.matchDetail ?? undefined,
      },
    });
  }

  async listByReferral(
    referralId: string,
  ): Promise<Array<DuplicateCheckRecord & { checkedAt: Date }>> {
    const rows = await this.prisma.referralDuplicateCheck.findMany({
      where: { referralId },
      orderBy: { checkedAt: 'asc' },
    });
    return rows.map(r => ({
      referralId:  r.referralId,
      checkedBy:   r.checkedBy   ?? null,
      signal:      r.signal      as DuplicateSignal,
      matchFound:  r.matchFound,
      matchDetail: r.matchDetail ?? null,
      checkedAt:   r.checkedAt,
    }));
  }
}

// ── Employee data for referral (qualification + dedup) ────────────────────────

@Injectable()
export class PrismaReferralEmployeeRepository implements ReferralEmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getForReferral(employeeId: string): Promise<ReferredEmployeeData | null> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true, hireDate: true,
        employmentStatus: true, probationEndDate: true,
        nationalId: true, phone: true,
      },
    });
    if (!emp) return null;

    // Primary bank account (account_no stored; encryption handled at app layer)
    const bank = await this.prisma.employeeBankAccount.findFirst({
      where: { employeeId, isPrimary: true, deletedAt: null },
      select: { accountNo: true },
    });

    return {
      id:               emp.id,
      hireDate:         emp.hireDate,
      employmentStatus: emp.employmentStatus as 'probation' | 'active' | 'suspended' | 'terminated',
      probationEndDate: emp.probationEndDate,
      nationalId:       emp.nationalId ?? null,
      phone:            emp.phone      ?? null,
      bankAccountNo:    bank?.accountNo ?? null,
    };
  }

  async getBankAccounts(employeeId: string): Promise<string[]> {
    const rows = await this.prisma.employeeBankAccount.findMany({
      where: { employeeId, deletedAt: null },
      select: { accountNo: true },
      orderBy: { isPrimary: 'desc' },
    });
    return rows.map(r => r.accountNo);
  }

  /**
   * Duplicate-signal check: does any OTHER active employee share this value?
   * Called by the service via duck-typing. Returns true = match found.
   *
   * NOTE: national_id and bank account_no are stored encrypted in production.
   * This implementation compares the plaintext that the caller already
   * decrypted from the referred employee's record. The caller must pass
   * the same encryption format that was used at storage time.
   */
  async checkDuplicateSignal(
    signal: DuplicateSignal,
    value: string,
    excludeEmployeeId: string,
  ): Promise<boolean> {
    const base = { deletedAt: null, id: { not: excludeEmployeeId } };

    if (signal === 'phone') {
      const count = await this.prisma.employee.count({
        where: { ...base, phone: value },
      });
      return count > 0;
    }

    if (signal === 'national_id') {
      const count = await this.prisma.employee.count({
        where: { ...base, nationalId: value },
      });
      return count > 0;
    }

    if (signal === 'bank_account') {
      const count = await this.prisma.employeeBankAccount.count({
        where: {
          accountNo:  value,
          deletedAt:  null,
          employeeId: { not: excludeEmployeeId },
        },
      });
      return count > 0;
    }

    return false;
  }
}

// ── Payroll integration ───────────────────────────────────────────────────────

@Injectable()
export class PrismaReferralPayrollRepository implements ReferralPayrollRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createReferralPayrollItem(input: {
    referrerEmployeeId: string;
    companyId: string;
    amount: number;
    referralId: string;
    actorUserId: string;
  }): Promise<string> {
    // Find the open payroll cycle for this company
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId: input.companyId,
        status:    { in: ['open', 'locked'] },
        deletedAt: null,
      },
      orderBy: { periodStart: 'desc' },
    });
    if (!cycle) {
      throw new Error(
        `No open payroll cycle found for company ${input.companyId} — cannot create referral payment`,
      );
    }

    const id = randomUUID();
    await this.prisma.payrollItem.create({
      data: {
        id,
        payrollCycleId:  cycle.id,
        employeeId:      input.referrerEmployeeId,
        companyId:       input.companyId,
        itemType:        'referral',
        amount:          new Prisma.Decimal(input.amount),
        sourceRefType:   'referral',
        sourceRefId:     input.referralId,
        note:            `Referral reward — referral ${input.referralId}`,
        createdBy:       input.actorUserId,
        updatedBy:       input.actorUserId,
      },
    });
    return id;
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

@Injectable()
export class PrismaReferralAnalyticsRepository implements ReferralAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(companyId: string, from?: Date, to?: Date): Promise<ReferralSummary> {
    const dateFilter = from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};

    const base = { companyId, deletedAt: null, ...dateFilter };

    const [total, pending, qualified, paid, rejected, paidSum, qualifiedSum] = await Promise.all([
      this.prisma.referral.count({ where: base }),
      this.prisma.referral.count({ where: { ...base, status: 'pending' } }),
      this.prisma.referral.count({ where: { ...base, status: 'qualified' } }),
      this.prisma.referral.count({ where: { ...base, status: 'paid' } }),
      this.prisma.referral.count({ where: { ...base, status: 'rejected' } }),
      this.prisma.referral.aggregate({
        where: { ...base, status: 'paid' }, _sum: { rewardAmount: true },
      }),
      this.prisma.referral.aggregate({
        where: { ...base, status: 'qualified' }, _sum: { rewardAmount: true },
      }),
    ]);

    return {
      total,
      pending,
      qualified,
      paid,
      rejected,
      totalRewardPaid:    Number(paidSum._sum.rewardAmount    ?? 0),
      totalRewardPending: Number(qualifiedSum._sum.rewardAmount ?? 0),
    };
  }

  async leaderboard(companyId: string, limit: number): Promise<ReferrerLeaderboardEntry[]> {
    // Group by referrer, count statuses and sum paid amounts
    const rows = await this.prisma.referral.groupBy({
      by:    ['referrerEmployeeId'],
      where: { companyId, deletedAt: null },
      _count: { id: true },
    });

    // Enrich with per-status counts and earned amounts
    const entries: ReferrerLeaderboardEntry[] = await Promise.all(
      rows.map(async r => {
        const [qualifiedCount, paidCount, paidSum] = await Promise.all([
          this.prisma.referral.count({
            where: { companyId, referrerEmployeeId: r.referrerEmployeeId, status: { in: ['qualified', 'paid'] }, deletedAt: null },
          }),
          this.prisma.referral.count({
            where: { companyId, referrerEmployeeId: r.referrerEmployeeId, status: 'paid', deletedAt: null },
          }),
          this.prisma.referral.aggregate({
            where: { companyId, referrerEmployeeId: r.referrerEmployeeId, status: 'paid', deletedAt: null },
            _sum: { rewardAmount: true },
          }),
        ]);
        return {
          referrerEmployeeId: r.referrerEmployeeId,
          referralCount:  r._count.id,
          qualifiedCount,
          paidCount,
          totalEarned:    Number(paidSum._sum.rewardAmount ?? 0),
        };
      }),
    );

    return entries
      .sort((a, b) => b.qualifiedCount - a.qualifiedCount || b.totalEarned - a.totalEarned)
      .slice(0, limit);
  }

  async pendingQualification(companyId: string): Promise<ReferralEntity[]> {
    // Referrals still pending, ordered oldest-first so HR can work through the queue
    const rows = await this.prisma.referral.findMany({
      where:   { companyId, status: 'pending', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take:    50,
    });
    return rows.map(r => this.toDomain(r));
  }

  private toDomain(r: any): ReferralEntity {
    return ReferralEntity.rehydrate({
      id:                  r.id,
      referrerEmployeeId:  r.referrerEmployeeId,
      referredEmployeeId:  r.referredEmployeeId,
      companyId:           r.companyId,
      candidateId:         r.candidateId     ?? null,
      rewardAmount:        Number(r.rewardAmount),
      qualifyingCondition: r.qualifyingCondition ?? null,
      qualifiedAt:         r.qualifiedAt     ?? null,
      status:              r.status          as ReferralStatus,
      payrollItemId:       r.payrollItemId   ?? null,
      notes:               r.notes           ?? null,
      rejectionReason:     r.rejectionReason ?? null,
      deletedAt:           r.deletedAt       ?? null,
    });
  }
}
