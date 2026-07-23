import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { RequestAccessService } from './request-access.service';
import { EmployeeReferralService } from './employee-referral.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RequestValidationError } from '../domain/errors/request.errors';

@Injectable()
export class RequestDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: RequestAccessService,
    private readonly referrals: EmployeeReferralService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async getDashboard(actor: ActorContext, companyId: string) {
    await this.access.assertCanViewCompanyRequests(actor, companyId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [submittedToday, pendingApproval, byType, myPending] = await Promise.all([
      this.prisma.requestInstance.count({
        where: { companyId, deletedAt: null, submittedAt: { gte: todayStart } },
      }),
      this.prisma.requestInstance.count({
        where: { companyId, deletedAt: null, status: 'in_review' },
      }),
      this.prisma.requestInstance.groupBy({
        by: ['requestTypeId'],
        where: { companyId, deletedAt: null },
        _count: { id: true },
      }),
      this.myPendingCount(actor),
    ]);

    const overdue = await this.prisma.requestInstance.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'in_review',
        submittedAt: { lt: new Date(Date.now() - 48 * 3600000) },
      },
    });

    const typeNames = await this.prisma.requestType.findMany({
      where: { id: { in: byType.map((b) => b.requestTypeId) } },
      select: { id: true, nameTh: true },
    });
    const typeMap = Object.fromEntries(typeNames.map((t) => [t.id, t.nameTh]));
    const referralWidgets = await this.referrals.getReferralDashboardWidgets(actor, companyId);

    return {
      submittedToday,
      pendingApproval,
      overdue,
      myPendingApprovals: myPending,
      byType: byType.map((b) => ({
        requestTypeId: b.requestTypeId,
        nameTh: typeMap[b.requestTypeId] ?? b.requestTypeId,
        count: b._count.id,
      })),
      referrals: referralWidgets,
    };
  }

  private async myPendingCount(actor: ActorContext): Promise<number> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access) return 0;
    const role = access.businessRole;
    const stepFilter = role === 'owner' || role === 'secretary'
      ? { status: 'pending' as const }
      : {
          status: 'pending' as const,
          OR: [
            ...(access.employeeId ? [{ approverEmployeeId: access.employeeId }] : []),
            { approverUserId: actor.userId },
          ],
        };
    return this.prisma.requestInstance.count({
      where: {
        deletedAt: null,
        status: 'in_review',
        approvalSteps: { some: stepFilter },
      },
    });
  }
}
