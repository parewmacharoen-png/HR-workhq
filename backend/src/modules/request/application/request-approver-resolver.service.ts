import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { RequestApproverType } from '@prisma/client';

export interface ResolvedApprover {
  employeeId: string;
  userId: string | null;
  name: string;
}

@Injectable()
export class RequestApproverResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyResolverService,
  ) {}

  async resolve(
    approverType: RequestApproverType,
    requesterEmployeeId: string,
    companyId: string,
    values: Record<string, unknown>,
    opts?: { approverRole?: string | null; approverEmployeeId?: string | null; approverFieldKey?: string | null },
  ): Promise<ResolvedApprover[]> {
    switch (approverType) {
      case 'requester_big_leader': {
        const leader = await this.hierarchy.getBigLeader(requesterEmployeeId, companyId);
        if (leader) {
          return [await this.toResolved(leader.employeeId, `${leader.firstName} ${leader.lastName}`)];
        }
        return this.usersForBusinessRole('owner', companyId);
      }
      case 'requester_sub_leader': {
        const teamId = await this.primaryTeamId(requesterEmployeeId, companyId);
        if (!teamId) return this.usersForBusinessRole('owner', companyId);
        const subs = await this.prisma.employeeAssignment.findMany({
          where: { teamId, roleLevel: 'sub_leader', effectiveTo: null, deletedAt: null },
          include: { employee: true },
        });
        if (!subs.length) return this.usersForBusinessRole('owner', companyId);
        return Promise.all(subs.map((s) => this.toResolved(
          s.employeeId,
          `${s.employee.firstName} ${s.employee.lastName}`,
        )));
      }
      case 'requester_direct_manager': {
        const mgr = await this.hierarchy.getDirectManager(requesterEmployeeId);
        if (mgr) return [await this.toResolved(mgr.employeeId, `${mgr.firstName} ${mgr.lastName}`)];
        return this.usersForBusinessRole('owner', companyId);
      }
      case 'specific_employee': {
        if (!opts?.approverEmployeeId) return [];
        const emp = await this.prisma.employee.findUnique({ where: { id: opts.approverEmployeeId } });
        if (!emp) return [];
        return [await this.toResolved(emp.id, `${emp.firstName} ${emp.lastName}`)];
      }
      case 'employee_field': {
        const key = opts?.approverFieldKey;
        const empId = key ? String(values[key] ?? '') : '';
        if (!empId) return [];
        const emp = await this.prisma.employee.findUnique({ where: { id: empId } });
        if (!emp) return [];
        return [await this.toResolved(emp.id, `${emp.firstName} ${emp.lastName}`)];
      }
      case 'owner':
        return this.usersForBusinessRole('owner', companyId);
      case 'secretary': {
        const secretaries = await this.usersForBusinessRole('secretary', companyId);
        if (secretaries.length) return secretaries;
        return this.usersForBusinessRole('owner', companyId);
      }
      case 'role':
        return opts?.approverRole
          ? this.usersForBusinessRole(opts.approverRole as 'owner' | 'secretary' | 'big_leader', companyId)
          : [];
      default:
        return [];
    }
  }

  private async primaryTeamId(employeeId: string, companyId: string): Promise<string | null> {
    const a = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId, effectiveTo: null, deletedAt: null, isPrimaryTeam: true },
    });
    return a?.teamId ?? null;
  }

  private async usersForBusinessRole(
    role: 'owner' | 'secretary' | 'big_leader',
    _companyId: string,
  ): Promise<ResolvedApprover[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: {
        role,
        isActive: true,
        deletedAt: null,
      },
      include: { user: { include: { employee: true } } },
    });
    const out: ResolvedApprover[] = [];
    for (const a of assignments) {
      const emp = a.user.employee;
      if (!emp) continue;
      out.push(await this.toResolved(emp.id, `${emp.firstName} ${emp.lastName}`, a.userId));
    }
    return out;
  }

  private async toResolved(
    employeeId: string,
    name: string,
    userId?: string | null,
  ): Promise<ResolvedApprover> {
    if (userId) return { employeeId, userId, name: name.trim() };
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
    });
    return { employeeId, userId: user?.id ?? null, name: name.trim() };
  }
}
