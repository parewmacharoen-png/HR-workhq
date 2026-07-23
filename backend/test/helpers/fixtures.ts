// ============================================================================
// test/helpers/fixtures.ts
// Shared test data builders for integration tests.
// ============================================================================

import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { BUSINESS_ROLE_BUNDLES } from '../../src/modules/permission/domain/entities/business-role-bundles';
import { BUSINESS_ROLE_CODES } from '../../src/modules/permission/domain/entities/business-role.types';

const GLOBAL_ID_COUNTER_KEY = 'employee.global_id_counter';

export interface TestEmployee {
  employeeId: string;
  companyId: string;
  companyCode: string;
  userId: string;
  username: string;
  password: string;
  globalId: string;
}

export async function ensureWorkflowDefinitions(prisma: PrismaService): Promise<void> {
  const seeds = [
    { entityType: 'leave' as const, approverRule: 'hr' as const },
    { entityType: 'overtime' as const, approverRule: 'hr' as const },
    { entityType: 'leave_reschedule' as const, approverRule: 'owner' as const },
    { entityType: 'leave_shift_swap' as const, approverRule: 'owner' as const },
    { entityType: 'commission_adjustment' as const, approverRule: 'owner' as const },
  ];

  for (const { entityType, approverRule } of seeds) {
    const code = `${entityType}_approval_v1`;
    const existing = await prisma.workflowDefinition.findFirst({
      where: { entityType, code, deletedAt: null },
    });
    if (existing) {
      if (!existing.isActive) {
        await prisma.workflowDefinition.updateMany({
          where: { entityType, isActive: true, deletedAt: null },
          data: { isActive: false },
        });
        await prisma.workflowDefinition.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      continue;
    }

    const def = await prisma.workflowDefinition.create({
      data: {
        id: randomUUID(),
        code,
        name: `${entityType} approval`,
        entityType,
        version: 1,
        isActive: true,
      },
    });
    await prisma.workflowStep.create({
      data: {
        id: randomUUID(),
        workflowDefinitionId: def.id,
        stepOrder: 1,
        name: `${approverRule} approval`,
        approverRule,
        allowEscalate: false,
      },
    });
  }
}

/** Replaces active workflow definitions with a single-step rule (for approver-matching tests). */
export async function ensureWorkflowWithApproverRule(
  prisma: PrismaService,
  entityType: 'leave' | 'overtime' | 'leave_reschedule' | 'leave_shift_swap',
  approverRule: 'sub_leader' | 'big_leader' | 'hr' | 'finance' | 'owner' | 'role',
  approverRoleId?: string,
): Promise<void> {
  const code = `${entityType}_${approverRule}_v2`;
  const existing = await prisma.workflowDefinition.findFirst({
    where: { entityType, code, deletedAt: null },
  });

  await prisma.workflowDefinition.updateMany({
    where: { entityType, isActive: true, deletedAt: null },
    data: { isActive: false },
  });

  if (existing) {
    await prisma.workflowDefinition.update({
      where: { id: existing.id },
      data: { isActive: true },
    });
    return;
  }

  const def = await prisma.workflowDefinition.create({
    data: {
      id: randomUUID(),
      code,
      name: `${entityType} ${approverRule} approval`,
      entityType,
      version: 2,
      isActive: true,
    },
  });
  await prisma.workflowStep.create({
    data: {
      id: randomUUID(),
      workflowDefinitionId: def.id,
      stepOrder: 1,
      name: `${approverRule} approval`,
      approverRule,
      approverRoleId: approverRoleId ?? null,
      allowEscalate: false,
    },
  });
}

export async function createTeam(
  prisma: PrismaService,
  companyId: string,
  name: string,
): Promise<string> {
  const team = await prisma.team.create({
    data: {
      id: randomUUID(),
      companyId,
      name,
      isActive: true,
    },
  });
  return team.id;
}

export interface MarketingTeamStructure {
  rootTeamId: string;
  subTeamId: string;
}

export async function createMarketingTeamStructure(
  prisma: PrismaService,
  companyId: string,
  opts: {
    rootCode?: string;
    subCode?: string;
    bigLeaderEmployeeId?: string;
    subLeaderEmployeeId?: string;
    memberEmployeeIds?: string[];
  } = {},
): Promise<MarketingTeamStructure> {
  const rootCode = opts.rootCode ?? `SB-${randomUUID().slice(0, 6)}`;
  const subCode = opts.subCode ?? `SB1-${randomUUID().slice(0, 6)}`;

  const root = await prisma.marketingTeam.create({
    data: {
      id: randomUUID(),
      companyId,
      code: rootCode,
      name: rootCode,
      level: 'root',
      bigLeaderEmployeeId: opts.bigLeaderEmployeeId,
      isActive: true,
    },
  });

  const sub = await prisma.marketingTeam.create({
    data: {
      id: randomUUID(),
      companyId,
      code: subCode,
      name: subCode,
      parentTeamId: root.id,
      level: 'sub_team',
      subLeaderEmployeeId: opts.subLeaderEmployeeId,
      isActive: true,
    },
  });

  const effectiveFrom = new Date('2024-01-01');

  if (opts.bigLeaderEmployeeId) {
    await prisma.marketingTeamMember.create({
      data: {
        id: randomUUID(),
        companyId,
        teamId: root.id,
        employeeId: opts.bigLeaderEmployeeId,
        role: 'big_leader',
        effectiveFrom,
        isPrimary: true,
      },
    });
  }

  if (opts.subLeaderEmployeeId) {
    await prisma.marketingTeamMember.create({
      data: {
        id: randomUUID(),
        companyId,
        teamId: sub.id,
        employeeId: opts.subLeaderEmployeeId,
        role: 'sub_leader',
        effectiveFrom,
        isPrimary: true,
      },
    });
  }

  for (const employeeId of opts.memberEmployeeIds ?? []) {
    await prisma.marketingTeamMember.create({
      data: {
        id: randomUUID(),
        companyId,
        teamId: sub.id,
        employeeId,
        role: 'member',
        effectiveFrom,
        isPrimary: true,
      },
    });
  }

  return { rootTeamId: root.id, subTeamId: sub.id };
}

export async function ensureLeaveTypes(prisma: PrismaService): Promise<{
  annualId: string;
  sickId: string;
  emergencyId: string;
  unpaidId: string;
}> {
  const ensure = async (
    code: string,
    name: string,
    defaultQuota: number,
    accrualPeriod: 'year' | 'half_year' = 'year',
  ) => {
    let row = await prisma.leaveType.findFirst({
      where: { code, deletedAt: null },
    });
    if (!row) {
      row = await prisma.leaveType.create({
        data: {
          id: randomUUID(),
          code,
          name,
          accrualPeriod,
          defaultQuota,
          allowBorrowFuture: false,
        },
      });
    }
    return row.id;
  };

  const [annualId, sickId, emergencyId, unpaidId] = await Promise.all([
    ensure('annual', 'Annual Leave', 10),
    ensure('sick', 'Sick Leave', 30),
    ensure('emergency', 'Emergency Leave', 4, 'half_year'),
    ensure('unpaid', 'Unpaid Leave', 0),
  ]);

  return { annualId, sickId, emergencyId, unpaidId };
}

async function nextGlobalId(prisma: PrismaService): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ value: unknown }[]>(
      `SELECT value FROM system.system_settings
       WHERE company_id IS NULL AND key = $1 FOR UPDATE`,
      GLOBAL_ID_COUNTER_KEY,
    );
    let current = 0;
    if (rows.length > 0) {
      const v = rows[0].value as { n?: number } | number | null;
      current = typeof v === 'number' ? v : (v?.n ?? 0);
    }
    const next = current + 1;
    await tx.$executeRawUnsafe(
      `INSERT INTO system.system_settings (id, company_id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), NULL, $1, jsonb_build_object('n', $2::int), now(), now())
       ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
       DO UPDATE SET value = jsonb_build_object('n', $2::int), updated_at = now()`,
      GLOBAL_ID_COUNTER_KEY,
      next,
    );
    return next;
  });
}

export async function createTestEmployee(
  prisma: PrismaService,
  opts: {
    companyCode?: string;
    username?: string;
    password?: string;
    phone?: string;
    hireDate?: Date;
    employmentStatus?: 'probation' | 'active';
    probationEndDate?: Date | null;
    roleCodes?: string[];
    businessRole?: (typeof BUSINESS_ROLE_CODES)[number];
    scopeType?: 'self' | 'company' | 'all';
    teamId?: string;
    assignmentRoleLevel?: 'employee' | 'sub_leader' | 'big_leader';
    withSalary?: boolean;
    salaryAmount?: number;
    salaryEffectiveFrom?: Date;
  } = {},
): Promise<TestEmployee> {
  const companyCode = opts.companyCode ?? 'SB';
  const company = await prisma.company.findFirst({
    where: { code: companyCode, deletedAt: null },
  });
  if (!company) throw new Error(`Company ${companyCode} not found — run seed first`);

  const seq = await nextGlobalId(prisma);
  const globalId = `EMP${seq.toString().padStart(6, '0')}`;
  const suffix = randomUUID().slice(0, 8);
  const phone = opts.phone ?? `08${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;

  const employee = await prisma.employee.create({
    data: {
      id: randomUUID(),
      globalId,
      firstName: 'Test',
      lastName: suffix,
      phone,
      hireDate: opts.hireDate ?? new Date('2025-01-01'),
      employmentStatus: opts.employmentStatus ?? 'active',
      probationEndDate: opts.probationEndDate ?? new Date('2025-04-01'),
    },
  });

  await prisma.employeeAssignment.create({
    data: {
      id: randomUUID(),
      employeeId: employee.id,
      companyId: company.id,
      teamId: opts.teamId ?? null,
      roleLevel: opts.assignmentRoleLevel ?? 'employee',
      isPrimaryCompany: true,
      isPrimaryTeam: !!opts.teamId,
      effectiveFrom: opts.hireDate ?? new Date('2025-01-01'),
    },
  });

  const password = opts.password ?? 'testpass123';
  const passwordHash = await bcrypt.hash(password, 10);
  const username = opts.username ?? `user_${suffix}`;
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      username,
      passwordHash,
      employeeId: employee.id,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const roleCodes = opts.roleCodes ?? ['employee'];
  for (const code of roleCodes) {
    let role = await prisma.role.findFirst({ where: { code, deletedAt: null } });
    if (!role) {
      role = await prisma.role.create({
        data: { id: randomUUID(), code, name: code, isSystem: true },
      });
    }
    await grantPermissionsToRole(prisma, code, BUSINESS_ROLE_BUNDLES[code as keyof typeof BUSINESS_ROLE_BUNDLES] ?? []);
    await prisma.userRole.create({
      data: { id: randomUUID(), userId: user.id, roleId: role.id },
    });
  }

  const businessRole = opts.businessRole
    ?? (BUSINESS_ROLE_CODES.includes(roleCodes[0] as typeof BUSINESS_ROLE_CODES[number])
      ? (roleCodes[0] as typeof BUSINESS_ROLE_CODES[number])
      : 'employee');
  await assignBusinessRole(prisma, user.id, businessRole, user.id);

  const scopeType = opts.scopeType ?? 'self';
  await prisma.scopeGrant.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      scopeType,
      companyId: scopeType === 'company' ? company.id : null,
    },
  });

  if (opts.withSalary) {
    await prisma.salaryHistory.create({
      data: {
        id: randomUUID(),
        employeeId: employee.id,
        companyId: company.id,
        monthlySalary: opts.salaryAmount ?? 20000,
        effectiveFrom: opts.salaryEffectiveFrom ?? new Date('2024-01-01'),
      },
    });
  }

  return {
    employeeId: employee.id,
    companyId: company.id,
    companyCode,
    userId: user.id,
    username,
    password,
    globalId,
  };
}

export async function ensureLeaveBalance(
  prisma: PrismaService,
  employeeId: string,
  leaveTypeId: string,
  periodStart: Date,
  entitled = 10,
): Promise<void> {
  const existing = await prisma.leaveBalance.findFirst({
    where: { employeeId, leaveTypeId, periodStart, deletedAt: null },
  });
  if (existing) return;

  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  await prisma.leaveBalance.create({
    data: {
      id: randomUUID(),
      employeeId,
      leaveTypeId,
      periodStart,
      periodEnd,
      entitled,
      used: 0,
      borrowed: 0,
      remaining: entitled,
    },
  });
}

export async function grantPermissionsToRole(
  prisma: PrismaService,
  roleCode: string,
  permissionKeys: string[],
): Promise<void> {
  let role = await prisma.role.findFirst({ where: { code: roleCode, deletedAt: null } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        id: randomUUID(),
        code: roleCode,
        name: roleCode,
        isSystem: true,
      },
    });
  }

  for (const key of permissionKeys) {
    let permission = await prisma.permission.findFirst({ where: { key } });
    if (!permission) {
      permission = await prisma.permission.create({
        data: {
          id: randomUUID(),
          key,
          description: key,
          category: key.split(':')[0],
        },
      });
    }
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { id: randomUUID(), roleId: role.id, permissionId: permission.id },
    });
  }
}

export async function assignBusinessRole(
  prisma: PrismaService,
  userId: string,
  role: (typeof BUSINESS_ROLE_CODES)[number],
  actorUserId: string,
): Promise<void> {
  await grantPermissionsToRole(prisma, role, BUSINESS_ROLE_BUNDLES[role]);
  const roleRow = await prisma.role.findFirst({ where: { code: role, deletedAt: null } });
  if (roleRow) {
    await prisma.userRole.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
    await prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId,
        roleId: roleRow.id,
        grantedBy: actorUserId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }
  await prisma.businessRoleAssignment.updateMany({
    where: { userId, isActive: true, deletedAt: null },
    data: { isActive: false, deletedAt: new Date(), deletedBy: actorUserId },
  });
  await prisma.businessRoleAssignment.create({
    data: {
      id: randomUUID(),
      userId,
      role,
      assignedBy: actorUserId,
      isActive: true,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    },
  });
}

export async function createTelegramAccount(
  prisma: PrismaService,
  userId: string,
  telegramUserId: number,
  chatId: number,
): Promise<string> {
  const acc = await prisma.telegramAccount.create({
    data: {
      id: randomUUID(),
      userId,
      telegramUserId: BigInt(telegramUserId),
      chatId: BigInt(chatId),
      isActive: true,
    },
  });

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { employeeId: true },
  });
  if (user?.employeeId) {
    await prisma.telegramIdentity.create({
      data: {
        id: randomUUID(),
        employeeId: user.employeeId,
        telegramUserId: BigInt(telegramUserId),
        status: 'ACTIVE',
        linkedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  return acc.id;
}

export function leavePeriodStart(date = new Date()): Date {
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 25));
  if (d.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
  return start;
}

export async function openPayrollCycle(
  prisma: PrismaService,
  companyId: string,
): Promise<string> {
  const existing = await prisma.payrollCycle.findFirst({
    where: { companyId, status: 'open', deletedAt: null },
  });
  if (existing) return existing.id;

  const cycle = await prisma.payrollCycle.create({
    data: {
      id: randomUUID(),
      companyId,
      periodStart: new Date('2025-12-25'),
      periodEnd: new Date('2026-01-23'),
      payDate: new Date('2026-01-25'),
      status: 'open',
    },
  });
  return cycle.id;
}

/** Wide open earn cycle for marketing KPI / daily report integration tests. */
export async function ensureMarketingEarnCycle(
  prisma: PrismaService,
  companyId: string,
): Promise<string> {
  const periodStart = new Date('2026-06-01');
  const periodEnd = new Date('2026-06-30');
  const existing = await prisma.payrollCycle.findFirst({
    where: { companyId, periodStart, deletedAt: null },
  });
  if (existing) return existing.id;

  const cycle = await prisma.payrollCycle.create({
    data: {
      id: randomUUID(),
      companyId,
      periodStart,
      periodEnd,
      payDate: new Date('2026-07-05'),
      status: 'open',
    },
  });
  return cycle.id;
}

/** Creates or reuses a payroll cycle for the given company and period start. */
export async function ensurePayrollCycle(
  prisma: PrismaService,
  input: {
    companyId: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
    status?: 'open' | 'locked' | 'paid';
  },
): Promise<string> {
  const existing = await prisma.payrollCycle.findFirst({
    where: {
      companyId: input.companyId,
      periodStart: input.periodStart,
      deletedAt: null,
    },
  });
  if (existing) return existing.id;

  const cycle = await prisma.payrollCycle.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      payDate: input.payDate,
      status: input.status ?? 'open',
    },
  });
  return cycle.id;
}

export async function ensureMarketingTeam(
  prisma: PrismaService,
  companyCode: string,
  teamCode = 'ONB-TEST',
): Promise<{ companyId: string; teamId: string }> {
  const company = await prisma.company.findFirstOrThrow({
    where: { code: companyCode, deletedAt: null },
  });
  const existing = await prisma.marketingTeam.findFirst({
    where: { companyId: company.id, code: teamCode, deletedAt: null },
  });
  if (existing) return { companyId: company.id, teamId: existing.id };

  const team = await prisma.marketingTeam.create({
    data: {
      id: randomUUID(),
      companyId: company.id,
      code: teamCode,
      name: `${teamCode} Team`,
      level: 'sub_team',
      isActive: true,
    },
  });
  return { companyId: company.id, teamId: team.id };
}

export async function ensureApprovedCommissionDeclarations(
  prisma: PrismaService,
  companyId: string,
  teamId: string,
  employees: Array<Pick<TestEmployee, 'employeeId' | 'userId'>>,
  commissionMethod: 'team_pool' | 'big_leader_split' = 'team_pool',
): Promise<void> {
  for (const emp of employees) {
    const existing = await prisma.commissionDeclarationAssignment.findFirst({
      where: {
        companyId,
        teamId,
        deletedAt: null,
        declaration: {
          employeeId: emp.employeeId,
          status: 'approved',
          deletedAt: null,
        },
      },
    });
    if (existing) continue;

    await prisma.commissionDeclaration.create({
      data: {
        id: randomUUID(),
        employeeId: emp.employeeId,
        companyId,
        status: 'approved',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        createdBy: emp.userId,
        updatedBy: emp.userId,
        assignments: {
          create: {
            id: randomUUID(),
            companyId,
            teamId,
            assignmentType: 'primary',
            commissionMethod,
            sortOrder: 0,
            ...(commissionMethod === 'big_leader_split'
              ? { bigLeaderPercent: 5, employeePercent: 95 }
              : {}),
          },
        },
      },
    });
  }
}
