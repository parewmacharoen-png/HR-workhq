// ============================================================================
// Unified approval hub — daily summary + paginated pending for ~100 staff scale.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { WorkflowInboxService, type ApprovalInboxItem, type ApprovalItemSummary } from './workflow-inbox.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { buildRequestSummaryLines } from '../../request/application/request-summary.util';
import { valuesMapFromRows } from '../../request/application/request-condition.util';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';
import { isOnboardingRequestTypeKey, ONBOARDING_REQUEST_DISPLAY_TH } from '../../employee-onboarding/domain/employee-onboarding.constants';
import { resolveApprovalCategory } from '../../request/application/approval-category.util';
import { BUSINESS_ROLE_BUNDLES } from '../../permission/domain/entities/business-role-bundles';

export interface UnifiedPendingItem {
  instanceId: string;
  source: 'workflow' | 'request';
  entityType: string;
  requestTypeKey: string | null;
  category: string;
  status: string;
  submittedAt: string;
  summary: ApprovalItemSummary;
}

export interface ApprovalDailySummary {
  pendingTotal: number;
  submittedToday: number;
  leavePending: number;
  otPending: number;
  monthlyOffPending: number;
  attendancePending: number;
  otherPending: number;
  overdue48h: number;
}

export interface PaginatedPendingResult {
  items: UnifiedPendingItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const WORKFLOW_OT = new Set(['overtime']);
const WORKFLOW_LEAVE = new Set(['leave', 'leave_reschedule', 'leave_shift_swap']);
const WORKFLOW_MONTHLY_OFF = new Set(['monthly_off']);
const WORKFLOW_ATTENDANCE = new Set(['attendance_correction']);

@Injectable()
export class ApprovalHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: WorkflowInboxService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async getDailySummary(actor: ActorContext, companyId: string | null): Promise<ApprovalDailySummary> {
    const cid = companyId ?? actor.companyId ?? null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const overdueBefore = new Date(Date.now() - 48 * 3_600_000);

    const pending = await this.collectAllPending(actor, cid, undefined, 500);

    const [workflowSubmittedToday, requestSubmittedToday] = await Promise.all([
      this.prisma.workflowInstance.count({
        where: {
          deletedAt: null,
          ...(cid ? { companyId: cid } : {}),
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.requestInstance.count({
        where: {
          deletedAt: null,
          ...(cid ? { companyId: cid } : {}),
          submittedAt: { gte: todayStart },
        },
      }),
    ]);

    let leavePending = 0;
    let otPending = 0;
    let monthlyOffPending = 0;
    let attendancePending = 0;
    let otherPending = 0;
    let overdue48h = 0;

    for (const item of pending) {
      const cat = item.category;
      if (cat === 'leave') leavePending += 1;
      else if (cat === 'ot') otPending += 1;
      else if (cat === 'monthly_off') monthlyOffPending += 1;
      else if (cat === 'attendance') attendancePending += 1;
      else otherPending += 1;

      if (new Date(item.submittedAt).getTime() < overdueBefore.getTime()) {
        overdue48h += 1;
      }
    }

    return {
      pendingTotal: pending.length,
      submittedToday: workflowSubmittedToday + requestSubmittedToday,
      leavePending,
      otPending,
      monthlyOffPending,
      attendancePending,
      otherPending,
      overdue48h,
    };
  }

  async listPending(
    actor: ActorContext,
    opts: {
      companyId?: string | null;
      search?: string;
      category?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<PaginatedPendingResult> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const cid = opts.companyId ?? actor.companyId ?? null;

    let items = await this.collectAllPending(actor, cid, opts.search, 500);

    if (opts.category && opts.category !== 'all') {
      items = items.filter((i) => matchesCategoryFilter(i, opts.category!));
    }

    items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const total = items.length;
    const page = items.slice(offset, offset + limit);

    return {
      items: page,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  private async collectAllPending(
    actor: ActorContext,
    companyId: string | null,
    search?: string,
    fetchLimit = 200,
  ): Promise<UnifiedPendingItem[]> {
    const [workflowRows, requestRows, salaryRows, absenceRows] = await Promise.all([
      this.inbox.listPendingInbox(actor.userId, companyId, undefined, fetchLimit),
      this.listRequestPending(actor, companyId, fetchLimit),
      this.listSalaryReviewPending(actor, companyId, fetchLimit),
      this.listAbsencePending(actor, companyId, fetchLimit),
    ]);

    const workflowIds = new Set(workflowRows.map((w) => w.instanceId));
    const merged: UnifiedPendingItem[] = workflowRows.map((row) => this.workflowToUnified(row));

    for (const row of requestRows) {
      if (workflowIds.has(row.instanceId)) continue;
      merged.push(row);
    }

    for (const row of salaryRows) {
      if (workflowIds.has(row.instanceId)) continue;
      merged.push(row);
    }

    for (const row of absenceRows) {
      if (workflowIds.has(row.instanceId)) continue;
      merged.push(row);
    }

    merged.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    const q = search?.trim().toLowerCase();
    if (!q) return merged;

    return merged.filter((item) => this.matchesSearch(item, q));
  }

  private async listAbsencePending(
    actor: ActorContext,
    companyId: string | null,
    limit: number,
  ): Promise<UnifiedPendingItem[]> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.businessRole) return [];
    const rolePerms = BUSINESS_ROLE_BUNDLES[access.businessRole] ?? [];
    if (!rolePerms.includes('attendance:write')) return [];

    const rows = await this.prisma.absenceRecord.findMany({
      where: {
        deletedAt: null,
        status: 'flagged',
        ...(companyId ? { companyId } : {}),
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => {
      const employeeName = `${row.employee.firstName} ${row.employee.lastName}`.trim();
      const workDate = row.workDate.toISOString().slice(0, 10);
      return {
        instanceId: row.id,
        source: 'workflow' as const,
        entityType: 'absence_record',
        requestTypeKey: 'absence_record',
        category: 'attendance',
        status: 'pending',
        submittedAt: row.createdAt.toISOString(),
        summary: {
          title: 'ตรวจสอบขาดงาน',
          subtitle: employeeName,
          requesterName: employeeName,
          requesterEmployeeId: row.employeeId,
          companyName: row.company.name,
          teamName: null,
          position: row.positionSnapshot,
          detailLines: [
            `วันที่: ${workDate}`,
            row.flaggedReason,
          ],
        },
      };
    });
  }

  private async listSalaryReviewPending(
    actor: ActorContext,
    companyId: string | null,
    limit: number,
  ): Promise<UnifiedPendingItem[]> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.businessRole !== 'owner') return [];

    const rows = await this.prisma.salaryReview.findMany({
      where: {
        deletedAt: null,
        status: 'pending_approval',
        ...(companyId ? { companyId } : {}),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, globalId: true } },
        company: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => {
      const employeeName = `${row.employee.firstName} ${row.employee.lastName}`.trim();
      const current = Number(row.currentSalary);
      const proposed = Number(row.proposedSalary);
      const isInitial = current <= 0;
      return {
        instanceId: row.id,
        source: 'workflow' as const,
        entityType: 'salary_review',
        requestTypeKey: 'salary_review',
        category: 'other',
        status: 'pending_approval',
        submittedAt: row.updatedAt.toISOString(),
        summary: {
          title: isInitial ? 'ตั้งเงินเดือนเริ่มต้น' : 'อนุมัติปรับเงินเดือน',
          subtitle: employeeName,
          requesterName: employeeName,
          requesterEmployeeId: row.employeeId,
          companyName: row.company.name,
          teamName: null,
          position: null,
          detailLines: [
            `จาก ฿${current.toLocaleString('th-TH')} → ฿${proposed.toLocaleString('th-TH')}`,
            `มีผล: ${row.effectiveDate.toISOString().slice(0, 10)}`,
          ],
        },
      };
    });
  }

  private matchesSearch(item: UnifiedPendingItem, q: string): boolean {
    const hay = [
      item.summary.requesterName,
      item.summary.title,
      item.summary.subtitle,
      item.summary.companyName ?? '',
      item.summary.teamName ?? '',
      ...item.summary.detailLines,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  private workflowToUnified(row: ApprovalInboxItem): UnifiedPendingItem {
    const category = resolveWorkflowCategory(row.entityType);
    return {
      instanceId: row.instanceId,
      source: 'workflow',
      entityType: row.entityType,
      requestTypeKey: row.entityType,
      category,
      status: row.status,
      submittedAt: row.submittedAt,
      summary: row.summary,
    };
  }

  private async listRequestPending(
    actor: ActorContext,
    companyId: string | null,
    limit: number,
  ): Promise<UnifiedPendingItem[]> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access) return [];

    const rows = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'in_review',
        ...(companyId ? { companyId } : {}),
        approvalSteps: { some: this.pendingStepFilter(actor, access) },
      },
      include: {
        requestType: { select: { key: true, nameTh: true } },
        requesterEmployee: { select: { firstName: true, lastName: true, globalId: true } },
        values: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });

    const items: UnifiedPendingItem[] = [];
    for (const row of rows) {
      const typeKey = row.requestType.key;
      const values = valuesMapFromRows(row.values);
      const summaryLines = buildRequestSummaryLines(typeKey, values, {
        submittedAt: row.submittedAt ?? row.createdAt,
      });
      const requesterContext = await loadEmployeeApprovalDisplayContext(
        this.prisma,
        row.requesterEmployeeId,
        row.companyId,
      );
      const requesterName = `${row.requesterEmployee.firstName} ${row.requesterEmployee.lastName}`.trim();
      const nameTh = isOnboardingRequestTypeKey(typeKey)
        ? ONBOARDING_REQUEST_DISPLAY_TH
        : row.requestType.nameTh;

      items.push({
        instanceId: row.id,
        source: 'request',
        entityType: 'request',
        requestTypeKey: typeKey,
        category: resolveApprovalCategory(typeKey, 'request'),
        status: row.status,
        submittedAt: row.submittedAt?.toISOString() ?? row.createdAt.toISOString(),
        summary: {
          title: row.title || nameTh,
          subtitle: requesterName,
          requesterName,
          requesterEmployeeId: row.requesterEmployeeId,
          companyName: requesterContext.companyName,
          teamName: requesterContext.teamName,
          position: requesterContext.position,
          detailLines: summaryLines.length ? summaryLines : [nameTh],
        },
      });
    }
    return items;
  }

  private pendingStepFilter(
    actor: ActorContext,
    access: NonNullable<Awaited<ReturnType<BusinessPermissionRepository['findUserAccess']>>>,
  ) {
    const role = access.businessRole;
    if (role === 'owner' || role === 'secretary') {
      return { status: 'pending' as const };
    }
    return {
      status: 'pending' as const,
      OR: [
        ...(access.employeeId ? [{ approverEmployeeId: access.employeeId }] : []),
        { approverUserId: actor.userId },
      ],
    };
  }
}

function resolveWorkflowCategory(entityType: string): string {
  if (WORKFLOW_LEAVE.has(entityType)) return 'leave';
  if (WORKFLOW_OT.has(entityType)) return 'ot';
  if (WORKFLOW_MONTHLY_OFF.has(entityType)) return 'monthly_off';
  if (WORKFLOW_ATTENDANCE.has(entityType)) return 'attendance';
  return 'other';
}

const PAYROLL_KEYS = new Set(['advance_pay', 'advance', 'payroll_adjustment', 'commission_adjustment']);
const HR_KEYS = new Set([
  'employee_onboarding',
  'telegram_registration_review',
  'document_request',
]);

function hubItemFilterCategory(item: UnifiedPendingItem): string {
  const key = item.requestTypeKey ?? item.entityType;
  if (PAYROLL_KEYS.has(key)) return 'payroll';
  if (HR_KEYS.has(key)) return 'hr';
  return item.category;
}

function matchesCategoryFilter(item: UnifiedPendingItem, filter: string): boolean {
  const cat = hubItemFilterCategory(item);
  if (filter === 'leave') return cat === 'leave' || cat === 'monthly_off';
  return cat === filter;
}
