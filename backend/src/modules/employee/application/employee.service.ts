// ============================================================================
// modules/employee/application/employee.service.ts
// Orchestrates employee lifecycle + assignment history. Enforces the spec:
//  * global IDs allocated centrally (EMP000001)
//  * rehire = NEW employee linked via rehireOfEmployeeId
//  * one current primary company per employee (closes prior primary)
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  EMPLOYEE_REPOSITORY, ASSIGNMENT_REPOSITORY,
  EmployeeRepository, AssignmentRepository,
} from '../domain/repositories/employee.repository';
import {
  GLOBAL_ID_SEQUENCE, GlobalIdSequence, GlobalIdService,
} from '../domain/services/global-id.service';
import { Employee } from '../domain/entities/employee.entity';
import { EmployeeAssignment } from '../domain/entities/employee-assignment.entity';
import {
  EmployeeNotFoundError, OverlappingAssignmentError, EmployeeOnboardForbiddenError,
} from '../domain/errors/employee.errors';
import {
  CreateEmployeeDto, RehireEmployeeDto, UpdateContactDto, CreateAssignmentDto,
  CreateEmployeeOnboardDto,
  EmployeeResponse, AssignmentResponse, SalaryHistoryResponse,
  EmployeeListResponse, EmployeeListItem, EmployeeOnboardResponse,
} from './dto/employee.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ConflictError } from '../../../shared/kernel/domain-error';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { AccessControlService } from '../../permission/application/access-control.service';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { EmployeeEventsService } from './employee-events.service';
import { EmployeeAccessService } from './employee-access.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';
import { qualifiesForSharedPayroll } from '../../payroll/domain/services/shared-payroll.policy';
import { resolveInitialSalaryEffectiveDate } from '../../payroll/domain/services/salary-band-employment.util';
import { resolveInitialEmploymentFromType } from '../../employee-onboarding/domain/employment-preset.util';
import { ShiftAssignmentService } from '../../attendance/application/shift-assignment.service';

@Injectable()
export class EmployeeService {
  private readonly globalIds: GlobalIdService;

  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(GLOBAL_ID_SEQUENCE) sequence: GlobalIdSequence,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly salaryVisibility: SalaryVisibilityService,
    private readonly accessControl: AccessControlService,
    private readonly employeeEvents: EmployeeEventsService,
    private readonly employeeAccess: EmployeeAccessService,
    @Inject(forwardRef(() => PayrollBuilderService))
    private readonly payrollBuilder: PayrollBuilderService,
    @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll: SharedPayrollService,
    @Inject(forwardRef(() => ShiftAssignmentService))
    private readonly shiftAssignments: ShiftAssignmentService,
    @Optional() @Inject(forwardRef(() => PerformanceService))
    private readonly performance?: PerformanceService,
  ) {
    this.globalIds = new GlobalIdService(sequence);
  }

  // ---- Employee lifecycle ------------------------------------------------

  async createEmployee(actor: ActorContext, dto: CreateEmployeeDto): Promise<EmployeeResponse> {
    const employee = await this.buildEmployee(dto);
    await this.employees.save(employee, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Employee', entityId: employee.id, action: 'create',
      after: employee.toPersistence(),
    });
    return this.toEmployeeResponse(employee);
  }

  async onboardEmployee(actor: ActorContext, dto: CreateEmployeeOnboardDto): Promise<EmployeeOnboardResponse> {
    await this.assertCanOnboard(actor);
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);

    const employee = await this.buildEmployee({
      firstName: dto.firstName,
      lastName: dto.lastName,
      hireDate: dto.startDate,
      nickname: dto.nickname,
      phone: dto.phone,
      email: dto.email,
      department: dto.department ?? dto.companyAssignments?.find((r) => r.companyId === dto.companyId)?.department,
      position: dto.position,
      employmentType: dto.employmentType,
      workCategory: dto.workCategory,
      dateOfBirth: dto.dateOfBirth,
      probationEndDate: dto.probationEndDate,
    });

    if (dto.employmentType && resolveInitialEmploymentFromType(dto.employmentType).employmentStatus === 'active') {
      employee.confirmProbationPassed();
    }

    await this.employees.save(employee, actor.userId);

    const extraCompanyIds = (dto.additionalCompanyIds ?? [])
      .filter((cid) => cid && cid !== dto.companyId);
    const assignmentRows: Array<{ companyId: string; department?: string; teamId?: string }> = dto.companyAssignments?.length
      ? dto.companyAssignments
      : [
          {
            companyId: dto.companyId,
            department: dto.department,
            teamId: dto.teamId,
          },
          ...extraCompanyIds.map((companyId) => ({ companyId })),
        ];

    let primaryAssignmentId: string | null = null;
    for (const row of assignmentRows) {
      await this.companyAccess.assertCompanyAccess(actor, row.companyId);
      const isPrimary = row.companyId === dto.companyId;
      const assignment = await this.createAssignment(actor, employee.id, {
        companyId: row.companyId,
        effectiveFrom: dto.startDate,
        isPrimaryCompany: isPrimary,
        teamId: row.teamId,
        isPrimaryTeam: isPrimary && Boolean(row.teamId),
      });
      if (isPrimary) primaryAssignmentId = assignment.id;
    }

    const assignment = { id: primaryAssignmentId ?? '' };

    let userId: string | null = null;
    let username: string | null = null;

    if (dto.createLogin) {
      if (!dto.password || dto.password.length < 8) {
        throw new ConflictError('Password must be at least 8 characters when creating login');
      }
      const login = await this.provisionLogin(actor, employee.id, {
        username: dto.username ?? dto.phone ?? `${employee.globalId.toLowerCase()}`,
        password: dto.password,
        businessRole: dto.businessRole ?? 'employee',
        companyScopeIds: dto.companyScopeIds,
        teamScopeIds: dto.teamScopeIds,
      });
      userId = login.userId;
      username = login.username;
    }

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employee.id,
      action: 'onboard',
      after: { ...employee.toPersistence(), userId, assignmentId: assignment.id },
    });

    if (this.performance) {
      await this.performance.bootstrapProbationReviewOnOnboarding(actor, {
        employeeId: employee.id,
        companyId: dto.companyId,
        hireDate: new Date(dto.startDate),
        probationEndDate: employee.toPersistence().probationEndDate,
        employmentStatus: employee.status,
      }).catch(() => undefined);
    }

    const primaryOrg = dto.companyAssignments?.find((r) => r.companyId === dto.companyId);
    const isSharedPayroll = qualifiesForSharedPayroll({
      department: dto.department ?? primaryOrg?.department,
      position: dto.position,
      businessRole: dto.businessRole,
    });

    if (isSharedPayroll) {
      const depositCompanyId = dto.depositCollectionCompanyId ?? dto.companyId;
      await this.companyAccess.assertCompanyAccess(actor, depositCompanyId);
      await this.sharedPayroll.bootstrapSharedEmployee(actor, {
        employeeId: employee.id,
        masterMonthlySalary: dto.monthlySalary,
        effectiveFromIso: dto.startDate,
        depositCollectionCompanyId: depositCompanyId,
        department: dto.department ?? primaryOrg?.department,
        position: dto.position,
        businessRole: dto.businessRole,
        reason: 'เงินเดือนเริ่มต้น (แบ่งตามบริษัทที่ใช้งาน)',
      });
    } else {
      const companyIdsForSalary = [...new Set(assignmentRows.map((row) => row.companyId))];
      for (const salaryCompanyId of companyIdsForSalary) {
        await this.bootstrapEmployeeSalary(
          actor,
          employee.id,
          salaryCompanyId,
          dto.monthlySalary,
          dto.startDate,
        );
      }
      for (const salaryCompanyId of companyIdsForSalary) {
        await this.payrollBuilder.syncEmployeeInOpenCycles(actor, employee.id, salaryCompanyId);
      }
    }

    for (const row of assignmentRows) {
      await this.shiftAssignments.ensureDefaultDayShiftIfUnassigned(
        actor,
        employee.id,
        row.companyId,
        dto.startDate,
      ).catch(() => undefined);
    }

    return {
      ...this.toEmployeeResponse(employee),
      userId,
      username,
      assignmentId: assignment.id,
    };
  }

  private async buildEmployee(dto: CreateEmployeeDto & {
    department?: string;
    position?: string;
    employmentType?: string;
    workCategory?: 'office' | 'wfh';
  }): Promise<Employee> {
    const globalId = await this.globalIds.allocate();
    return Employee.create({
      id: randomUUID(),
      globalId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      hireDate: new Date(dto.hireDate),
      nickname: dto.nickname ?? null,
      nationalId: dto.nationalId ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      department: dto.department ?? null,
      position: dto.position ?? null,
      employmentType: dto.employmentType ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
      workCategory: dto.workCategory ?? 'office',
    });
  }

  private async provisionLogin(
    actor: ActorContext,
    employeeId: string,
    input: {
      username: string;
      password: string;
      businessRole: BusinessRoleCode;
      companyScopeIds?: string[];
      teamScopeIds?: string[];
    },
  ): Promise<{ userId: string; username: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null },
    });
    if (existing) {
      return { userId: existing.id, username: existing.username };
    }

    const usernameTaken = await this.prisma.user.findFirst({
      where: { username: input.username, deletedAt: null },
    });
    if (usernameTaken) {
      throw new ConflictError(`Username "${input.username}" is already taken`);
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 10);
    await this.prisma.user.create({
      data: {
        id: userId,
        employeeId,
        username: input.username,
        passwordHash,
        userType: 'human',
        isActive: true,
        mustChangePassword: true,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.accessControl.assignBusinessRole(actor, userId, {
      role: input.businessRole,
      companyScopeIds: input.companyScopeIds ?? [],
      teamScopeIds: input.teamScopeIds ?? [],
      reason: 'Initial login provisioned during employee onboarding',
    });

    return { userId, username: input.username };
  }

  private async assertCanOnboard(actor: ActorContext): Promise<void> {
    const superAdmin = await this.prisma.userRole.findFirst({
      where: {
        userId: actor.userId,
        deletedAt: null,
        role: { code: 'super_admin', deletedAt: null },
      },
      select: { id: true },
    });
    if (superAdmin) return;

    const assignment = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId: actor.userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    const role = assignment?.role;
    if (role !== 'owner' && role !== 'secretary') {
      throw new EmployeeOnboardForbiddenError();
    }
  }

  /** Rehire: validate old record is terminated, create a new linked record. */
  async rehireEmployee(actor: ActorContext, dto: RehireEmployeeDto): Promise<EmployeeResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, dto.previousEmployeeId);
    const previous = await this.employees.findById(dto.previousEmployeeId);
    if (!previous) throw new EmployeeNotFoundError(dto.previousEmployeeId);
    previous.assertRehirable();

    const globalId = await this.globalIds.allocate();
    const rehired = Employee.create({
      id: randomUUID(),
      globalId,
      firstName: previous.toPersistence().firstName,
      lastName: previous.toPersistence().lastName,
      hireDate: new Date(dto.hireDate),
      nationalId: previous.toPersistence().nationalId,
      probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
      rehireOfEmployeeId: previous.id,
    });
    await this.employees.save(rehired, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Employee', entityId: rehired.id, action: 'rehire',
      before: { previousEmployeeId: previous.id },
      after: rehired.toPersistence(),
    });
    return this.toEmployeeResponse(rehired);
  }

  async updateContact(actor: ActorContext, id: string, dto: UpdateContactDto): Promise<EmployeeResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, id);
    const employee = await this.employees.findById(id);
    if (!employee) throw new EmployeeNotFoundError(id);
    const before = employee.toPersistence();
    employee.updateProfile(dto);
    await this.employees.save(employee, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Employee', entityId: id, action: 'update',
      before, after: employee.toPersistence(),
    });
    return this.toEmployeeResponse(employee);
  }

  async terminate(actor: ActorContext, id: string, at?: string): Promise<EmployeeResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, id);
    const employee = await this.employees.findById(id);
    if (!employee) throw new EmployeeNotFoundError(id);

    const openExit = await this.prisma.employeeExitCase.findFirst({
      where: {
        employeeId: id,
        deletedAt: null,
        status: { notIn: ['closed', 'cancelled'] },
      },
    });
    if (openExit) {
      throw new ConflictError(
        'Employee has an open exit case — complete the exit workflow before direct termination',
      );
    }

    const before = employee.toPersistence();
    const when = at ? new Date(at) : new Date();
    employee.terminate(when);

    // close any current assignments
    const current = await this.assignments.listByEmployee(id);
    for (const a of current.filter((x) => x.isCurrent)) {
      a.close(when);
      await this.assignments.save(a, actor.userId);
    }

    await this.employees.save(employee, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Employee', entityId: id, action: 'terminate',
      before, after: employee.toPersistence(),
    });
    return this.toEmployeeResponse(employee);
  }

  async listEmployees(
    actor: ActorContext,
    companyId: string,
    filters: {
      search?: string;
      status?: string;
      positionFamilyId?: string;
      positionLevelId?: string;
      positionDefinitionId?: string;
    } = {},
  ): Promise<EmployeeListResponse> {
    if (!companyId) {
      return { items: [], total: 0 };
    }

    await this.companyAccess.assertCompanyAccess(actor, companyId);

    const search = filters.search?.trim();
    const statusRaw = filters.status?.trim();
    const statusList = statusRaw?.includes(',')
      ? statusRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : statusRaw
        ? [statusRaw]
        : [];
    const employmentStatusFilter = statusList.length === 0
      ? {}
      : statusList.length === 1
        ? { employmentStatus: statusList[0] as 'probation' | 'active' | 'suspended' | 'terminated' }
        : { employmentStatus: { in: statusList as Array<'probation' | 'active' | 'suspended' | 'terminated'> } };

    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...employmentStatusFilter,
        ...(filters.positionFamilyId ? { positionFamilyId: filters.positionFamilyId } : {}),
        ...(filters.positionLevelId ? { positionLevelId: filters.positionLevelId } : {}),
        ...(filters.positionDefinitionId ? { positionDefinitionId: filters.positionDefinitionId } : {}),
        ...(search ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { nickname: { contains: search, mode: 'insensitive' } },
            { globalId: { contains: search.toUpperCase(), mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } },
            {
              assignments: {
                some: {
                  companyId,
                  effectiveTo: null,
                  deletedAt: null,
                  team: { name: { contains: search, mode: 'insensitive' } },
                },
              },
            },
          ],
        } : {}),
        assignments: {
          some: {
            companyId,
            effectiveTo: null,
            deletedAt: null,
          },
        },
      },
      include: {
        assignments: {
          where: { companyId, effectiveTo: null, deletedAt: null },
          take: 1,
          include: {
            team: { select: { name: true } },
          },
        },
        users: {
          where: { deletedAt: null },
          take: 1,
          select: {
            id: true,
            username: true,
            telegramAccounts: {
              where: { deletedAt: null, isActive: true },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
      orderBy: { globalId: 'asc' },
    });

    const items: EmployeeListItem[] = rows.map((row) => {
      const tenure = this.employeeEvents.buildTenureInfo(row.hireDate);
      return {
        id: row.id,
        globalId: row.globalId,
        firstName: row.firstName,
        lastName: row.lastName,
        employmentStatus: row.employmentStatus,
        rehireOfEmployeeId: row.rehireOfEmployeeId,
        nickname: row.nickname,
        phone: row.phone,
        email: row.email,
        department: row.department,
        position: row.position,
        positionFamilyId: row.positionFamilyId,
        positionLevelId: row.positionLevelId,
        positionDefinitionId: row.positionDefinitionId,
        employmentType: row.employmentType,
        workCategory: row.workCategory ?? 'office',
        hireDate: tenure.hireDate,
        tenureYears: tenure.tenureYears,
        tenureMonths: tenure.tenureMonths,
        tenureDays: tenure.tenureDays,
        tenureDisplay: tenure.tenureDisplay,
        tenureText: tenure.tenureDisplay,
        primaryTeamId: row.assignments[0]?.teamId ?? null,
        teamName: row.assignments[0]?.team?.name ?? null,
        telegramLinked: (row.users[0]?.telegramAccounts?.length ?? 0) > 0,
        userId: row.users[0]?.id ?? null,
        username: row.users[0]?.username ?? null,
      };
    });

    return { items, total: items.length };
  }

  async getEmployee(actor: ActorContext, id: string): Promise<EmployeeResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, id);
    const employee = await this.employees.findById(id);
    if (!employee) throw new EmployeeNotFoundError(id);
    return this.toEmployeeResponse(employee);
  }

  async getSalaryHistory(actor: ActorContext, employeeId: string, companyId?: string): Promise<SalaryHistoryResponse> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);
    if (companyId) {
      await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
    }
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);

    const rows = await this.prisma.salaryHistory.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    return {
      employeeId,
      bands: rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        monthlySalary: Number(row.monthlySalary),
        effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
      })),
    };
  }

  // ---- Assignments / history ---------------------------------------------

  async assign(actor: ActorContext, employeeId: string, dto: CreateAssignmentDto): Promise<AssignmentResponse> {
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, dto.companyId);
    return this.createAssignment(actor, employeeId, dto);
  }

  /** Creates assignment — used by onboard (before membership exists) and assign. */
  private async createAssignment(
    actor: ActorContext,
    employeeId: string,
    dto: CreateAssignmentDto,
  ): Promise<AssignmentResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    // prevent duplicate current assignment in the same company
    const currentInCompany = await this.assignments.findCurrentForCompany(employeeId, dto.companyId);
    if (currentInCompany.length > 0) throw new OverlappingAssignmentError();

    const effectiveFrom = new Date(dto.effectiveFrom);

    // if this becomes the primary company, close the previous primary first
    if (dto.isPrimaryCompany) {
      const priorPrimary = await this.assignments.findCurrentPrimaryCompany(employeeId);
      if (priorPrimary) {
        priorPrimary.close(effectiveFrom);
        await this.assignments.save(priorPrimary, actor.userId);
      }
    }

    const assignment = EmployeeAssignment.create({
      id: randomUUID(),
      employeeId,
      companyId: dto.companyId,
      effectiveFrom,
      teamId: dto.teamId ?? null,
      functionId: dto.functionId ?? null,
      roleLevel: dto.roleLevel ?? 'employee',
      isPrimaryCompany: dto.isPrimaryCompany ?? false,
      isPrimaryTeam: dto.isPrimaryTeam ?? false,
    });
    await this.assignments.save(assignment, actor.userId);
    await this.audit.record(actor, {
      entityType: 'EmployeeAssignment', entityId: assignment.id, action: 'create',
      after: assignment.toPersistence(),
    });
    return this.toAssignmentResponse(assignment);
  }

  async listAssignments(actor: ActorContext, employeeId: string): Promise<AssignmentResponse[]> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const list = await this.assignments.listByEmployee(employeeId);
    return list.map((a) => this.toAssignmentResponse(a));
  }

  // ---- mappers -----------------------------------------------------------

  private async bootstrapEmployeeSalary(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    monthlySalary: number,
    startDateIso: string,
  ): Promise<void> {
    const effectiveFrom = resolveInitialSalaryEffectiveDate(
      new Date(startDateIso),
      new Date(startDateIso),
      false,
    );
    await this.prisma.salaryHistory.create({
      data: {
        employeeId,
        companyId,
        monthlySalary,
        effectiveFrom,
        reason: 'เงินเดือนเริ่มต้นตอนเพิ่มพนักงาน',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_salary_bootstrapped',
      after: { companyId, monthlySalary, effectiveFrom: effectiveFrom.toISOString().slice(0, 10) },
    });
  }

  private toEmployeeResponse(e: Employee): EmployeeResponse {
    const p = e.toPersistence();
    const profileDates = this.employeeEvents.buildProfileDates(
      p.dateOfBirth,
      p.hireDate,
      p.employmentStatus,
    );
    return {
      id: p.id,
      globalId: p.globalId,
      firstName: p.firstName,
      lastName: p.lastName,
      employmentStatus: p.employmentStatus,
      rehireOfEmployeeId: p.rehireOfEmployeeId,
      nickname: p.nickname,
      phone: p.phone,
      email: p.email,
      department: p.department,
      position: p.position,
      employmentType: p.employmentType,
      workCategory: p.workCategory,
      hireDate: profileDates.hireDate,
      dateOfBirth: profileDates.dateOfBirth,
      ageYears: profileDates.ageYears,
      tenureYears: profileDates.tenureYears,
      tenureMonths: profileDates.tenureMonths,
      tenureDays: profileDates.tenureDays,
      tenureDisplay: profileDates.tenureDisplay,
      tenureDisplayDetailed: profileDates.tenureDisplayDetailed,
      tenureText: profileDates.tenureText,
      anniversaryYears: profileDates.anniversaryYears,
      probationStatus: profileDates.probationStatus,
      probationStatusCode: profileDates.probationStatusCode,
      probationEndDate: p.probationEndDate ? p.probationEndDate.toISOString().slice(0, 10) : null,
      nextAnniversaryMilestoneYears: profileDates.nextAnniversaryMilestoneYears,
      nextAnniversaryMilestoneLabel: profileDates.nextAnniversaryMilestoneLabel,
    };
  }

  private toAssignmentResponse(a: EmployeeAssignment): AssignmentResponse {
    const p = a.toPersistence();
    return {
      id: p.id, employeeId: p.employeeId, companyId: p.companyId, teamId: p.teamId,
      roleLevel: p.roleLevel, isPrimaryCompany: p.isPrimaryCompany, isPrimaryTeam: p.isPrimaryTeam,
      effectiveFrom: p.effectiveFrom.toISOString(),
      effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString() : null,
    };
  }
}
