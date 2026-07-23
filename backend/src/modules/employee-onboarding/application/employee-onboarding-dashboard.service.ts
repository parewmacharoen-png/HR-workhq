// ============================================================================
// EMP-001 — Onboarding dashboard statistics
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { reconcileStaleDraftSubmissions } from '../domain/onboarding-reconcile.util';
import { resolveTelegramConnectionStatus } from '../domain/telegram-connection-status.util';

@Injectable()
export class EmployeeOnboardingDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(companyId: string) {
    await reconcileStaleDraftSubmissions(this.prisma, companyId);

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { not: 'terminated' },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: { id: true },
    });

    let notConnected = 0;
    let invitePending = 0;
    let inviteExpired = 0;
    let inProgress = 0;
    let pendingReview = 0;

    await Promise.all(
      employees.map(async ({ id }) => {
        const status = await resolveTelegramConnectionStatus(this.prisma, id);
        switch (status) {
          case 'not_connected':
            notConnected += 1;
            break;
          case 'invite_sent':
            invitePending += 1;
            break;
          case 'expired':
            inviteExpired += 1;
            break;
          case 'started':
            inProgress += 1;
            break;
          case 'pending_review':
            pendingReview += 1;
            break;
          default:
            break;
        }
      }),
    );

    const pendingDocuments = await this.prisma.employeeSelfOnboardingDocument.count({
      where: {
        status: 'uploaded',
        submission: { companyId, status: 'submitted' },
      },
    });

    return {
      notConnected,
      invitePending,
      inviteExpired,
      inProgress,
      pendingReview,
      pendingDocuments,
    };
  }
}
