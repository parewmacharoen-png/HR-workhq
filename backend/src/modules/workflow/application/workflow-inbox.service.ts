// ============================================================================
// modules/workflow/application/workflow-inbox.service.ts
// Pending inbox, approval history, and timeline for web + audit display.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { WorkflowApproverService } from './workflow-approver.service';
import { WorkflowEntityType } from '../domain/entities/workflow.entity';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';
import {
  formatShortNoticeWarning,
  isShortNotice,
} from '../../leave/domain/services/leave-notice.util';
import { offDayUnitsForLeaveType } from '../../payroll/domain/services/off-day-ot-usage.service';
import { DEFAULT_LEAVE_RULES } from '../../settings/domain/leave-settings.types';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  emergency: 'ลาฉุกเฉิน',
  unpaid: 'ลาไม่รับค่าจ้าง',
};

const INBOX_ENTITY_TYPES: WorkflowEntityType[] = [
  'leave',
  'leave_reschedule',
  'leave_shift_swap',
  'overtime',
  'monthly_off',
  'attendance_correction',
  'document_request',
  'commission_adjustment',
  'payroll_adjustment',
  'advance',
];

export interface ApprovalItemSummary {
  title: string;
  subtitle: string;
  requesterName: string;
  requesterEmployeeId: string | null;
  companyName?: string | null;
  teamName?: string | null;
  position?: string | null;
  detailLines: string[];
}

export interface ApprovalInboxItem {
  instanceId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  companyId: string | null;
  status: string;
  currentStepOrder: number;
  submittedAt: string;
  summary: ApprovalItemSummary;
}

export interface ApprovalHistoryItem extends ApprovalInboxItem {
  lastActionAt: string | null;
  lastAction: string | null;
  lastChannel: string | null;
  resolvedAt: string | null;
}

export interface ApprovalTimelineEntry {
  id: string;
  kind: 'submitted' | 'action';
  stepOrder: number | null;
  action: string | null;
  actorUserId: string | null;
  actorName: string;
  channel: string | null;
  comment: string | null;
  occurredAt: string;
  isOwnerOverride: boolean;
}

export interface ApprovalInstanceDetail {
  instance: ApprovalHistoryItem;
  timeline: ApprovalTimelineEntry[];
}

@Injectable()
export class WorkflowInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approver: WorkflowApproverService,
  ) {}

  async listPendingInbox(
    actorUserId: string,
    companyId: string | null,
    entityType?: WorkflowEntityType,
    limit = 50,
  ): Promise<ApprovalInboxItem[]> {
    const types = entityType ? [entityType] : INBOX_ENTITY_TYPES;
    const seen = new Set<string>();
    const items: ApprovalInboxItem[] = [];

    for (const type of types) {
      const instances = await this.approver.findPendingForActor(
        actorUserId,
        type,
        companyId,
        limit,
      );
      for (const inst of instances) {
        if (seen.has(inst.id)) continue;
        seen.add(inst.id);
        const summary = await this.buildSummary(
          inst.entityType as WorkflowEntityType,
          inst.entityId,
          inst.companyId,
        );
        items.push({
          instanceId: inst.id,
          entityType: inst.entityType as WorkflowEntityType,
          entityId: inst.entityId,
          companyId: inst.companyId,
          status: inst.status,
          currentStepOrder: inst.currentStepOrder,
          submittedAt: inst.createdAt.toISOString(),
          summary,
        });
      }
      if (items.length >= limit) break;
    }

    return items
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(0, limit);
  }

  async listHistory(
    actorUserId: string,
    opts: {
      companyId?: string | null;
      status?: string;
      entityType?: WorkflowEntityType;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {},
  ): Promise<ApprovalHistoryItem[]> {
    const limit = opts.limit ?? 100;
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
        },
      },
    });
    const role = user?.businessRoleAssignments[0]?.role ?? null;
    const seeAllCompany = Boolean(
      opts.companyId && (role === 'owner' || role === 'secretary'),
    );

    const instances = await this.prisma.workflowInstance.findMany({
      where: {
        deletedAt: null,
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        ...(opts.status ? { status: opts.status as never } : {}),
        ...(opts.entityType ? { entityType: opts.entityType } : {}),
        ...(opts.from || opts.to ? {
          updatedAt: {
            ...(opts.from ? { gte: opts.from } : {}),
            ...(opts.to ? { lte: opts.to } : {}),
          },
        } : {}),
        ...(seeAllCompany
          ? {}
          : {
              OR: [
                { initiatedBy: actorUserId },
                { actions: { some: { actorUserId } } },
              ],
            }),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        actions: { orderBy: { actedAt: 'desc' }, take: 1 },
      },
    });

    const results: ApprovalHistoryItem[] = [];
    for (const inst of instances) {
      const summary = await this.buildSummary(
        inst.entityType as WorkflowEntityType,
        inst.entityId,
        inst.companyId,
      );
      const last = inst.actions[0];
      results.push({
        instanceId: inst.id,
        entityType: inst.entityType as WorkflowEntityType,
        entityId: inst.entityId,
        companyId: inst.companyId,
        status: inst.status,
        currentStepOrder: inst.currentStepOrder,
        submittedAt: inst.createdAt.toISOString(),
        summary,
        lastActionAt: last?.actedAt.toISOString() ?? null,
        lastAction: last?.action ?? null,
        lastChannel: last?.channel ?? null,
        resolvedAt: ['approved', 'rejected', 'cancelled'].includes(inst.status)
          ? (last?.actedAt ?? inst.updatedAt).toISOString()
          : null,
      });
    }
    return results;
  }

  async getInstanceDetail(instanceId: string): Promise<ApprovalInstanceDetail | null> {
    const inst = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
      include: {
        actions: { orderBy: { actedAt: 'asc' }, include: { actor: { include: { employee: true } } } },
        initiator: { include: { employee: true } },
      },
    });
    if (!inst) return null;

    const summary = await this.buildSummary(
      inst.entityType as WorkflowEntityType,
      inst.entityId,
      inst.companyId,
    );
    const last = inst.actions[inst.actions.length - 1];
    const instance: ApprovalHistoryItem = {
      instanceId: inst.id,
      entityType: inst.entityType as WorkflowEntityType,
      entityId: inst.entityId,
      companyId: inst.companyId,
      status: inst.status,
      currentStepOrder: inst.currentStepOrder,
      submittedAt: inst.createdAt.toISOString(),
      summary,
      lastActionAt: last?.actedAt.toISOString() ?? null,
      lastAction: last?.action ?? null,
      lastChannel: last?.channel ?? null,
      resolvedAt: ['approved', 'rejected', 'cancelled'].includes(inst.status)
        ? (last?.actedAt ?? inst.updatedAt).toISOString()
        : null,
    };

    const timeline: ApprovalTimelineEntry[] = [
      {
        id: `submit-${inst.id}`,
        kind: 'submitted',
        stepOrder: 1,
        action: 'submitted',
        actorUserId: inst.initiatedBy,
        actorName: inst.initiator ? this.userName(inst.initiator) : 'ระบบ',
        channel: 'web',
        comment: null,
        occurredAt: inst.createdAt.toISOString(),
        isOwnerOverride: false,
      },
      ...inst.actions.map((a) => ({
        id: a.id,
        kind: 'action' as const,
        stepOrder: a.stepOrder,
        action: a.action,
        actorUserId: a.actorUserId,
        actorName: this.userName(a.actor),
        channel: a.channel,
        comment: a.comment,
        occurredAt: a.actedAt.toISOString(),
        isOwnerOverride: a.isOwnerOverride,
      })),
    ];

    return { instance, timeline };
  }

  private userName(user: {
    username: string;
    employee: { firstName: string; lastName: string; nickname?: string | null } | null;
  }): string {
    if (user.employee) {
      const fullName = `${user.employee.firstName} ${user.employee.lastName}`.trim();
      const nickname = user.employee.nickname?.trim();
      return nickname ? `${fullName} (${nickname})` : fullName;
    }
    return user.username;
  }

  private employeeDisplayName(emp: {
    firstName: string;
    lastName: string;
    nickname?: string | null;
  }): string {
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const nickname = emp.nickname?.trim();
    return nickname ? `${fullName} (${nickname})` : fullName;
  }

  private async enrichWithOrg(
    summary: ApprovalItemSummary,
    companyId?: string | null,
  ): Promise<ApprovalItemSummary> {
    if (!summary.requesterEmployeeId) return summary;
    const org = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      summary.requesterEmployeeId,
      companyId,
    );
    return {
      ...summary,
      companyName: org.companyName,
      teamName: org.teamName,
      position: org.position,
    };
  }

  private async buildSummary(
    entityType: WorkflowEntityType,
    entityId: string,
    companyId?: string | null,
  ): Promise<ApprovalItemSummary> {
    let summary: ApprovalItemSummary;
    switch (entityType) {
      case 'leave': {
        const row = await this.prisma.leaveRequest.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { employee: true, leaveType: true },
        });
        if (!row) return this.fallbackSummary(entityType, entityId);
        const name = this.employeeDisplayName(row.employee);
        const start = row.startDate.toISOString().slice(0, 10);
        const end = row.endDate.toISOString().slice(0, 10);
        const code = row.leaveType.code.toLowerCase();
        const typeLabel = LEAVE_TYPE_LABELS[code] ?? row.leaveType.name;
        const detailLines = [
          typeLabel,
          `${start} → ${end}`,
          `${row.days} วัน`,
          row.reason ?? '',
        ];
        if (code === 'emergency') {
          detailLines.push('🚨 นับเป็นวันหยุด 2 วันต่อโอที');
        }
        if (isShortNotice(row.createdAt, start, DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays)) {
          const warn = formatShortNoticeWarning([start], DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays);
          if (warn) detailLines.push(warn);
        }
        detailLines.push(`ผลต่อโอที: นับ ${Math.max(1, Number(row.days)) * offDayUnitsForLeaveType(code)} วัน`);
        summary = {
          title: `คำขอลา · ${typeLabel}`,
          subtitle: `${name} · ${start} → ${end}`,
          requesterName: name,
          requesterEmployeeId: row.employeeId,
          detailLines: detailLines.filter(Boolean),
        };
        break;
      }
      case 'overtime': {
        const row = await this.prisma.overtimeRecord.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { employee: true },
        });
        if (!row) return this.fallbackSummary(entityType, entityId);
        const name = this.employeeDisplayName(row.employee);
        const date = row.workDate.toISOString().slice(0, 10);
        summary = {
          title: 'คำขอ OT',
          subtitle: `${name} · ${date}`,
          requesterName: name,
          requesterEmployeeId: row.employeeId,
          detailLines: [`${row.otHours} ชม.`],
        };
        break;
      }
      case 'leave_reschedule': {
        const row = await this.prisma.leaveRescheduleRequest.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { employee: true, leaveRequest: { include: { leaveType: true } } },
        });
        if (!row) return this.fallbackSummary(entityType, entityId);
        const name = this.employeeDisplayName(row.employee);
        summary = {
          title: 'เลื่อนวันลา',
          subtitle: name,
          requesterName: name,
          requesterEmployeeId: row.employeeId,
          detailLines: [row.leaveRequest?.leaveType?.name ?? ''].filter(Boolean),
        };
        break;
      }
      case 'monthly_off': {
        const row = await this.prisma.monthlyOffRequest.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { employee: true },
        });
        if (!row) return this.fallbackSummary(entityType, entityId);
        const name = this.employeeDisplayName(row.employee);
        const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
        summary = {
          title: 'แจ้งวันหยุดประจำเดือน',
          subtitle: `${name} · ${dates.length} วัน`,
          requesterName: name,
          requesterEmployeeId: row.employeeId,
          detailLines: dates.slice(0, 5),
        };
        break;
      }
      case 'attendance_correction': {
        const row = await this.prisma.attendanceCorrection.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { attendanceRecord: { include: { employee: true } } },
        });
        if (!row?.attendanceRecord) return this.fallbackSummary(entityType, entityId);
        const emp = row.attendanceRecord.employee;
        const name = this.employeeDisplayName(emp);
        const date = row.attendanceRecord.workDate.toISOString().slice(0, 10);
        summary = {
          title: 'แก้ไขเวลาเข้างาน',
          subtitle: `${name} · ${date}`,
          requesterName: name,
          requesterEmployeeId: emp.id,
          detailLines: [row.field, row.reason ?? ''].filter(Boolean),
        };
        break;
      }
      case 'document_request': {
        const row = await this.prisma.documentRequest.findFirst({
          where: { id: entityId },
          include: { employee: true, type: true },
        });
        if (!row) return this.fallbackSummary(entityType, entityId);
        const name = this.employeeDisplayName(row.employee);
        summary = {
          title: 'ขอเอกสาร',
          subtitle: `${name} · ${row.type.nameTh}`,
          requesterName: name,
          requesterEmployeeId: row.employeeId,
          detailLines: [row.type.nameTh],
        };
        break;
      }
      default:
        return this.fallbackSummary(entityType, entityId);
    }
    return this.enrichWithOrg(summary, companyId);
  }

  private fallbackSummary(entityType: WorkflowEntityType, entityId: string): ApprovalItemSummary {
    const labels: Partial<Record<WorkflowEntityType, string>> = {
      monthly_off: 'แจ้งวันหยุดประจำเดือน',
      attendance_correction: 'แก้ไขเวลาเข้างาน',
      document_request: 'ขอเอกสาร',
      leave_shift_swap: 'สลับกะ',
      advance: 'เบิกล่วงหน้า',
      commission_adjustment: 'ปรับคอมมิชชั่น',
      payroll_adjustment: 'ปรับเงินเดือน',
    };
    return {
      title: labels[entityType] ?? entityType,
      subtitle: entityId.slice(0, 8),
      requesterName: '—',
      requesterEmployeeId: null,
      detailLines: [],
    };
  }
}
