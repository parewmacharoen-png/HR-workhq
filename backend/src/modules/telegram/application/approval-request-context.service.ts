// ============================================================================
// modules/telegram/application/approval-request-context.service.ts
// REQ-005 — loads display context for any workflow-backed request type.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { WorkflowEntityType } from '../../workflow/domain/entities/workflow.entity';
import { resolveLeaveWorkflowType } from '../../workflow/domain/types/approval.types';
import {
  formatShortNoticeWarning,
  isShortNotice,
} from '../../leave/domain/services/leave-notice.util';
import { offDayUnitsForLeaveType } from '../../payroll/domain/services/off-day-ot-usage.service';
import { DEFAULT_LEAVE_RULES } from '../../settings/domain/leave-settings.types';

export interface ApprovalRequestDisplay {
  requestTypeLabel: string;
  requesterName: string;
  companyName: string;
  teamName: string | null;
  positionName: string | null;
  createdAt: string;
  keyDetails: string;
  workflowType: string | null;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  emergency: 'ลาฉุกเฉิน',
  unpaid: 'ลาไม่รับค่าจ้าง',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  leave: 'คำขอลา',
  leave_reschedule: 'คำขอเลื่อนวันลา',
  leave_shift_swap: 'คำขอสลับกะ',
  overtime: 'คำขอ OT',
  monthly_off: 'แจ้งวันหยุดประจำเดือน',
  advance: 'คำขอเบิกล่วงหน้า',
  attendance_correction: 'คำขอแก้ไขเวลา',
  deposit_refund: 'คำขอคืนเงินมัดจำ',
  payroll_adjustment: 'คำขอปรับเงินเดือน/การเงิน',
  commission_adjustment: 'คำขอปรับคอมมิชชั่น',
  performance_review: 'คำขอประเมินผลงาน',
  employee_exit: 'คำขอลาออก',
  bonus: 'คำขอโบนัส',
  document_request: 'คำขอเอกสาร',
};

@Injectable()
export class ApprovalRequestContextService {
  constructor(private readonly prisma: PrismaService) {}

  async loadForInstance(
    instanceId: string,
    entityType: WorkflowEntityType,
    entityId: string,
    companyId: string | null,
    workflowType?: string | null,
  ): Promise<ApprovalRequestDisplay> {
    const [company, instance] = await Promise.all([
      companyId
        ? this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { name: true } })
        : Promise.resolve(null),
      this.prisma.workflowInstance.findFirst({
        where: { id: instanceId, deletedAt: null },
        select: { createdAt: true, initiatedBy: true },
      }),
    ]);

    const createdAt = instance?.createdAt.toISOString().slice(0, 16).replace('T', ' ') ?? '—';
    const base = {
      companyName: company?.name ?? '—',
      createdAt,
      requestTypeLabel: ENTITY_TYPE_LABELS[entityType] ?? entityType,
      workflowType: workflowType ?? null,
    };

    switch (entityType) {
      case 'leave':
        return this.loadLeave(entityId, base);
      case 'overtime':
        return this.loadOvertime(entityId, base);
      case 'leave_reschedule':
        return this.loadReschedule(entityId, base);
      case 'leave_shift_swap':
        return this.loadShiftSwap(entityId, base);
      case 'advance':
        return this.loadAdvance(entityId, base);
      case 'attendance_correction':
        return this.loadCorrection(entityId, base);
      case 'monthly_off':
        return this.loadMonthlyOff(entityId, base);
      case 'document_request':
        return this.loadDocumentRequest(entityId, base);
      default:
        return this.loadGeneric(instance?.initiatedBy ?? null, base);
    }
  }

  async resolveWorkflowType(
    entityType: WorkflowEntityType,
    entityId: string,
  ): Promise<string | null> {
    switch (entityType) {
      case 'leave': {
        const row = await this.prisma.leaveRequest.findFirst({
          where: { id: entityId, deletedAt: null },
          include: { leaveType: { select: { code: true } } },
        });
        return row?.leaveType?.code ? resolveLeaveWorkflowType(row.leaveType.code) : 'leave_request';
      }
      case 'overtime':
        return 'ot_request';
      case 'leave_reschedule':
        return 'leave_reschedule';
      case 'leave_shift_swap':
        return 'leave_shift_swap';
      case 'advance':
        return 'advance_payment';
      case 'attendance_correction':
        return 'attendance_correction';
      case 'monthly_off':
        return 'monthly_off_request';
      case 'document_request':
        return 'document_request';
      default:
        return null;
    }
  }

  private async loadLeave(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { employee: true, leaveType: true },
    });
    if (!leave) return this.empty(base);
    const team = await this.teamName(leave.employeeId);
    const start = leave.startDate.toISOString().slice(0, 10);
    const end = leave.endDate.toISOString().slice(0, 10);
    const code = leave.leaveType.code.toLowerCase();
    const typeLabel = LEAVE_TYPE_LABELS[code] ?? leave.leaveType.name;
    const noticeDays = DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays;
    const submittedAt = leave.createdAt;
    const detailParts = [
      `ประเภท: ${typeLabel}`,
      `📅 ${start} → ${end} (${leave.days} วัน)`,
      leave.reason ? `💬 ${leave.reason}` : '',
    ];
    if (code === 'emergency') {
      detailParts.push('🚨 ลาฉุกเฉิน — นับเป็นวันหยุด 2 วันต่อโอที');
    }
    if (isShortNotice(submittedAt, start, noticeDays)) {
      const warn = formatShortNoticeWarning([start], noticeDays);
      if (warn) detailParts.push(warn);
    }
    const otUnits = Math.max(1, Number(leave.days)) * offDayUnitsForLeaveType(code);
    detailParts.push(`ผลต่อโอทีวันหยุด: นับ ${otUnits} วัน`);
    return {
      ...base,
      requestTypeLabel: typeLabel,
      requesterName: this.empName(leave.employee),
      teamName: team,
      positionName: leave.employee.position ?? null,
      keyDetails: detailParts.filter(Boolean).join('\n'),
    };
  }

  private async loadOvertime(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const ot = await this.prisma.overtimeRecord.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { employee: true },
    });
    if (!ot) return this.empty(base);
    const team = await this.teamName(ot.employeeId);
    const date = ot.workDate.toISOString().slice(0, 10);
    return {
      ...base,
      requesterName: this.empName(ot.employee),
      teamName: team,
      positionName: ot.employee.position ?? null,
      keyDetails: `📅 ${date}\n⏱ ${ot.otHours} ชม. · 💰 ฿${Number(ot.amount).toLocaleString('th-TH')}`,
    };
  }

  private async loadReschedule(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.leaveRescheduleRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { employee: true },
    });
    if (!row) return this.empty(base);
    const team = await this.teamName(row.employeeId);
    const origStart = row.originalStartDate.toISOString().slice(0, 10);
    const origEnd = row.originalEndDate.toISOString().slice(0, 10);
    const newStart = row.newStartDate.toISOString().slice(0, 10);
    const newEnd = row.newEndDate.toISOString().slice(0, 10);
    return {
      ...base,
      requesterName: this.empName(row.employee),
      teamName: team,
      positionName: row.employee.position ?? null,
      keyDetails:
        `เดิม: ${origStart} → ${origEnd}\nใหม่: ${newStart} → ${newEnd}\n💬 ${row.reason}`,
    };
  }

  private async loadShiftSwap(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.leaveShiftSwapRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: {
        requesterEmployee: true,
        partnerEmployee: true,
      },
    });
    if (!row) return this.empty(base);
    const team = await this.teamName(row.requesterEmployeeId);
    return {
      ...base,
      requesterName: this.empName(row.requesterEmployee),
      teamName: team,
      positionName: row.requesterEmployee.position ?? null,
      keyDetails:
        `แลกกับ: ${this.empName(row.partnerEmployee)}`,
    };
  }

  private async loadAdvance(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.advanceRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { employee: true },
    });
    if (!row) return this.empty(base);
    const team = await this.teamName(row.employeeId);
    return {
      ...base,
      requesterName: this.empName(row.employee),
      teamName: team,
      positionName: row.employee.position ?? null,
      keyDetails: `💰 ฿${Number(row.amount).toLocaleString('th-TH')}${row.reason ? `\n💬 ${row.reason}` : ''}`,
    };
  }

  private async loadCorrection(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.attendanceCorrection.findFirst({
      where: { id: entityId, deletedAt: null },
      include: {
        attendanceRecord: { include: { employee: true } },
      },
    });
    if (!row?.attendanceRecord) return this.empty(base);
    const emp = row.attendanceRecord.employee;
    const team = await this.teamName(emp.id);
    const date = row.attendanceRecord.workDate.toISOString().slice(0, 10);
    return {
      ...base,
      requesterName: this.empName(emp),
      teamName: team,
      positionName: emp.position ?? null,
      keyDetails: `📅 ${date}\nแก้ไข: ${row.field}\n💬 ${row.reason ?? '—'}`,
    };
  }

  private async loadMonthlyOff(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.monthlyOffRequest.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { employee: true },
    });
    if (!row) return this.empty(base);
    const team = await this.teamName(row.employeeId);
    const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
    const preview = dates.slice(0, 5).join(', ');
    const suffix = dates.length > 5 ? ` (+${dates.length - 5} วัน)` : '';
    return {
      ...base,
      requesterName: this.empName(row.employee),
      teamName: team,
      positionName: row.employee.position ?? null,
      keyDetails: `📅 ${preview}${suffix} (${dates.length} วัน)`,
    };
  }

  private async loadDocumentRequest(
    entityId: string,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    const row = await this.prisma.documentRequest.findFirst({
      where: { id: entityId },
      include: { employee: true, type: true },
    });
    if (!row) return this.empty(base);
    const team = await this.teamName(row.employeeId);
    return {
      ...base,
      requesterName: this.empName(row.employee),
      teamName: team,
      positionName: row.employee.position ?? null,
      keyDetails: `📄 ${row.type.nameTh}`,
    };
  }

  private async loadGeneric(
    initiatedBy: string | null,
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): Promise<ApprovalRequestDisplay> {
    if (!initiatedBy) return this.empty(base);
    const user = await this.prisma.user.findFirst({
      where: { id: initiatedBy, deletedAt: null },
      include: { employee: true },
    });
    const team = user?.employeeId ? await this.teamName(user.employeeId) : null;
    return {
      ...base,
      requesterName: user?.employee ? this.empName(user.employee) : user?.username ?? '—',
      teamName: team,
      positionName: user?.employee?.position ?? null,
      keyDetails: '—',
    };
  }

  private empty(
    base: Omit<ApprovalRequestDisplay, 'requesterName' | 'teamName' | 'positionName' | 'keyDetails'>,
  ): ApprovalRequestDisplay {
    return { ...base, requesterName: '—', teamName: null, positionName: null, keyDetails: '—' };
  }

  private empName(emp: { firstName: string; lastName: string; nickname?: string | null }): string {
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const nickname = emp.nickname?.trim();
    return nickname ? `${fullName} (${nickname})` : fullName;
  }

  private async teamName(employeeId: string): Promise<string | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, teamId: { not: null }, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryTeam: 'desc' }],
      include: { team: { select: { name: true } } },
    });
    return assignment?.team?.name ?? null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { escapeHtml };
