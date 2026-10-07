import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { AccessControlService } from '../../permission/application/access-control.service';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import { EmployeeAccessService } from './employee-access.service';
import { EmployeeProfileAccessService } from './employee-profile-access.service';
import { EmployeeBusinessRoleService } from './employee-business-role.service';
import { EmploymentCompanyAssignmentDto, UpdateEmployeeEmploymentDto } from './dto/employee-employment.dto';
import { ShiftAssignmentService } from '../../attendance/application/shift-assignment.service';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../domain/repositories/employee.repository';
import { EmployeeAssignment } from '../domain/entities/employee-assignment.entity';
import { allTeamIdsFor } from '../domain/services/company-teams.util';
import { EmployeeService } from './employee.service';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';
import { resolveAdminCommissionOfficeType } from '../../payroll/domain/services/shared-payroll.policy';

/** Several rows can share a company (one per team); the primary team's row comes first. */
const PRIMARY_TEAM_FIRST: Prisma.EmployeeAssignmentOrderByWithRelationInput[] = [
  { isPrimaryTeam: 'desc' },
  { isPrimaryCompany: 'desc' },
  { effectiveFrom: 'asc' },
];

type EmployeeRef = {
  id: string;
  globalId: string;
  name: string;
} | null;

@Injectable()
export class EmployeeEmploymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly access: EmployeeProfileAccessService,
    private readonly accessControl: AccessControlService,
    private readonly businessRole: EmployeeBusinessRoleService,
    private readonly hierarchy: HierarchyResolverService,
    private readonly shiftAssignments: ShiftAssignmentService,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(forwardRef(() => EmployeeService))
    private readonly employeeService: EmployeeService,
    @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll: SharedPayrollService,
  ) {}

  async getEmployment(actor: ActorContext, employeeId: string, companyId?: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);

    const resolvedCompanyId = companyId ?? await this.resolvePrimaryCompanyId(employeeId);
    if (resolvedCompanyId) {
      await this.employeeAccess.assertEmployeeInCompany(employeeId, resolvedCompanyId);
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        assignments: {
          where: { effectiveTo: null, deletedAt: null },
          orderBy: [{ isPrimaryCompany: 'desc' }, { isPrimaryTeam: 'desc' }, { effectiveFrom: 'asc' }],
          include: {
            company: { select: { id: true, name: true, code: true } },
            team: {
              select: {
                id: true,
                name: true,
                bigLeaderEmployeeId: true,
                bigLeader: {
                  select: { id: true, globalId: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const activeAssignments = employee.assignments;
    const primaryAssignment = this.pickAssignment(activeAssignments, resolvedCompanyId);
    const companyAssignments = activeAssignments.map((row) => ({
      companyId: row.companyId,
      companyName: row.company.name,
      companyCode: row.company.code,
      teamId: row.teamId,
      teamName: row.team?.name ?? null,
      isPrimary: row.isPrimaryCompany,
      isPrimaryTeam: row.isPrimaryTeam,
    }));
    const effectiveAccess = await this.accessControl
      .getEmployeeAccessContext(employeeId)
      .catch(() => null);

    const supervisor = await this.hierarchy.getDirectManager(employeeId);
    const bigLeaderFromTeam = primaryAssignment?.team?.bigLeader
      ? this.toRef(primaryAssignment.team.bigLeader)
      : null;
    const bigLeaderFromHierarchy = await this.hierarchy.getBigLeader(employeeId, resolvedCompanyId ?? undefined);
    const bigLeader = bigLeaderFromTeam ?? (bigLeaderFromHierarchy
      ? {
        id: bigLeaderFromHierarchy.employeeId,
        globalId: bigLeaderFromHierarchy.globalId,
        name: `${bigLeaderFromHierarchy.firstName} ${bigLeaderFromHierarchy.lastName}`.trim(),
      }
      : null);

    const subLeader = primaryAssignment?.teamId
      ? await this.resolveSubLeader(primaryAssignment.teamId, employeeId)
      : null;

    const commissionShiftProfile = resolvedCompanyId
      ? await this.prisma.adminCommissionEmployeeProfile.findFirst({
        where: { employeeId, companyId: resolvedCompanyId, deletedAt: null },
        select: { defaultShift: true, officeType: true },
      })
      : null;
    const officeType = commissionShiftProfile?.officeType
      ?? resolveAdminCommissionOfficeType({
        department: employee.department,
        position: employee.position,
        businessRole: effectiveAccess?.businessRole ?? null,
      });

    const employeeShiftProfile = resolvedCompanyId
      ? await this.shiftAssignments.getShiftProfile(employeeId, resolvedCompanyId)
      : { current: null, nextScheduled: null, history: [] };

    const confirmedDate = await this.resolveConfirmedDate(employeeId, employee.employmentStatus);
    const targetRole = (effectiveAccess?.businessRole ?? null) as BusinessRoleCode | null;
    const roleEditor = await this.businessRole.resolveEditorPermissions(actor, employeeId, targetRole);

    return {
      employment: {
        employeeCode: employee.globalId,
        companyId: primaryAssignment?.companyId ?? null,
        companyName: primaryAssignment?.company?.name ?? null,
        department: employee.department,
        teamId: primaryAssignment?.teamId ?? null,
        teamName: primaryAssignment?.team?.name ?? null,
        businessRole: effectiveAccess?.businessRole ?? null,
        position: employee.position,
        employmentType: employee.employmentType,
        employmentStatus: employee.employmentStatus,
        joinDate: employee.hireDate.toISOString().slice(0, 10),
        probationEndDate: employee.probationEndDate?.toISOString().slice(0, 10) ?? null,
        confirmedDate,
        resignDate: employee.terminationDate?.toISOString().slice(0, 10) ?? null,
        shift: commissionShiftProfile?.defaultShift ?? 'day',
        officeType,
        workLocation: employee.workCategory,
      },
      companyAssignments,
      shiftProfile: employeeShiftProfile,
      supervisor: supervisor
        ? {
          id: supervisor.employeeId,
          globalId: supervisor.globalId,
          name: `${supervisor.firstName} ${supervisor.lastName}`.trim(),
        }
        : null,
      bigLeader,
      subLeader,
      roleEditor,
    };
  }

  async updateEmployment(
    actor: ActorContext,
    employeeId: string,
    dto: UpdateEmployeeEmploymentDto,
    companyId?: string,
  ) {
    const resolvedCompanyId = companyId ?? dto.companyId ?? await this.resolvePrimaryCompanyId(employeeId);
    if (!resolvedCompanyId) throw new Error('Company context required');
    await this.access.assertOwnerOrSecretary(actor, employeeId);

    const beforeEmployee = await this.prisma.employee.findFirstOrThrow({ where: { id: employeeId } });
    const beforeAssignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId: resolvedCompanyId, effectiveTo: null, deletedAt: null },
      orderBy: PRIMARY_TEAM_FIRST,
    });
    const beforeSupervisor = await this.prisma.employeeHierarchy.findFirst({
      where: { employeeId, relationshipType: 'direct_manager', effectiveTo: null, deletedAt: null },
    });
    const beforeShift = await this.prisma.adminCommissionEmployeeProfile.findFirst({
      where: { employeeId, companyId: resolvedCompanyId, deletedAt: null },
      select: { defaultShift: true, officeType: true },
    });

    if (dto.probationEndDate && dto.joinDate) {
      if (new Date(dto.probationEndDate) < new Date(dto.joinDate)) {
        throw new Error('Probation end date must be on or after join date');
      }
    }
    if (dto.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: dto.teamId, companyId: resolvedCompanyId, deletedAt: null },
      });
      if (!team) throw new Error('Team does not belong to company');
    }
    if (dto.companyAssignments?.length) {
      for (const row of dto.companyAssignments) {
        if (row.teamId) {
          const team = await this.prisma.team.findFirst({
            where: { id: row.teamId, companyId: row.companyId, deletedAt: null },
          });
          if (!team) throw new Error('Team does not belong to company');
        }
      }
    }

    const primaryCompanyId = resolvedCompanyId;
    const primaryOrg = dto.companyAssignments?.find((row) => row.companyId === primaryCompanyId);
    const update: Prisma.EmployeeUpdateInput = { updatedBy: actor.userId };
    if (dto.department !== undefined) update.department = dto.department;
    else if (primaryOrg?.department !== undefined) update.department = primaryOrg.department;
    if (dto.position !== undefined) update.position = dto.position;
    if (dto.employmentType !== undefined) update.employmentType = dto.employmentType;
    if (dto.employmentStatus !== undefined) update.employmentStatus = dto.employmentStatus;
    if (dto.joinDate !== undefined) update.hireDate = new Date(dto.joinDate);
    if (dto.probationEndDate !== undefined) {
      update.probationEndDate = dto.probationEndDate ? new Date(dto.probationEndDate) : null;
    }
    if (dto.resignDate !== undefined) {
      update.terminationDate = dto.resignDate ? new Date(dto.resignDate) : null;
    }
    if (dto.workLocation !== undefined) update.workCategory = dto.workLocation;

    const afterEmployee = await this.prisma.employee.update({ where: { id: employeeId }, data: update });

    let afterAssignment = beforeAssignment;
    if (dto.companyAssignments?.length) {
      await this.syncCompanyAssignments(
        actor,
        employeeId,
        primaryCompanyId,
        dto.companyAssignments,
        dto.joinDate ?? beforeEmployee.hireDate.toISOString().slice(0, 10),
      );
      afterAssignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, companyId: primaryCompanyId, effectiveTo: null, deletedAt: null },
        orderBy: PRIMARY_TEAM_FIRST,
      });
    } else if (dto.companyId || dto.teamId !== undefined) {
      const targetCompany = dto.companyId ?? resolvedCompanyId;
      const current = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, companyId: targetCompany, effectiveTo: null, deletedAt: null },
        orderBy: PRIMARY_TEAM_FIRST,
      });
      if (current) {
        afterAssignment = await this.prisma.employeeAssignment.update({
          where: { id: current.id },
          data: {
            ...(dto.teamId !== undefined ? { teamId: dto.teamId || null } : {}),
            ...(dto.companyId ? { companyId: dto.companyId } : {}),
            updatedBy: actor.userId,
          },
        });
      } else if (dto.companyId) {
        afterAssignment = await this.prisma.employeeAssignment.create({
          data: {
            employeeId,
            companyId: dto.companyId,
            teamId: dto.teamId ?? null,
            effectiveFrom: new Date(),
            isPrimaryCompany: true,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }

    let afterSupervisor = beforeSupervisor;
    if (dto.supervisorId !== undefined) {
      if (dto.supervisorId) {
        if (beforeSupervisor) {
          afterSupervisor = await this.prisma.employeeHierarchy.update({
            where: { id: beforeSupervisor.id },
            data: { managerEmployeeId: dto.supervisorId, updatedBy: actor.userId },
          });
        } else {
          afterSupervisor = await this.prisma.employeeHierarchy.create({
            data: {
              employeeId,
              managerEmployeeId: dto.supervisorId,
              effectiveFrom: new Date(),
              createdBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        }
      } else if (beforeSupervisor) {
        afterSupervisor = await this.prisma.employeeHierarchy.update({
          where: { id: beforeSupervisor.id },
          data: { effectiveTo: new Date(), updatedBy: actor.userId },
        });
      }
    }

    let afterShift = beforeShift?.defaultShift ?? null;
    if (dto.officeType !== undefined) {
      await this.syncAdminCommissionOfficeType(actor, employeeId, dto.officeType, resolvedCompanyId);
    } else if (dto.department !== undefined || dto.position !== undefined) {
      const inferred = resolveAdminCommissionOfficeType({
        department: afterEmployee.department,
        position: afterEmployee.position,
        businessRole: null,
      });
      if (!beforeShift?.officeType) {
        await this.syncAdminCommissionOfficeType(actor, employeeId, inferred, resolvedCompanyId);
      }
    }
    if (dto.shift !== undefined) {
      const officeForProfile = dto.officeType
        ?? beforeShift?.officeType
        ?? resolveAdminCommissionOfficeType({
          department: afterEmployee.department,
          position: afterEmployee.position,
          businessRole: null,
        });
      const profile = await this.prisma.adminCommissionEmployeeProfile.upsert({
        where: {
          companyId_employeeId: { companyId: resolvedCompanyId, employeeId },
        },
        create: {
          companyId: resolvedCompanyId,
          employeeId,
          officeType: officeForProfile,
          defaultShift: dto.shift,
          isActive: true,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        update: {
          defaultShift: dto.shift,
          officeType: officeForProfile,
          isActive: true,
          updatedBy: actor.userId,
        },
      });
      afterShift = profile.defaultShift;
      const effectiveFrom = dto.joinDate ?? beforeEmployee.hireDate.toISOString().slice(0, 10);
      await this.shiftAssignments.syncEmployeeProfileShift(
        actor,
        employeeId,
        resolvedCompanyId,
        dto.shift,
        effectiveFrom,
      );
    }

    await this.recordEmploymentChanges(
      actor,
      employeeId,
      resolvedCompanyId,
      {
        employee: beforeEmployee,
        assignment: beforeAssignment,
        supervisorId: beforeSupervisor?.managerEmployeeId ?? null,
        shift: beforeShift?.defaultShift ?? null,
      },
      {
        employee: afterEmployee,
        assignment: afterAssignment,
        supervisorId: afterSupervisor?.managerEmployeeId ?? null,
        shift: afterShift,
      },
      dto.reason,
    );

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_employment_updated',
      before: this.employmentSnapshot(beforeEmployee, beforeAssignment, beforeSupervisor?.managerEmployeeId ?? null, beforeShift?.defaultShift ?? null),
      after: this.employmentSnapshot(afterEmployee, afterAssignment, afterSupervisor?.managerEmployeeId ?? null, afterShift),
    });

    if (dto.companyAssignments?.length) {
      const payrollMode = await this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: { payrollAllocationMode: true },
      });
      if (payrollMode?.payrollAllocationMode === 'shared_across_companies') {
        await this.sharedPayroll.syncEmployeeOpenCyclesAllCompanies(actor, employeeId).catch(() => undefined);
      }
    }

    return this.getEmployment(actor, employeeId, resolvedCompanyId);
  }

  private async syncAdminCommissionOfficeType(
    actor: ActorContext,
    employeeId: string,
    officeType: 'front_office' | 'back_office',
    fallbackCompanyId?: string,
  ): Promise<void> {
    const companyIds = await this.listAdminProfileCompanyIds(employeeId, fallbackCompanyId);
    for (const companyId of companyIds) {
      const existing = await this.prisma.adminCommissionEmployeeProfile.findFirst({
        where: { employeeId, companyId, deletedAt: null },
        select: { defaultShift: true },
      });
      await this.prisma.adminCommissionEmployeeProfile.upsert({
        where: {
          companyId_employeeId: { companyId, employeeId },
        },
        create: {
          companyId,
          employeeId,
          officeType,
          defaultShift: existing?.defaultShift ?? 'day',
          isActive: true,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        update: {
          officeType,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          updatedBy: actor.userId,
        },
      });
    }
  }

  private async listAdminProfileCompanyIds(
    employeeId: string,
    fallbackCompanyId?: string,
  ): Promise<string[]> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { payrollAllocationMode: true },
    });
    if (employee?.payrollAllocationMode === 'shared_across_companies') {
      const companies = await this.prisma.company.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
        orderBy: { code: 'asc' },
      });
      return companies.map((row) => row.id);
    }
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    const ids = [...new Set(assignments.map((row) => row.companyId))];
    if (ids.length === 0 && fallbackCompanyId) return [fallbackCompanyId];
    return ids;
  }

  private async syncCompanyAssignments(
    actor: ActorContext,
    employeeId: string,
    primaryCompanyId: string,
    rows: EmploymentCompanyAssignmentDto[],
    joinDateIso: string,
  ): Promise<void> {
    const desiredByCompany = new Map(rows.map((row) => [row.companyId, row]));
    const current = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryTeam: 'desc' }, { effectiveFrom: 'asc' }],
    });
    const closeAt = new Date();
    const closeRow = async (assignment: (typeof current)[number]) => {
      const entity = EmployeeAssignment.rehydrate({
        id: assignment.id,
        employeeId: assignment.employeeId,
        companyId: assignment.companyId,
        teamId: assignment.teamId,
        functionId: assignment.functionId,
        roleLevel: assignment.roleLevel,
        isPrimaryCompany: assignment.isPrimaryCompany,
        isPrimaryTeam: assignment.isPrimaryTeam,
        effectiveFrom: assignment.effectiveFrom,
        effectiveTo: assignment.effectiveTo,
        deletedAt: assignment.deletedAt,
      });
      entity.close(closeAt);
      await this.assignments.save(entity, actor.userId);
    };

    for (const assignment of current) {
      if (!desiredByCompany.has(assignment.companyId)) await closeRow(assignment);
    }

    // Desired team list per company, primary team first. `null` = in the company without a team.
    const desiredTeamsByCompany = new Map<string, Array<string | null>>();
    for (const row of rows) {
      const inCompany = current.filter((a) => a.companyId === row.companyId);
      const primaryTeamId = row.teamId !== undefined ? (row.teamId || null) : (inCompany[0]?.teamId ?? null);
      const extraTeamIds = row.extraTeamIds !== undefined
        ? row.extraTeamIds
        : inCompany.slice(1).map((a) => a.teamId).filter((id): id is string => Boolean(id));
      const teams = allTeamIdsFor({ teamId: primaryTeamId, extraTeamIds });
      desiredTeamsByCompany.set(row.companyId, teams.length ? teams : [null]);
    }

    // Keep rows whose team is still wanted; reuse the rest for newly picked teams (keeps history
    // and role level when a team is swapped), close what is left over, create what is missing.
    for (const [companyId, teams] of desiredTeamsByCompany) {
      const inCompany = current.filter((a) => a.companyId === companyId);
      const unmatchedRows = inCompany.filter((a) => !teams.includes(a.teamId));
      const missingTeams = teams.filter((teamId) => !inCompany.some((a) => a.teamId === teamId));
      for (const teamId of missingTeams) {
        const reusable = unmatchedRows.shift();
        if (reusable) {
          await this.prisma.employeeAssignment.update({
            where: { id: reusable.id },
            data: { teamId, updatedBy: actor.userId },
          });
          continue;
        }
        await this.employeeService.assign(actor, employeeId, {
          companyId,
          effectiveFrom: joinDateIso,
          teamId: teamId ?? undefined,
        });
      }
      for (const leftover of unmatchedRows) await closeRow(leftover);
      if (inCompany.length === 0) {
        await this.shiftAssignments.ensureDefaultDayShiftIfUnassigned(
          actor,
          employeeId,
          companyId,
          joinDateIso,
        ).catch(() => undefined);
      }
    }

    // Primary flags: the primary team's row in each company is isPrimaryTeam, and that row in the
    // primary company is isPrimaryCompany. Clear before setting so the partial unique indexes hold.
    const open = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, effectiveTo: null, deletedAt: null },
    });
    const effectivePrimaryCompanyId = desiredByCompany.has(primaryCompanyId)
      ? primaryCompanyId
      : (open.find((a) => a.isPrimaryCompany)?.companyId ?? open[0]?.companyId);
    const desiredFlags = new Map(open.map((a) => {
      const primaryTeamId = desiredTeamsByCompany.get(a.companyId)?.[0];
      const isCompanyPrimaryRow = primaryTeamId !== undefined
        ? a.teamId === primaryTeamId
        : a.isPrimaryTeam || a.isPrimaryCompany;
      return [a.id, {
        isPrimaryTeam: isCompanyPrimaryRow && Boolean(a.teamId),
        isPrimaryCompany: isCompanyPrimaryRow && a.companyId === effectivePrimaryCompanyId,
      }];
    }));
    for (const a of open) {
      const want = desiredFlags.get(a.id)!;
      const clearTeam = a.isPrimaryTeam && !want.isPrimaryTeam;
      const clearCompany = a.isPrimaryCompany && !want.isPrimaryCompany;
      if (!clearTeam && !clearCompany) continue;
      await this.prisma.employeeAssignment.update({
        where: { id: a.id },
        data: {
          ...(clearTeam ? { isPrimaryTeam: false } : {}),
          ...(clearCompany ? { isPrimaryCompany: false } : {}),
          updatedBy: actor.userId,
        },
      });
    }
    for (const a of open) {
      const want = desiredFlags.get(a.id)!;
      const setTeam = !a.isPrimaryTeam && want.isPrimaryTeam;
      const setCompany = !a.isPrimaryCompany && want.isPrimaryCompany;
      if (!setTeam && !setCompany) continue;
      await this.prisma.employeeAssignment.update({
        where: { id: a.id },
        data: {
          ...(setTeam ? { isPrimaryTeam: true } : {}),
          ...(setCompany ? { isPrimaryCompany: true } : {}),
          updatedBy: actor.userId,
        },
      });
    }
  }

  private pickAssignment(
    assignments: Array<{
      companyId: string;
      isPrimaryCompany: boolean;
      isPrimaryTeam: boolean;
      teamId: string | null;
      company: { id: string; name: string; code: string };
      team: {
        id: string;
        name: string;
        bigLeaderEmployeeId: string | null;
        bigLeader: { id: string; globalId: string; firstName: string; lastName: string } | null;
      } | null;
    }>,
    companyId?: string | null,
  ) {
    if (companyId) {
      return assignments.find((a) => a.companyId === companyId && a.isPrimaryTeam)
        ?? assignments.find((a) => a.companyId === companyId)
        ?? null;
    }
    return assignments.find((a) => a.isPrimaryCompany) ?? assignments[0] ?? null;
  }

  private async resolvePrimaryCompanyId(employeeId: string): Promise<string | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryCompany: 'desc' }, { effectiveFrom: 'desc' }],
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }

  private async resolveSubLeader(teamId: string, employeeId: string): Promise<EmployeeRef> {
    const row = await this.prisma.employeeAssignment.findFirst({
      where: {
        teamId,
        roleLevel: 'sub_leader',
        effectiveTo: null,
        deletedAt: null,
        employeeId: { not: employeeId },
      },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? this.toRef(row.employee) : null;
  }

  private async resolveConfirmedDate(employeeId: string, status: string): Promise<string | null> {
    if (status !== 'active') return null;
    const row = await this.prisma.employeeChangeHistory.findFirst({
      where: {
        employeeId,
        changeType: 'employment',
        fieldName: 'employmentStatus',
        afterValueJson: { equals: 'active' },
      },
      orderBy: { changedAt: 'asc' },
    });
    return row?.changedAt.toISOString().slice(0, 10) ?? null;
  }

  private toRef(employee: { id: string; globalId: string; firstName: string; lastName: string }): EmployeeRef {
    return {
      id: employee.id,
      globalId: employee.globalId,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
    };
  }

  private employmentSnapshot(
    employee: {
      department: string | null;
      position: string | null;
      employmentType: string | null;
      employmentStatus: string;
      hireDate: Date;
      probationEndDate: Date | null;
      terminationDate: Date | null;
      workCategory: string;
    },
    assignment: { companyId: string; teamId: string | null } | null,
    supervisorId: string | null,
    shift: string | null,
  ) {
    return {
      department: employee.department,
      position: employee.position,
      employmentType: employee.employmentType,
      employmentStatus: employee.employmentStatus,
      joinDate: employee.hireDate.toISOString().slice(0, 10),
      probationEndDate: employee.probationEndDate?.toISOString().slice(0, 10) ?? null,
      resignDate: employee.terminationDate?.toISOString().slice(0, 10) ?? null,
      workLocation: employee.workCategory,
      companyId: assignment?.companyId ?? null,
      teamId: assignment?.teamId ?? null,
      supervisorId,
      shift,
    };
  }

  private async recordEmploymentChanges(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    before: {
      employee: Record<string, unknown>;
      assignment: { companyId: string; teamId: string | null } | null;
      supervisorId: string | null;
      shift: string | null;
    },
    after: {
      employee: Record<string, unknown>;
      assignment: { companyId: string; teamId: string | null } | null;
      supervisorId: string | null;
      shift: string | null;
    },
    reason?: string,
  ) {
    const employeeFields = [
      'department', 'position', 'employmentType', 'employmentStatus',
      'hireDate', 'probationEndDate', 'terminationDate', 'workCategory',
    ] as const;

    for (const field of employeeFields) {
      const b = before.employee[field];
      const a = after.employee[field];
      const bNorm = b instanceof Date ? b.toISOString().slice(0, 10) : b;
      const aNorm = a instanceof Date ? a.toISOString().slice(0, 10) : a;
      const fieldName = field === 'hireDate' ? 'joinDate'
        : field === 'terminationDate' ? 'resignDate'
          : field === 'workCategory' ? 'workLocation'
            : field;
      if (JSON.stringify(bNorm) === JSON.stringify(aNorm)) continue;
      await this.recordFieldChange(actor, employeeId, companyId, fieldName, bNorm, aNorm, reason);
    }

    const bCompany = before.assignment?.companyId ?? null;
    const aCompany = after.assignment?.companyId ?? null;
    if (bCompany !== aCompany) {
      await this.recordFieldChange(actor, employeeId, companyId, 'companyId', bCompany, aCompany, reason);
    }

    const bTeam = before.assignment?.teamId ?? null;
    const aTeam = after.assignment?.teamId ?? null;
    if (bTeam !== aTeam) {
      await this.recordFieldChange(actor, employeeId, companyId, 'teamId', bTeam, aTeam, reason);
    }

    if (before.supervisorId !== after.supervisorId) {
      await this.recordFieldChange(
        actor, employeeId, companyId, 'supervisorId', before.supervisorId, after.supervisorId, reason,
      );
    }

    if (before.shift !== after.shift) {
      await this.recordFieldChange(actor, employeeId, companyId, 'shift', before.shift, after.shift, reason);
    }
  }

  private async recordFieldChange(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    fieldName: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    await this.prisma.employeeChangeHistory.create({
      data: {
        employeeId,
        companyId,
        changeType: 'employment' satisfies EmployeeChangeType,
        fieldName,
        beforeValueJson: before == null ? undefined : (before as Prisma.InputJsonValue),
        afterValueJson: after == null ? undefined : (after as Prisma.InputJsonValue),
        reason,
        changedBy: actor.userId,
        source: 'web',
      },
    });
  }
}
