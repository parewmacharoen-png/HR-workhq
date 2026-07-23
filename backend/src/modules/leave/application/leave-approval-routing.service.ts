// ============================================================================
// Leave approval routing — department × role × leave type policy.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { RequestApproverType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { isMarketingDepartment } from '../../organization/application/marketing-teams.bootstrap';

export type LeaveFormType = 'sick' | 'personal' | 'emergency' | 'unpaid';
export type DepartmentRoute = 'marketing' | 'admin';
export type RequesterRoleBand = 'staff' | 'big_leader';

export interface LeaveApprovalRoute {
  approverType: RequestApproverType;
  stepLabel: string;
  /** Notify every teammate (same primary team) via Telegram. */
  notifyTeam: boolean;
  /** Extra FYI to big leader when approver is owner (emergency). */
  notifyBigLeaderAwareness: boolean;
  /** Stage pending leave/monthly-off for team calendar while awaiting approval. */
  stageForCalendar: boolean;
}

export interface LeaveRequesterContext {
  employeeId: string;
  companyId: string;
  department: string | null;
  roleLevel: string;
  departmentRoute: DepartmentRoute;
  roleBand: RequesterRoleBand;
}

@Injectable()
export class LeaveApprovalRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async loadRequesterContext(employeeId: string, companyId: string): Promise<LeaveRequesterContext> {
    const [employee, assignment] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: { department: true },
      }),
      this.prisma.employeeAssignment.findFirst({
        where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
        orderBy: [{ isPrimaryTeam: 'desc' }, { isPrimaryCompany: 'desc' }],
        select: { roleLevel: true },
      }),
    ]);
    const department = employee?.department ?? null;
    const roleLevel = assignment?.roleLevel ?? 'employee';
    return {
      employeeId,
      companyId,
      department,
      roleLevel,
      departmentRoute: isMarketingDepartment(department) ? 'marketing' : 'admin',
      roleBand: roleLevel === 'big_leader' ? 'big_leader' : 'staff',
    };
  }

  resolveRoute(leaveType: string, ctx: LeaveRequesterContext): LeaveApprovalRoute {
    const type = leaveType as LeaveFormType;

    if (type === 'sick') {
      return {
        approverType: 'owner',
        stepLabel: 'เจ้าของ (ลาป่วย)',
        notifyTeam: true,
        notifyBigLeaderAwareness: false,
        stageForCalendar: true,
      };
    }

    if (type === 'emergency') {
      if (ctx.departmentRoute === 'marketing') {
        return {
          approverType: 'owner',
          stepLabel: ctx.roleBand === 'big_leader' ? 'เจ้าของ (ลาฉุกเฉิน)' : 'เจ้าของ (ลาฉุกเฉิน)',
          notifyTeam: true,
          notifyBigLeaderAwareness: ctx.roleBand === 'staff',
          stageForCalendar: true,
        };
      }
      return {
        approverType: 'owner',
        stepLabel: 'เจ้าของ (ลาฉุกเฉิน)',
        notifyTeam: true,
        notifyBigLeaderAwareness: true,
        stageForCalendar: true,
      };
    }

    if (type === 'personal' || type === 'unpaid') {
      if (ctx.departmentRoute === 'marketing') {
        if (ctx.roleBand === 'big_leader') {
          return {
            approverType: 'owner',
            stepLabel: 'เจ้าของ',
            notifyTeam: true,
            notifyBigLeaderAwareness: false,
            stageForCalendar: true,
          };
        }
        return {
          approverType: 'requester_big_leader',
          stepLabel: 'หัวหน้าทีมใหญ่',
          notifyTeam: true,
          notifyBigLeaderAwareness: false,
          stageForCalendar: true,
        };
      }
      // Admin department — employee & big leader → secretary
      return {
        approverType: 'secretary',
        stepLabel: 'เลขา',
        notifyTeam: true,
        notifyBigLeaderAwareness: false,
        stageForCalendar: true,
      };
    }

    return {
      approverType: 'owner',
      stepLabel: 'เจ้าของ',
      notifyTeam: true,
      notifyBigLeaderAwareness: false,
      stageForCalendar: true,
    };
  }

  leaveTypeLabelTh(leaveType: string): string {
    const labels: Record<string, string> = {
      sick: 'ลาป่วย',
      personal: 'ลากิจ',
      emergency: 'ลาฉุกเฉิน',
      unpaid: 'ลาไม่รับค่าจ้าง',
    };
    return labels[leaveType] ?? leaveType;
  }
}
