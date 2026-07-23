// ============================================================================
// EMP-001c — Employee Self-Onboarding Submission Service
// ============================================================================

import { Inject, Injectable, BadRequestException, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DocumentType,
  EmployeeSelfOnboardingStatus,
  Prisma,
  SelfOnboardingDocumentType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  SelfOnboardingSubmittedData,
  SELF_ONBOARDING_FORM_STEPS,
  computeSelfOnboardingStepIndex,
  sanitizeSubmittedData,
  splitFullName,
} from '../domain/self-onboarding.types';
import { DOCUMENT_STORAGE, DocumentStorageService } from '../../../shared/storage/document-storage.interface';
import { SelfOnboardingTelegramNotifier } from '../../telegram/application/self-onboarding.notifier';
import { TelegramRegistrationRequestBridgeService } from '../../request/application/telegram-registration-request-bridge.service';
import { EmployeeOnboardingTimelineService } from './employee-onboarding-timeline.service';
import { reconcileStaleDraftSubmissions } from '../domain/onboarding-reconcile.util';
import { resolveTelegramConnectionStatus } from '../domain/telegram-connection-status.util';
import {
  type EmploymentDeclaration,
} from '../domain/self-onboarding-employment.steps';

const DOC_TYPE_MAP: Record<SelfOnboardingDocumentType, DocumentType> = {
  id_card: 'national_id',
  id_card_holding: 'national_id',
  bank_book: 'bank_account',
  house_registration: 'house_registration',
  profile_photo: 'other',
  other: 'other',
};

@Injectable()
export class EmployeeSelfOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageService,
    @Optional()
    @Inject(forwardRef(() => SelfOnboardingTelegramNotifier))
    private readonly telegram?: SelfOnboardingTelegramNotifier,
    @Optional()
    @Inject(forwardRef(() => TelegramRegistrationRequestBridgeService))
    private readonly registrationBridge?: TelegramRegistrationRequestBridgeService,
    @Optional()
    private readonly onboardingTimeline?: EmployeeOnboardingTimelineService,
  ) {}

  async getOrCreateDraft(employeeId: string, companyId: string) {
    if (await this.hasFinishedSelfOnboarding(employeeId)) {
      throw new BadRequestException('Self-onboarding already completed or awaiting HR review');
    }

    const existing = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: {
        employeeId,
        status: { in: ['draft', 'rejected'] },
      },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.employeeSelfOnboardingSubmission.create({
      data: { employeeId, companyId, status: 'draft', submittedDataJson: {} },
      include: { documents: true },
    });
  }

  async hasFinishedSelfOnboarding(employeeId: string): Promise<boolean> {
    const finished = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: { in: ['submitted', 'approved'] } },
      select: { id: true },
    });
    return Boolean(finished);
  }

  async saveDraftField(employeeId: string, field: string, value: string) {
    const submission = await this.getActiveDraft(employeeId);
    const current = (submission.submittedDataJson as Record<string, unknown>) ?? {};
    const sanitized = sanitizeSubmittedData({ ...current, [field]: value });

    return this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submission.id },
      data: { submittedDataJson: sanitized, updatedAt: new Date() },
    });
  }

  async saveDraftData(employeeId: string, data: Record<string, unknown>) {
    const submission = await this.getActiveDraft(employeeId);
    const sanitized = sanitizeSubmittedData({ ...(submission.submittedDataJson as object), ...data });

    return this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submission.id },
      data: { submittedDataJson: sanitized },
    });
  }

  async saveEmploymentDeclaration(employeeId: string, employment: EmploymentDeclaration) {
    const submission = await this.getActiveDraft(employeeId);
    const current = (submission.submittedDataJson as Record<string, unknown>) ?? {};
    return this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submission.id },
      data: {
        submittedDataJson: {
          ...current,
          employmentDeclaration: employment,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async loadEmploymentDeclaration(employeeId: string): Promise<EmploymentDeclaration> {
    const submission = await this.getActiveDraft(employeeId).catch(() => null);
    if (!submission) return {};
    const raw = (submission.submittedDataJson as Record<string, unknown>)?.employmentDeclaration;
    return (raw && typeof raw === 'object') ? raw as EmploymentDeclaration : {};
  }

  async hasActiveTelegramIdentity(employeeId: string): Promise<boolean> {
    const row = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }

  async hasActiveTelegramIdentityForUser(telegramUserId: number): Promise<boolean> {
    const row = await this.prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }

  async getResumeDraftForUser(
    userId: string,
    telegramUserId?: number,
  ): Promise<{
    employeeId: string;
    companyId: string;
    stepIndex: number;
    data: SelfOnboardingSubmittedData;
    phase?: 'personal' | 'employment';
    employment?: EmploymentDeclaration;
  } | null> {
    if (telegramUserId != null && await this.hasActiveTelegramIdentityForUser(telegramUserId)) {
      return null;
    }

    const employeeId = await this.resolveEmployeeIdForOnboarding(userId, telegramUserId);
    if (!employeeId) return null;
    if (await this.hasFinishedSelfOnboarding(employeeId)) return null;

    const activeIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (activeIdentity) return null;

    const submission = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: { in: ['draft', 'rejected'] } },
      include: { documents: { where: { status: 'uploaded' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!submission) return null;

    const data = (submission.submittedDataJson ?? {}) as SelfOnboardingSubmittedData;
    const stepIndex = computeSelfOnboardingStepIndex(
      data,
      submission.documents.map((d) => d.documentType),
    );
    const rawJson = submission.submittedDataJson as Record<string, unknown> | null;
    const employment = (rawJson?.employmentDeclaration ?? {}) as EmploymentDeclaration;
    const personalComplete = stepIndex >= SELF_ONBOARDING_FORM_STEPS.length;

    return {
      employeeId: submission.employeeId,
      companyId: submission.companyId,
      stepIndex,
      data,
      phase: personalComplete ? 'employment' : 'personal',
      employment,
    };
  }

  async resolveEmployeeIdForOnboarding(
    userId: string,
    telegramUserId?: number,
  ): Promise<string | null> {
    if (telegramUserId != null) {
      const identity = await this.prisma.telegramIdentity.findFirst({
        where: {
          telegramUserId: BigInt(telegramUserId),
          status: { in: ['PENDING', 'ACTIVE'] },
          deletedAt: null,
        },
        orderBy: { linkedAt: 'desc' },
      });
      if (identity?.employeeId) return identity.employeeId;
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  async resolveCompanyIdForEmployee(employeeId: string): Promise<string | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, isPrimaryCompany: true, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }

  async resolveTelegramUserIdForUser(userId: string): Promise<number | undefined> {
    const acc = await this.prisma.telegramAccount.findFirst({
      where: { userId, deletedAt: null },
      select: { telegramUserId: true },
    });
    return acc ? Number(acc.telegramUserId) : undefined;
  }

  async attachDocument(
    employeeId: string,
    documentType: SelfOnboardingDocumentType,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ) {
    const submission = await this.getActiveDraft(employeeId);
    const storageKey = `self-onboarding/${employeeId}/${documentType}/${Date.now()}_${fileName}`;
    await this.storage.save(storageKey, buffer);

    await this.prisma.employeeSelfOnboardingDocument.deleteMany({
      where: { submissionId: submission.id, documentType, status: 'uploaded' },
    });

    return this.prisma.employeeSelfOnboardingDocument.create({
      data: {
        submissionId: submission.id,
        employeeId,
        documentType,
        fileName,
        mimeType,
        storageKey,
        sizeBytes: buffer.length,
        status: 'uploaded',
      },
    });
  }

  async submit(employeeId: string, actorUserId: string) {
    const submission = await this.getActiveDraft(employeeId);
    const data = submission.submittedDataJson as SelfOnboardingSubmittedData;

    if (!data.fullName && !(data.firstName && data.lastName)) {
      throw new BadRequestException('Full name required');
    }
    if (!data.phone) throw new BadRequestException('Phone required');

    const updated = await this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        submittedDataJson: sanitizeSubmittedData(data as Record<string, unknown>),
      },
      include: { documents: true, employee: { select: { firstName: true, lastName: true, globalId: true } } },
    });

    await this.audit.record(
      { userId: actorUserId, impersonatorUserId: null, companyId: submission.companyId },
      {
        entityType: 'EmployeeSelfOnboardingSubmission',
        entityId: submission.id,
        action: 'self_onboarding_submitted',
        after: { employeeId },
      },
    );

    if (this.registrationBridge) {
      const identity = await this.prisma.telegramIdentity.findFirst({
        where: {
          employeeId,
          status: { in: ['PENDING', 'ACTIVE'] },
          deletedAt: null,
        },
        orderBy: { linkedAt: 'desc' },
      });
      const invite = await this.prisma.employeeTelegramInvite.findFirst({
        where: {
          employeeId,
          status: { in: ['started', 'used'] },
          ...(identity ? { usedTelegramUserId: identity.telegramUserId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      if (identity) {
        await this.registrationBridge.createAndSubmit({
          employeeId,
          companyId: submission.companyId,
          telegramUserId: identity.telegramUserId,
          verificationMethod: 'invite_link',
          invitationId: invite?.id ?? null,
          selfOnboardingSubmissionId: updated.id,
          reviewReason: 'self_onboarding_submitted',
          requesterUserId: actorUserId,
        });
      }
    }

    void this.telegram?.notifyHrPendingReview(submission.id);
    void this.onboardingTimeline?.recordIfNew(employeeId, 'onboarding_submitted', actorUserId, {
      selfOnboardingSubmissionId: updated.id,
    });

    return updated;
  }

  async listSubmissions(actor: ActorContext, filters: {
    companyId?: string;
    status?: EmployeeSelfOnboardingStatus;
    limit?: number;
    offset?: number;
  }) {
    if (filters.companyId) {
      await reconcileStaleDraftSubmissions(this.prisma, filters.companyId);
    }

    const where: Record<string, unknown> = {};
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.status) {
      where.status = filters.status;
    } else {
      where.status = { not: 'cancelled' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.employeeSelfOnboardingSubmission.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true, globalId: true, firstName: true, lastName: true, phone: true,
            },
          },
          documents: { select: { id: true, documentType: true, fileName: true, status: true } },
        },
        orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.employeeSelfOnboardingSubmission.count({ where }),
    ]);

    const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
    const connectionByEmployee = new Map<string, string>();
    await Promise.all(
      employeeIds.map(async (employeeId) => {
        const status = await resolveTelegramConnectionStatus(this.prisma, employeeId);
        connectionByEmployee.set(employeeId, status);
      }),
    );

    const items = rows.map((row) => ({
      ...row,
      connectionStatus: connectionByEmployee.get(row.employeeId) ?? 'not_connected',
    }));

    return { items, total };
  }

  async getSubmission(id: string) {
    const row = await this.prisma.employeeSelfOnboardingSubmission.findUnique({
      where: { id },
      include: {
        employee: true,
        documents: true,
      },
    });
    if (!row) throw new NotFoundException('Submission not found');
    return row;
  }

  async getByEmployee(employeeId: string) {
    return this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: { in: ['draft', 'submitted', 'rejected'] } },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(
    actor: ActorContext,
    submissionId: string,
    approvedFields?: string[],
    approvedDocumentIds?: string[],
  ) {
    const submission = await this.getSubmission(submissionId);
    if (submission.status !== 'submitted') {
      throw new BadRequestException('Only submitted records can be approved');
    }

    const raw = submission.submittedDataJson as Record<string, unknown>;
    const sanitized = sanitizeSubmittedData(raw);
    const approved = approvedFields?.length
      ? Object.fromEntries(
        approvedFields
          .filter((f) => f in sanitized)
          .map((f) => [f, (sanitized as Record<string, unknown>)[f]]),
      ) as SelfOnboardingSubmittedData
      : sanitized;

    await this.applyToEmployee(submission.employeeId, approved, actor);
    await this.applyEmploymentDeclaration(submission.employeeId, submission.companyId, actor);
    await this.applyDocuments(submission, approvedDocumentIds, actor);

    const updated = await this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'approved',
        approvedDataJson: approved,
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
      },
    });

    await this.prisma.employeeSelfOnboardingSubmission.updateMany({
      where: {
        employeeId: submission.employeeId,
        id: { not: submissionId },
        status: 'draft',
      },
      data: { status: 'cancelled' },
    });

    await this.audit.record(actor, {
      entityType: 'EmployeeSelfOnboardingSubmission',
      entityId: submissionId,
      action: approvedFields?.length ? 'self_onboarding_partially_approved' : 'self_onboarding_approved',
      after: { employeeId: submission.employeeId, approvedFields: approvedFields ?? 'all' },
    });

    void this.telegram?.notifyEmployeeApproved(submission.employeeId);

    return updated;
  }

  async reject(actor: ActorContext, submissionId: string, reason: string) {
    const submission = await this.getSubmission(submissionId);
    if (submission.status !== 'submitted') {
      throw new BadRequestException('Only submitted records can be rejected');
    }
    if (!reason?.trim()) throw new BadRequestException('Rejection reason required');

    const updated = await this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'rejected',
        rejectedReason: reason.trim(),
        reviewedBy: actor.userId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.record(actor, {
      entityType: 'EmployeeSelfOnboardingSubmission',
      entityId: submissionId,
      action: 'self_onboarding_rejected',
      after: { reason },
    });

    void this.telegram?.notifyEmployeeRejected(submission.employeeId, reason.trim());

    return updated;
  }

  async cancel(actor: ActorContext, submissionId: string) {
    const submission = await this.getSubmission(submissionId);
    if (!['draft', 'submitted'].includes(submission.status)) {
      throw new BadRequestException('Cannot cancel this submission');
    }

    return this.prisma.employeeSelfOnboardingSubmission.update({
      where: { id: submissionId },
      data: { status: 'cancelled' },
    });
  }

  getSelfOnboardingStatusLabel(
    submission: { status: EmployeeSelfOnboardingStatus } | null,
  ): 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected' {
    if (!submission) return 'not_started';
    if (submission.status === 'draft') return 'in_progress';
    if (submission.status === 'submitted') return 'submitted';
    if (submission.status === 'approved') return 'approved';
    if (submission.status === 'rejected') return 'rejected';
    return 'not_started';
  }

  private async getActiveDraft(employeeId: string) {
    const submission = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: { in: ['draft', 'rejected'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!submission) {
      throw new NotFoundException('No active self-onboarding draft');
    }
    return submission;
  }

  private async applyToEmployee(
    employeeId: string,
    data: SelfOnboardingSubmittedData,
    actor: ActorContext,
  ) {
    let firstName = data.firstName;
    let lastName = data.lastName;
    if (data.fullName) {
      const split = splitFullName(data.fullName);
      firstName = split.firstName;
      lastName = split.lastName;
    }

    const update: Record<string, unknown> = { updatedBy: actor.userId };
    if (firstName) update.firstName = firstName;
    if (lastName) update.lastName = lastName;
    if (data.nickname) update.nickname = data.nickname;
    if (data.phone) update.phone = data.phone;
    if (data.email) update.email = data.email;
    if (data.lineId) update.lineId = data.lineId;
    if (data.address) update.address = data.address;
    if (data.emergencyContactName) update.emergencyContactName = data.emergencyContactName;
    if (data.emergencyContactRelationship) {
      update.emergencyContactRelationship = data.emergencyContactRelationship;
    }
    if (data.emergencyContactPhone) update.emergencyContactPhone = data.emergencyContactPhone;
    if (data.dateOfBirth) update.dateOfBirth = new Date(data.dateOfBirth);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: update,
    });

    if (data.bankAccountNumber) {
      const accountHolder =
        data.bankAccountHolderName?.trim()
        || data.fullName?.trim()
        || [data.firstName, data.lastName].filter(Boolean).join(' ').trim()
        || null;
      if (accountHolder) {
        await this.prisma.employeeBankAccount.updateMany({
          where: { employeeId, isPrimary: true, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actor.userId },
        });
        await this.prisma.employeeBankAccount.create({
          data: {
            id: randomUUID(),
            employeeId,
            bankCode: (data.bankCode ?? data.bankName ?? 'UNKNOWN').slice(0, 20).toUpperCase(),
            accountNo: data.bankAccountNumber,
            accountName: accountHolder,
            isPrimary: true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_profile_updated_from_self_onboarding',
      after: { fields: Object.keys(data) },
    });
  }

  private async applyEmploymentDeclaration(
    employeeId: string,
    companyId: string,
    actor: ActorContext,
  ): Promise<void> {
    const submission = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: 'submitted' },
      orderBy: { submittedAt: 'desc' },
    });
    const decl = (submission?.submittedDataJson as Record<string, unknown> | undefined)
      ?.employmentDeclaration as EmploymentDeclaration | undefined;
    if (!decl || !Object.keys(decl).length) return;

    const employeeUpdate: Record<string, unknown> = { updatedBy: actor.userId };
    if (decl.declaredDepartment) employeeUpdate.department = decl.declaredDepartment;
    if (decl.declaredPosition) employeeUpdate.position = decl.declaredPosition;
    if (decl.declaredWorkLocation) employeeUpdate.workCategory = decl.declaredWorkLocation;
    if (Object.keys(employeeUpdate).length > 1) {
      await this.prisma.employee.update({ where: { id: employeeId }, data: employeeUpdate });
    }

    const companyTeams = decl.companyTeams ?? [];
    const legacyPrimaryTeam = decl.declaredTeamId
      ? [{ companyId, teamId: decl.declaredTeamId }]
      : [];
    const teamsToApply = companyTeams.length
      ? companyTeams.filter((row) => row.teamId && !row.teamSkipped)
      : legacyPrimaryTeam;

    for (let i = 0; i < teamsToApply.length; i += 1) {
      const row = teamsToApply[i];
      const targetCompanyId = row.companyId ?? companyId;
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, companyId: targetCompanyId, effectiveTo: null, deletedAt: null },
      });
      if (assignment) {
        await this.prisma.employeeAssignment.update({
          where: { id: assignment.id },
          data: {
            teamId: row.teamId ?? null,
            isPrimaryTeam: assignment.isPrimaryCompany && Boolean(row.teamId),
            updatedBy: actor.userId,
          },
        });
      } else if (row.teamId) {
        await this.prisma.employeeAssignment.create({
          data: {
            id: randomUUID(),
            employeeId,
            companyId: targetCompanyId,
            teamId: row.teamId,
            effectiveFrom: new Date(),
            isPrimaryCompany: targetCompanyId === companyId,
            isPrimaryTeam: targetCompanyId === companyId,
            roleLevel: 'employee',
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }

    if (decl.declaredOfficeType && (decl.declaredDepartment ?? '').toLowerCase() === 'admin') {
      const adminCompanies = teamsToApply.length
        ? [...new Set(teamsToApply.map((r) => r.companyId ?? companyId))]
        : [companyId];
      for (const cid of adminCompanies) {
        await this.prisma.adminCommissionEmployeeProfile.upsert({
          where: { companyId_employeeId: { companyId: cid, employeeId } },
          create: {
            companyId: cid,
            employeeId,
            officeType: decl.declaredOfficeType,
            defaultShift: 'day',
            isActive: true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
          update: {
            officeType: decl.declaredOfficeType,
            isActive: true,
            updatedBy: actor.userId,
          },
        });
      }
    }

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employment_declaration_applied_from_self_onboarding',
      after: decl,
    });
  }

  private async applyDocuments(
    submission: { id: string; employeeId: string; documents: Array<{ id: string; documentType: SelfOnboardingDocumentType; storageKey: string; fileName: string; mimeType: string | null }> },
    approvedDocumentIds: string[] | undefined,
    actor: ActorContext,
  ) {
    const docs = approvedDocumentIds?.length
      ? submission.documents.filter((d) => approvedDocumentIds.includes(d.id))
      : submission.documents;

    for (const doc of docs) {
      const docType = DOC_TYPE_MAP[doc.documentType] ?? 'other';
      const employeeDoc = await this.prisma.employeeDocument.create({
        data: {
          id: randomUUID(),
          employeeId: submission.employeeId,
          docType,
          fileKey: doc.storageKey,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sourceType: 'self_onboarding',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });

      await this.prisma.employeeSelfOnboardingDocument.update({
        where: { id: doc.id },
        data: { status: 'approved' },
      });

      await this.audit.record(actor, {
        entityType: 'EmployeeDocument',
        entityId: employeeDoc.id,
        action: 'employee_document_uploaded_from_self_onboarding',
        after: { documentType: doc.documentType, submissionId: submission.id },
      });
    }
  }
}
