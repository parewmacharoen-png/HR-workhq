// ============================================================================
// Bridge Telegram registration / self-onboarding → Web Requests (in_review)
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { RequestInstanceService } from './request-instance.service';
import { EMPLOYEE_ONBOARDING_TYPE_KEY } from '../../employee-onboarding/domain/employee-onboarding.constants';

export const TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY = 'telegram_registration_review';
export { EMPLOYEE_ONBOARDING_TYPE_KEY };

export interface TelegramRegistrationReviewParams {
  employeeId: string;
  companyId: string;
  telegramUserId: number | bigint;
  verificationMethod: string;
  submittedEmployeeCode?: string | null;
  submittedPhone?: string | null;
  submittedInviteCode?: string | null;
  invitationId?: string | null;
  registrationRequestId?: string | null;
  selfOnboardingSubmissionId?: string | null;
  reviewReason?: string | null;
  requesterUserId?: string | null;
}

@Injectable()
export class TelegramRegistrationRequestBridgeService {
  private readonly logger = new Logger(TelegramRegistrationRequestBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly instances: RequestInstanceService,
  ) {}

  async resolveCompanyId(employeeId: string, fallbackCompanyId?: string | null): Promise<string | null> {
    if (fallbackCompanyId) return fallbackCompanyId;
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, deletedAt: null, effectiveTo: null, isPrimaryCompany: true },
      select: { companyId: true },
    });
    if (assignment?.companyId) return assignment.companyId;
    const anyAssignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, deletedAt: null, effectiveTo: null },
      select: { companyId: true },
    });
    return anyAssignment?.companyId ?? null;
  }

  async findExistingOpenRequest(
    employeeId: string,
    telegramUserId?: number | bigint,
  ): Promise<string | null> {
    const types = await this.prisma.requestType.findMany({
      where: {
        key: { in: [EMPLOYEE_ONBOARDING_TYPE_KEY, TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!types.length) return null;

    const existing = await this.prisma.requestInstance.findFirst({
      where: {
        requesterEmployeeId: employeeId,
        requestTypeId: { in: types.map((t) => t.id) },
        status: { in: ['draft', 'submitted', 'in_review'] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, values: { where: { fieldKey: 'telegramUserId' }, take: 1 } },
    });
    if (!existing) return null;

    if (telegramUserId != null && existing.values[0]?.valueText) {
      if (existing.values[0].valueText !== String(telegramUserId)) return null;
    }

    if (existing.status === 'draft') {
      await this.instances.submitDraftTelegramRegistration(existing.id);
    }
    return existing.id;
  }

  async createAndSubmit(params: TelegramRegistrationReviewParams): Promise<string | null> {
    const existing = await this.findExistingOpenRequest(params.employeeId, params.telegramUserId);
    if (existing) return existing;

    try {
      const instanceId = await this.instances.createAndSubmitSystemRequest({
        typeKey: EMPLOYEE_ONBOARDING_TYPE_KEY,
        companyId: params.companyId,
        requesterEmployeeId: params.employeeId,
        requesterUserId: params.requesterUserId ?? null,
        values: {
          employeeId: params.employeeId,
          telegramUserId: String(params.telegramUserId),
          verificationMethod: params.verificationMethod,
          submittedEmployeeCode: params.submittedEmployeeCode ?? '',
          submittedPhone: params.submittedPhone ?? '',
          submittedInviteCode: params.submittedInviteCode ?? '',
          invitationId: params.invitationId ?? '',
          registrationRequestId: params.registrationRequestId ?? '',
          selfOnboardingSubmissionId: params.selfOnboardingSubmissionId ?? '',
          reviewReason: params.reviewReason ?? 'auto_confirm_failed',
        },
      });

      if (params.registrationRequestId) {
        await this.prisma.registrationRequest.update({
          where: { id: params.registrationRequestId },
          data: { requestInstanceId: instanceId },
        });
      }
      if (params.selfOnboardingSubmissionId) {
        await this.prisma.employeeSelfOnboardingSubmission.update({
          where: { id: params.selfOnboardingSubmissionId },
          data: { requestInstanceId: instanceId },
        });
      }

      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'RequestInstance',
        entityId: instanceId,
        action: 'telegram_registration_review_created',
        after: {
          employeeId: params.employeeId,
          telegramUserId: String(params.telegramUserId),
          status: 'in_review',
        },
      });

      return instanceId;
    } catch (err: unknown) {
      this.logger.error(`Failed to create telegram registration request: ${(err as Error).message}`, err);
      return null;
    }
  }

  /** Repair all draft onboarding requests left from earlier builds. */
  async repairDraftRequests(): Promise<{ repaired: string[]; failed: string[] }> {
    const types = await this.prisma.requestType.findMany({
      where: {
        key: { in: [EMPLOYEE_ONBOARDING_TYPE_KEY, TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!types.length) return { repaired: [], failed: [] };

    const drafts = await this.prisma.requestInstance.findMany({
      where: { requestTypeId: { in: types.map((t) => t.id) }, status: 'draft', deletedAt: null },
      select: { id: true },
    });

    const repaired: string[] = [];
    const failed: string[] = [];
    for (const row of drafts) {
      try {
        await this.instances.submitDraftTelegramRegistration(row.id);
        repaired.push(row.id);
      } catch (err: unknown) {
        this.logger.warn(`Repair failed for ${row.id}: ${(err as Error).message}`);
        failed.push(row.id);
      }
    }
    return { repaired, failed };
  }

  /** Repair draft requests and backfill missing requests for submitted self-onboarding. */
  async repairOnboardingRequests(): Promise<{
    draftsRepaired: string[];
    draftsFailed: string[];
    backfilled: string[];
    backfillFailed: string[];
  }> {
    const draftResult = await this.repairDraftRequests();

    const submissions = await this.prisma.employeeSelfOnboardingSubmission.findMany({
      where: {
        status: 'submitted',
        requestInstanceId: null,
      },
      select: {
        id: true,
        employeeId: true,
        companyId: true,
      },
    });

    const backfilled: string[] = [];
    const backfillFailed: string[] = [];

    for (const submission of submissions) {
      const identity = await this.prisma.telegramIdentity.findFirst({
        where: {
          employeeId: submission.employeeId,
          status: { in: ['PENDING', 'ACTIVE'] },
          deletedAt: null,
        },
        orderBy: { linkedAt: 'desc' },
      });
      if (!identity) {
        backfillFailed.push(submission.id);
        continue;
      }

      const invite = await this.prisma.employeeTelegramInvite.findFirst({
        where: {
          employeeId: submission.employeeId,
          status: { in: ['started', 'used'] },
          usedTelegramUserId: identity.telegramUserId,
        },
        orderBy: { createdAt: 'desc' },
      });

      try {
        const requestId = await this.createAndSubmit({
          employeeId: submission.employeeId,
          companyId: submission.companyId,
          telegramUserId: identity.telegramUserId,
          verificationMethod: 'invite_link',
          invitationId: invite?.id ?? null,
          selfOnboardingSubmissionId: submission.id,
          reviewReason: 'repair_backfill',
        });
        if (requestId) backfilled.push(requestId);
        else backfillFailed.push(submission.id);
      } catch {
        backfillFailed.push(submission.id);
      }
    }

    return {
      draftsRepaired: draftResult.repaired,
      draftsFailed: draftResult.failed,
      backfilled,
      backfillFailed,
    };
  }
}
