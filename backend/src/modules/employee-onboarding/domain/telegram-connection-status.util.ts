// Shared Telegram connection status resolution (no Nest DI — safe across modules)

import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  EMPLOYEE_ONBOARDING_TYPE_KEY,
  TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY,
} from './employee-onboarding.constants';
import { TelegramConnectionStatus } from './self-onboarding.types';

async function findMeaningfulSubmission(prisma: PrismaService, employeeId: string) {
  for (const status of ['approved', 'submitted', 'rejected', 'draft'] as const) {
    const row = await prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status },
      orderBy: { updatedAt: 'desc' },
    });
    if (row) return row;
  }
  return null;
}

export async function resolveTelegramConnectionStatus(
  prisma: PrismaService,
  employeeId: string,
): Promise<TelegramConnectionStatus> {
  const [identity, submission, invite, openRequest] = await Promise.all([
    prisma.telegramIdentity.findFirst({
      where: { employeeId, deletedAt: null, status: { in: ['ACTIVE', 'PENDING', 'REVOKED'] } },
      orderBy: { linkedAt: 'desc' },
    }),
    findMeaningfulSubmission(prisma, employeeId),
    prisma.employeeTelegramInvite.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    }),
    findLatestTelegramRegistrationRequest(prisma, employeeId),
  ]);

  if (submission?.status === 'rejected' || openRequest?.status === 'rejected') {
    return 'rejected';
  }

  // Active identity = employee is using the bot (check-in, requests, etc.)
  if (identity?.status === 'ACTIVE') {
    return 'linked';
  }

  if (submission?.status === 'submitted' || openRequest?.status === 'in_review') {
    return 'pending_review';
  }

  if (identity?.status === 'PENDING') {
    if (submission?.status === 'draft') return 'started';
    return 'pending_review';
  }

  if (invite?.status === 'started') return 'started';

  if (invite?.status === 'pending' && invite.expiresAt > new Date()) {
    return 'invite_sent';
  }

  if (invite && (invite.status === 'expired' || (invite.status === 'pending' && invite.expiresAt <= new Date()))) {
    return 'expired';
  }

  return 'not_connected';
}

async function findLatestTelegramRegistrationRequest(prisma: PrismaService, employeeId: string) {
  const types = await prisma.requestType.findMany({
    where: {
      key: { in: [EMPLOYEE_ONBOARDING_TYPE_KEY, TELEGRAM_REGISTRATION_REVIEW_TYPE_KEY] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!types.length) return null;
  return prisma.requestInstance.findFirst({
    where: {
      requesterEmployeeId: employeeId,
      requestTypeId: { in: types.map((row) => row.id) },
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });
}

export function mapConnectionStatusToOverview(
  status: TelegramConnectionStatus,
): 'linked' | 'invitation_sent' | 'pending_review' | 'not_linked' | 'expired' | 'rejected' {
  switch (status) {
    case 'linked':
      return 'linked';
    case 'invite_sent':
      return 'invitation_sent';
    case 'started':
    case 'onboarding_submitted':
    case 'pending_review':
      return 'pending_review';
    case 'expired':
      return 'expired';
    case 'rejected':
      return 'rejected';
    default:
      return 'not_linked';
  }
}
