// ============================================================================
// Approve/reject employee onboarding requests → link Telegram + apply preset
// ============================================================================

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import type { EmployeeOnboardingApprovalService } from '../../employee-onboarding/application/employee-onboarding-approval.service';
import { EMPLOYEE_ONBOARDING_APPROVAL } from '../../employee-onboarding/application/employee-onboarding-approval.token';

@Injectable()
export class TelegramRegistrationIntegrationService {
  constructor(
    @Optional() @Inject(EMPLOYEE_ONBOARDING_APPROVAL)
    private readonly onboardingApproval?: EmployeeOnboardingApprovalService,
  ) {}

  async processApproved(actor: ActorContext, values: Record<string, unknown>): Promise<{
    entityType: string;
    entityId: string | null;
    message: string;
  }> {
    if (!this.onboardingApproval) throw new Error('Onboarding approval service unavailable');

    const result = await this.onboardingApproval.processApproved(actor, {
      employeeId: parseString(values.employeeId),
      telegramUserId: Number(parseString(values.telegramUserId)),
      invitationId: parseString(values.invitationId) || null,
      selfOnboardingSubmissionId: parseString(values.selfOnboardingSubmissionId) || null,
      registrationRequestId: parseString(values.registrationRequestId) || null,
      requestInstanceId: parseString(values.requestInstanceId) || null,
    });

    return {
      entityType: result.entityType,
      entityId: result.entityId,
      message: result.message,
    };
  }

  async processRejected(actor: ActorContext, values: Record<string, unknown>, reason: string): Promise<void> {
    if (!this.onboardingApproval) return;
    await this.onboardingApproval.processRejected(actor, {
      employeeId: parseString(values.employeeId),
      telegramUserId: Number(parseString(values.telegramUserId)),
      invitationId: parseString(values.invitationId) || null,
      selfOnboardingSubmissionId: parseString(values.selfOnboardingSubmissionId) || null,
      registrationRequestId: parseString(values.registrationRequestId) || null,
      requestInstanceId: parseString(values.requestInstanceId) || null,
    }, reason);
  }
}

function parseString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
