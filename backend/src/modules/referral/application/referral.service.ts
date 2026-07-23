// ============================================================================
// modules/referral/application/referral.service.ts
// Orchestrates all referral features:
//   1. Register:   self-referral guard + existing-reward guard (DB unique)
//   2. Check eligibility: QualificationService (pure)
//   3. Duplicate detection: three signals (phone/nationalId/bankAccount)
//      + append immutable check log; block or allow with override
//   4. Qualify: run eligibility + duplicate checks, set condition + qualifiedAt
//   5. Pay: create payroll item (source_ref_type='referral'), link item_id
//   6. Reject: set reason, audit
//   7. Dashboard: summary + leaderboard + pending queue
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  REFERRAL_REPOSITORY, DUPLICATE_CHECK_REPOSITORY, REFERRAL_EMPLOYEE_REPOSITORY,
  REFERRAL_PAYROLL_REPOSITORY, REFERRAL_ANALYTICS_REPOSITORY,
  ReferralRepository, DuplicateCheckRepository,
  ReferralEmployeeRepository, ReferralPayrollRepository, ReferralAnalyticsRepository,
} from '../domain/repositories/referral.repository';
import { ReferralEntity } from '../domain/entities/referral.entity';
import { QualificationService, toQualificationConfig } from '../domain/services/qualification.service';
import { DuplicateDetectionService, DuplicateCheckResult } from '../domain/services/duplicate-detection.service';
import { ReferralSettingsService } from '../../settings/application/referral-settings.service';
import { requiredEmploymentMs } from '../../settings/domain/referral-settings.types';
import {
  ReferralNotFoundError, DuplicateReferralError,
  DuplicateSignalDetectedError,
} from '../domain/errors/referral.errors';
import {
  RegisterReferralDto, QualifyReferralDto, RejectReferralDto,
  ListReferralsQuery, DashboardQuery,
  ReferralResponse, DuplicateCheckResponse, EligibilityCheckResponse,
  ReferralDashboardResponse,
} from './dto/referral.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

@Injectable()
export class ReferralService {
  private readonly qualification = new QualificationService();
  private readonly duplicateDetection = new DuplicateDetectionService();

  constructor(
    @Inject(REFERRAL_REPOSITORY)            private readonly referrals: ReferralRepository,
    @Inject(DUPLICATE_CHECK_REPOSITORY)     private readonly dupChecks: DuplicateCheckRepository,
    @Inject(REFERRAL_EMPLOYEE_REPOSITORY)   private readonly employees: ReferralEmployeeRepository,
    @Inject(REFERRAL_PAYROLL_REPOSITORY)    private readonly payroll: ReferralPayrollRepository,
    @Inject(REFERRAL_ANALYTICS_REPOSITORY)  private readonly analytics: ReferralAnalyticsRepository,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly referralSettings: ReferralSettingsService,
  ) {}

  // ══ 1. Register referral ════════════════════════════════════════════════════

  async register(actor: ActorContext, dto: RegisterReferralDto): Promise<ReferralResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    // DB partial unique index enforces one reward per referred employee, but we
    // check first to provide a clear error rather than a DB constraint violation.
    const existing = await this.referrals.findByReferredEmployee(dto.referredEmployeeId);
    if (existing && existing.status !== 'rejected') throw new DuplicateReferralError();

    const rules = await this.referralSettings.getRules(dto.companyId);
    const referral = ReferralEntity.create({
      id: randomUUID(),
      referrerEmployeeId: dto.referrerEmployeeId,
      referredEmployeeId: dto.referredEmployeeId,
      companyId: dto.companyId,
      candidateId: dto.candidateId ?? null,
      notes: dto.notes ?? null,
      rewardAmount: rules.rewardAmount,
    });

    await this.referrals.save(referral, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Referral', entityId: referral.id, action: 'register',
      after: referral.toPersistence(),
    });
    return this.toResponse(referral);
  }

  // ══ 2. Check eligibility (non-mutating) ════════════════════════════════════

  async checkEligibility(actor: ActorContext, referralId: string): Promise<EligibilityCheckResponse> {
    const referral = await this.getOrThrow(actor, referralId);
    const emp = await this.employees.getForReferral(referral.referredEmployeeId);
    if (!emp) {
      return { qualified: false, condition: null, qualifiedAt: null, reason: 'Referred employee not found' };
    }
    const rules = await this.referralSettings.getRules(referral.companyId);
    const qualConfig = toQualificationConfig(rules);
    const result = this.qualification.assess({
      hireDate: emp.hireDate,
      employmentStatus: emp.employmentStatus,
      probationEndDate: emp.probationEndDate,
    }, qualConfig);
    return {
      qualified: result.qualified,
      condition: result.condition,
      qualifiedAt: result.qualifiedAt ? result.qualifiedAt.toISOString() : null,
      reason: result.reason,
    };
  }

  // ══ 3 + 4. Run duplicate checks then qualify ════════════════════════════════

  async qualify(actor: ActorContext, referralId: string, dto: QualifyReferralDto): Promise<ReferralResponse> {
    const referral = await this.getOrThrow(actor, referralId);
    const emp = await this.employees.getForReferral(referral.referredEmployeeId);
    if (!emp) throw new ReferralNotFoundError(`employee ${referral.referredEmployeeId}`);

    const rules = await this.referralSettings.getRules(referral.companyId);
    const qualConfig = toQualificationConfig(rules);

    // ── Step A: Eligibility check ──────────────────────────────────────────
    let condition: 'probation_pass' | 'three_months';
    if (dto.overrideEligibility) {
      condition = 'probation_pass';
    } else {
      condition = this.qualification.assertEligible({
        hireDate: emp.hireDate,
        employmentStatus: emp.employmentStatus,
        probationEndDate: emp.probationEndDate,
      }, qualConfig);
    }

    // ── Step B: Duplicate detection across three signals ──────────────────
    const checkResults: DuplicateCheckResult[] = [];
    if (rules.duplicateCheckEnabled) {
      const bankAccounts = await this.employees.getBankAccounts(emp.id);
      const signals = this.duplicateDetection.signalsFor({
        phone: emp.phone,
        nationalId: emp.nationalId,
        bankAccountNo: bankAccounts[0] ?? null,
      });

      for (const s of signals) {
        const matchFound = await this.checkSignalForDuplicate(s.signal, s.value, emp.id);
        const result = { signal: s.signal, matchFound, matchDetail: matchFound ? s.masked : null };
        checkResults.push(result);
        await this.dupChecks.append({
          referralId, checkedBy: actor.userId, signal: s.signal, matchFound, matchDetail: result.matchDetail,
        });
      }

      if (this.duplicateDetection.isDuplicate(checkResults) && !dto.overrideDuplicateBlock) {
        const signal = this.duplicateDetection.firstMatchSignal(checkResults)!;
        throw new DuplicateSignalDetectedError(signal);
      }
    }

    // ── Step C: Qualify ────────────────────────────────────────────────────
    const before = referral.toPersistence();
    const qualifiedAt = condition === 'probation_pass' && emp.probationEndDate
      ? emp.probationEndDate
      : new Date(emp.hireDate.getTime() + requiredEmploymentMs(rules.requiredEmploymentDays));

    referral.qualify(condition, qualifiedAt);
    if (dto.notes) referral.addNote(dto.notes);

    await this.referrals.save(referral, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Referral', entityId: referralId, action: 'qualify',
      before, after: referral.toPersistence(),
    });
    return this.toResponse(referral);
  }

  // ══ 5. Pay referral reward ══════════════════════════════════════════════════

  async pay(actor: ActorContext, referralId: string): Promise<ReferralResponse> {
    const referral = await this.getOrThrow(actor, referralId);
    const rules = await this.referralSettings.getRules(referral.companyId);
    if (!rules.autoCreatePayrollItem) {
      throw new Error('Referral payroll item creation is disabled by company settings');
    }
    const before = referral.toPersistence();

    // Create the payroll item on the referrer's current open cycle
    const payrollItemId = await this.payroll.createReferralPayrollItem({
      referrerEmployeeId: referral.referrerEmployeeId,
      companyId: referral.companyId,
      amount: referral.rewardAmount,
      referralId,
      actorUserId: actor.userId,
    });

    referral.markPaid(payrollItemId);
    await this.referrals.save(referral, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Referral', entityId: referralId, action: 'pay',
      before, after: { payrollItemId, status: 'paid' },
    });
    return this.toResponse(referral);
  }

  // ══ 6. Reject ══════════════════════════════════════════════════════════════

  async reject(actor: ActorContext, referralId: string, dto: RejectReferralDto): Promise<ReferralResponse> {
    const referral = await this.getOrThrow(actor, referralId);
    const before = referral.toPersistence();
    referral.reject(dto.reason);
    await this.referrals.save(referral, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Referral', entityId: referralId, action: 'reject',
      before, after: referral.toPersistence(),
    });
    return this.toResponse(referral);
  }

  // ══ List + get ══════════════════════════════════════════════════════════════

  async get(actor: ActorContext, id: string): Promise<ReferralResponse> {
    return this.toResponse(await this.getOrThrow(actor, id));
  }

  async list(actor: ActorContext, query: ListReferralsQuery): Promise<ReferralResponse[]> {
    const companyId = await this.companyAccess.requireCompanyId(actor, query.companyId ?? null);
    const list = await this.referrals.list({
      companyId,
      referrerEmployeeId: query.referrerEmployeeId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
    return list.map(r => this.toResponse(r));
  }

  async getDuplicateChecks(actor: ActorContext, referralId: string): Promise<DuplicateCheckResponse[]> {
    await this.getOrThrow(actor, referralId);
    const checks = await this.dupChecks.listByReferral(referralId);
    return checks.map(c => ({
      signal: c.signal,
      matchFound: c.matchFound,
      matchDetail: c.matchDetail,
      checkedAt: c.checkedAt.toISOString(),
    }));
  }

  // ══ 7. Dashboard ═══════════════════════════════════════════════════════════

  async getDashboard(actor: ActorContext, query: DashboardQuery): Promise<ReferralDashboardResponse> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    const from = query.from ? new Date(query.from) : undefined;
    const to   = query.to   ? new Date(query.to)   : undefined;

    const [summary, leaderboard, pending] = await Promise.all([
      this.analytics.summary(query.companyId, from, to),
      this.analytics.leaderboard(query.companyId, 10),
      this.analytics.pendingQualification(query.companyId),
    ]);

    return { summary, leaderboard, pendingQualification: pending.map(r => this.toResponse(r)) };
  }

  // ══ Private helpers ════════════════════════════════════════════════════════

  private async getOrThrow(actor: ActorContext, id: string): Promise<ReferralEntity> {
    const r = await this.referrals.findById(id);
    if (!r) throw new ReferralNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, r.companyId);
    return r;
  }

  /**
   * Ask the repository whether any OTHER employee (not the referred one)
   * shares the same phone / national_id / bank_account value.
   * Implementation is in the Prisma repository.
   */
  private async checkSignalForDuplicate(
    signal: 'phone' | 'national_id' | 'bank_account',
    value: string,
    excludeEmployeeId: string,
  ): Promise<boolean> {
    return this.employees.checkDuplicateSignal(signal, value, excludeEmployeeId);
  }

  private toResponse(r: ReferralEntity): ReferralResponse {
    const p = r.toPersistence();
    return {
      id: p.id, referrerEmployeeId: p.referrerEmployeeId,
      referredEmployeeId: p.referredEmployeeId, companyId: p.companyId,
      candidateId: p.candidateId, rewardAmount: p.rewardAmount,
      status: p.status, qualifyingCondition: p.qualifyingCondition,
      qualifiedAt: p.qualifiedAt ? p.qualifiedAt.toISOString() : null,
      payrollItemId: p.payrollItemId, notes: p.notes, rejectionReason: p.rejectionReason,
    };
  }
}
