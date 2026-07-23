import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { WorkflowInboxService } from '../../workflow/application/workflow-inbox.service';

export type UnifiedApprovalSource =
  | 'request'
  | 'workflow'
  | 'salary_review'
  | 'promotion_review'
  | 'exit_leader'
  | 'exit_owner';

export interface UnifiedApprovalItem {
  source: UnifiedApprovalSource;
  id: string;
  entityType?: string;
  title: string;
  subtitle: string;
  submittedAt: string;
}

@Injectable()
export class UnifiedApprovalInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowInbox: WorkflowInboxService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async listPendingForActor(
    actorUserId: string,
    companyId: string | null,
    limit = 15,
  ): Promise<UnifiedApprovalItem[]> {
    const access = await this.permissions.findUserAccess(actorUserId);
    const role = access?.businessRole ?? null;
    const items: UnifiedApprovalItem[] = [];

    if (access?.employeeId) {
      items.push(...await this.listPendingRequests(access.employeeId, actorUserId, companyId));
    }

    items.push(...await this.listPendingWorkflow(actorUserId, companyId, limit));

    if (role === 'owner') {
      items.push(...await this.listPendingSalaryReviews(companyId));
      items.push(...await this.listPendingPromotionReviews(companyId));
      items.push(...await this.listPendingExitOwnerReviews(companyId));
    }

    if (role === 'owner' || role === 'secretary' || role === 'big_leader') {
      items.push(...await this.listPendingExitLeaderReviews(companyId, role));
    }

    return items
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(0, limit);
  }

  private async listPendingRequests(
    employeeId: string,
    userId: string,
    companyId: string | null,
  ): Promise<UnifiedApprovalItem[]> {
    const rows = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'in_review',
        ...(companyId ? { companyId } : {}),
        approvalSteps: {
          some: {
            status: 'pending',
            OR: [
              { approverEmployeeId: employeeId },
              { approverUserId: userId },
            ],
          },
        },
      },
      include: {
        requestType: true,
        requesterEmployee: true,
      },
      orderBy: { submittedAt: 'asc' },
      take: 10,
    });

    return rows.map((row) => ({
      source: 'request' as const,
      id: row.id,
      title: row.title,
      subtitle: `${row.requesterEmployee.firstName} ${row.requesterEmployee.lastName}`.trim(),
      submittedAt: (row.submittedAt ?? row.createdAt).toISOString(),
    }));
  }

  private async listPendingWorkflow(
    actorUserId: string,
    companyId: string | null,
    limit: number,
  ): Promise<UnifiedApprovalItem[]> {
    const inbox = await this.workflowInbox.listPendingInbox(actorUserId, companyId, undefined, limit);
    return inbox.map((item) => ({
      source: 'workflow' as const,
      id: item.instanceId,
      entityType: item.entityType,
      title: item.summary.title,
      subtitle: item.summary.subtitle,
      submittedAt: item.submittedAt,
    }));
  }

  private async listPendingSalaryReviews(companyId: string | null): Promise<UnifiedApprovalItem[]> {
    const rows = await this.prisma.salaryReview.findMany({
      where: {
        deletedAt: null,
        status: 'pending_approval',
        ...(companyId ? { companyId } : {}),
      },
      include: { employee: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    return rows.map((row) => ({
      source: 'salary_review' as const,
      id: row.id,
      title: 'ปรับเงินเดือน',
      subtitle: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      submittedAt: row.createdAt.toISOString(),
    }));
  }

  private async listPendingPromotionReviews(companyId: string | null): Promise<UnifiedApprovalItem[]> {
    const rows = await this.prisma.promotionReview.findMany({
      where: {
        deletedAt: null,
        status: 'pending_approval',
        ...(companyId ? { companyId } : {}),
      },
      include: { employee: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    return rows.map((row) => ({
      source: 'promotion_review' as const,
      id: row.id,
      title: 'ปรับตำแหน่ง',
      subtitle: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      submittedAt: row.createdAt.toISOString(),
    }));
  }

  private async listPendingExitLeaderReviews(
    companyId: string | null,
    role: BusinessRoleCode,
  ): Promise<UnifiedApprovalItem[]> {
    const rows = await this.prisma.employeeExitCase.findMany({
      where: {
        deletedAt: null,
        status: 'pending_leader_review',
        ...(companyId ? { companyId } : {}),
      },
      include: { employee: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    return rows
      .filter((row) => this.canReviewExitLeader(row.departmentRoute, role))
      .map((row) => ({
        source: 'exit_leader' as const,
        id: row.id,
        title: 'อนุมัติการลาออก (หัวหน้า)',
        subtitle: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
        submittedAt: row.createdAt.toISOString(),
      }));
  }

  private async listPendingExitOwnerReviews(companyId: string | null): Promise<UnifiedApprovalItem[]> {
    const rows = await this.prisma.employeeExitCase.findMany({
      where: {
        deletedAt: null,
        status: 'pending_owner_review',
        ...(companyId ? { companyId } : {}),
      },
      include: { employee: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    return rows.map((row) => ({
      source: 'exit_owner' as const,
      id: row.id,
      title: 'อนุมัติการลาออก (เจ้าของ)',
      subtitle: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      submittedAt: row.createdAt.toISOString(),
    }));
  }

  private canReviewExitLeader(
    departmentRoute: string,
    role: BusinessRoleCode,
  ): boolean {
    if (departmentRoute === 'marketing') {
      return role === 'big_leader' || role === 'owner';
    }
    return role === 'secretary' || role === 'owner';
  }
}
