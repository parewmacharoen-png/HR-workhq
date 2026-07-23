/**
 * WorkHQ base seed — idempotent via upsert / find-or-create.
 * Run: npx ts-node --project tsconfig.json prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { seedCompanyPolicyKnowledge } from './seeds/company-policy-knowledge.seed';
import {
  ATTENDANCE_RULES_SETTING_KEY,
  DEFAULT_ATTENDANCE_RULES,
} from '../src/modules/settings/domain/attendance-settings.types';
import {
  DEFAULT_LEAVE_RULES,
  LEAVE_RULES_SETTING_KEY,
} from '../src/modules/settings/domain/leave-settings.types';
import {
  DEFAULT_REFERRAL_RULES,
  REFERRAL_RULES_SETTING_KEY,
} from '../src/modules/settings/domain/referral-settings.types';
import {
  DEFAULT_DEPOSIT_RULES,
  DEPOSIT_RULES_SETTING_KEY,
} from '../src/modules/settings/domain/deposit-settings.types';
import {
  DEFAULT_PAYROLL_RULES,
  PAYROLL_RULES_SETTING_KEY,
} from '../src/modules/settings/domain/payroll-settings.types';
import {
  BUSINESS_ROLE_BUNDLES,
} from '../src/modules/permission/domain/entities/business-role-bundles';
import { BUSINESS_ROLE_CODES, type BusinessRoleCode } from '../src/modules/permission/domain/entities/business-role.types';
import {
  ALL_ONBOARDING_INVITE_PERMISSIONS,
  ONBOARDING_INVITE_PERMISSION_CATEGORY,
  ONBOARDING_INVITE_PERMISSION_LABELS_TH,
} from '../src/modules/employee-onboarding/domain/onboarding-invite-permissions';
import { ensureMarketingTeamsForCompany } from '../src/modules/organization/application/marketing-teams.bootstrap';

const prisma = new PrismaClient();

const ADMIN_USERNAME = 'admin';
const OWNER_USERNAME = 'owner';
const OWNER_DISPLAY_NAME = 'alynn';
const ADMIN_PASSWORD = 'password';

const COMPANIES = [
  { code: 'SB', name: 'SB Company' },
  { code: 'MB', name: 'MB Company' },
  { code: 'KW', name: 'KW Company' },
  { code: 'VB', name: 'VB Company' },
  { code: 'HH', name: 'HH Company' },
] as const;

const PERMISSION_DOMAINS = [
  'attendance',
  'employee',
  'leave',
  'payroll',
  'commission',
  'marketing',
  'finance',
  'performance',
  'recruitment',
  'referral',
  'reporting',
  'workflow',
  'organization',
  'permission',
  'knowledge',
  'asset',
  'settings',
  'security',
  'document',
  'warning',
] as const;

/** Extra action permissions used by controllers beyond plain read/write. */
const EXTRA_PERMISSIONS = [
  'finance:approve',
  'performance:score',
  'performance:configure',
  'performance:finalize',
  'referral:qualify',
  'referral:pay',
  'reporting:owner',
  'reporting:executive',
  'workflow:act',
  'role:assign',
  'scope:grant',
  'impersonation:use',
  'ai:chat',
  'marketing:approve',
  'marketing:audit',
  'marketing:lock',
  'commission:declaration:review',
  'commission:declaration:approve',
  'commission:declaration:reject',
  'salary:read',
  ...ALL_ONBOARDING_INVITE_PERMISSIONS,
] as const;

const SUPER_ADMIN_ROLE_CODE = 'super_admin';
const GLOBAL_ID_COUNTER_KEY = 'employee.global_id_counter';

function buildPermissionKeys(): string[] {
  const keys = new Set<string>();
  for (const domain of PERMISSION_DOMAINS) {
    keys.add(`${domain}:read`);
    keys.add(`${domain}:write`);
  }
  for (const key of EXTRA_PERMISSIONS) keys.add(key);
  return [...keys].sort();
}

function formatGlobalId(seq: number): string {
  return `EMP${seq.toString().padStart(6, '0')}`;
}

async function ensureCompany(code: string, name: string) {
  const existing = await prisma.company.findFirst({
    where: { code, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.company.create({
    data: { id: randomUUID(), code, name, isActive: true },
  });
}

async function ensurePermission(key: string) {
  const onboardingLabel = ONBOARDING_INVITE_PERMISSION_LABELS_TH[
    key as keyof typeof ONBOARDING_INVITE_PERMISSION_LABELS_TH
  ];
  const category = onboardingLabel ? ONBOARDING_INVITE_PERMISSION_CATEGORY : key.split(':')[0];
  const description = onboardingLabel ?? `Seeded permission ${key}`;

  return prisma.permission.upsert({
    where: { key },
    update: { category, description },
    create: {
      id: randomUUID(),
      key,
      description,
      category,
    },
  });
}

async function ensureRole(code: string, name: string) {
  const existing = await prisma.role.findFirst({
    where: { code, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.role.create({
    data: {
      id: randomUUID(),
      code,
      name,
      isSystem: true,
    },
  });
}

async function ensureRolePermission(roleId: string, permissionId: string) {
  return prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: { roleId, permissionId },
    },
    update: {},
    create: {
      id: randomUUID(),
      roleId,
      permissionId,
    },
  });
}

async function ensureAdminUser(passwordHash: string) {
  const existing = await prisma.user.findFirst({
    where: { username: ADMIN_USERNAME, deletedAt: null },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, isActive: true },
    });
  }

  return prisma.user.create({
    data: {
      id: randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash,
      userType: 'human',
      isActive: true,
    },
  });
}

async function ensureOwnerUser(passwordHash: string) {
  const existing = await prisma.user.findFirst({
    where: { username: OWNER_USERNAME, deletedAt: null },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, displayName: OWNER_DISPLAY_NAME, isActive: true, employeeId: null },
    });
  }

  return prisma.user.create({
    data: {
      id: randomUUID(),
      username: OWNER_USERNAME,
      displayName: OWNER_DISPLAY_NAME,
      passwordHash,
      userType: 'human',
      isActive: true,
    },
  });
}

async function mirrorAdminAccessToUser(adminUserId: string, targetUserId: string): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { id: adminUserId, deletedAt: null },
    include: {
      userRoles: { where: { deletedAt: null } },
      businessRoleAssignments: { where: { isActive: true, deletedAt: null } },
      scopeGrants: { where: { deletedAt: null } },
    },
  });
  if (!admin) return;

  for (const ur of admin.userRoles) {
    const exists = await prisma.userRole.findFirst({
      where: { userId: targetUserId, roleId: ur.roleId, deletedAt: null },
    });
    if (!exists) {
      await ensureUserRole(targetUserId, ur.roleId);
    }
  }
  for (const br of admin.businessRoleAssignments) {
    const exists = await prisma.businessRoleAssignment.findFirst({
      where: { userId: targetUserId, role: br.role, isActive: true, deletedAt: null },
    });
    if (!exists) {
      await ensureBusinessRoleAssignment(targetUserId, br.role as BusinessRoleCode, adminUserId);
    }
  }
  for (const sg of admin.scopeGrants) {
    const exists = await prisma.scopeGrant.findFirst({
      where: {
        userId: targetUserId,
        scopeType: sg.scopeType,
        companyId: sg.companyId,
        teamId: sg.teamId,
        deletedAt: null,
      },
    });
    if (!exists) {
      await prisma.scopeGrant.create({
        data: {
          id: randomUUID(),
          userId: targetUserId,
          scopeType: sg.scopeType,
          companyId: sg.companyId,
          teamId: sg.teamId,
          createdBy: adminUserId,
          updatedBy: adminUserId,
        },
      });
    }
  }
}

async function ensureUserRole(userId: string, roleId: string) {
  const existing = await prisma.userRole.findFirst({
    where: { userId, roleId, deletedAt: null },
  });
  if (existing) return existing;

  return prisma.userRole.create({
    data: {
      id: randomUUID(),
      userId,
      roleId,
      grantedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    },
  });
}

async function ensureScopeAll(userId: string) {
  const existing = await prisma.scopeGrant.findFirst({
    where: { userId, scopeType: 'all', deletedAt: null },
  });
  if (existing) return existing;

  return prisma.scopeGrant.create({
    data: {
      id: randomUUID(),
      userId,
      scopeType: 'all',
      createdBy: userId,
      updatedBy: userId,
    },
  });
}

async function nextGlobalIdSequence(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ value: unknown }[]>(
    `SELECT value FROM system.system_settings
     WHERE company_id IS NULL AND key = $1`,
    GLOBAL_ID_COUNTER_KEY,
  );

  let current = 0;
  if (rows.length > 0) {
    const v = rows[0].value as { n?: number } | number | null;
    current = typeof v === 'number' ? v : (v?.n ?? 0);
  }

  const maxEmployee = await prisma.employee.findFirst({
    where: { deletedAt: null },
    orderBy: { globalId: 'desc' },
    select: { globalId: true },
  });
  if (maxEmployee?.globalId) {
    const parsed = Number.parseInt(maxEmployee.globalId.replace('EMP', ''), 10);
    if (!Number.isNaN(parsed)) current = Math.max(current, parsed);
  }

  return current + 1;
}

async function syncGlobalIdCounter(seq: number): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO system.system_settings (id, company_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, $1, jsonb_build_object('n', $2::int), now(), now())
     ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
     DO UPDATE SET value = jsonb_build_object('n', GREATEST(
       COALESCE((system.system_settings.value->>'n')::int, 0),
       $2::int
     )), updated_at = now()`,
    GLOBAL_ID_COUNTER_KEY,
    seq,
  );
}

async function ensurePlaceholderEmployee(
  companyId: string,
  companyCode: string,
  seq: number,
) {
  const email = `placeholder.${companyCode.toLowerCase()}@workhq.local`;
  let employee = await prisma.employee.findFirst({
    where: { email, deletedAt: null },
  });

  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        id: randomUUID(),
        globalId: formatGlobalId(seq),
        firstName: 'Placeholder',
        lastName: companyCode,
        email,
        hireDate: new Date('2026-01-01'),
        employmentStatus: 'active',
      },
    });
  }

  const assignment = await prisma.employeeAssignment.findFirst({
    where: {
      employeeId: employee.id,
      companyId,
      deletedAt: null,
      effectiveTo: null,
    },
  });

  if (!assignment) {
    await prisma.employeeAssignment.create({
      data: {
        id: randomUUID(),
        employeeId: employee.id,
        companyId,
        roleLevel: 'employee',
        isPrimaryCompany: true,
        isPrimaryTeam: false,
        effectiveFrom: new Date('2026-01-01'),
      },
    });
  }

  return employee;
}

async function ensureBusinessRoleAssignment(
  userId: string,
  role: (typeof BUSINESS_ROLE_CODES)[number],
  actorUserId: string,
) {
  const existing = await prisma.businessRoleAssignment.findFirst({
    where: { userId, role, isActive: true, deletedAt: null },
  });
  if (existing) return existing;

  await prisma.businessRoleAssignment.updateMany({
    where: { userId, isActive: true, deletedAt: null },
    data: { isActive: false, deletedAt: new Date(), deletedBy: actorUserId },
  });

  return prisma.businessRoleAssignment.create({
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

async function seedBusinessRoles(permissionByKey: Map<string, { id: string }>) {
  for (const code of BUSINESS_ROLE_CODES) {
    const role = await ensureRole(code, formatBusinessRoleName(code));
    const bundle = BUSINESS_ROLE_BUNDLES[code];
    for (const key of bundle) {
      const permission = permissionByKey.get(key);
      if (permission) {
        await ensureRolePermission(role.id, permission.id);
      }
    }
    console.log(`  business role ${code}: ${bundle.length} permissions`);
  }
}

function formatBusinessRoleName(code: string): string {
  return code
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function main() {
  console.log('Seeding WorkHQ base data...');

  const companies = [];
  for (const { code, name } of COMPANIES) {
    const company = await ensureCompany(code, name);
    companies.push(company);
    console.log(`  company ${code}: ${company.id}`);
  }

  const sbCompany = companies.find((c) => c.code === 'SB');
  if (!sbCompany) throw new Error('SB company missing after seed');

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const adminUser = await ensureAdminUser(passwordHash);
  console.log(`  admin user: ${adminUser.id}`);

  const permissionKeys = buildPermissionKeys();
  const permissions = [];
  const permissionByKey = new Map<string, { id: string }>();
  for (const key of permissionKeys) {
    const row = await ensurePermission(key);
    permissions.push(row);
    permissionByKey.set(key, row);
  }
  console.log(`  permissions: ${permissions.length}`);

  const superAdminRole = await ensureRole(
    SUPER_ADMIN_ROLE_CODE,
    'Super Administrator',
  );
  for (const permission of permissions) {
    await ensureRolePermission(superAdminRole.id, permission.id);
  }
  console.log(`  role ${SUPER_ADMIN_ROLE_CODE}: ${superAdminRole.id}`);

  await seedBusinessRoles(permissionByKey);

  await ensureUserRole(adminUser.id, superAdminRole.id);
  await ensureScopeAll(adminUser.id);
  await ensureBusinessRoleAssignment(adminUser.id, 'owner', adminUser.id);
  await ensureUserRole(adminUser.id, (await ensureRole('owner', 'Owner')).id);
  console.log('  admin role + scope:all + business role owner assigned');

  let seq = await nextGlobalIdSequence();
  const employeesByCode: Record<string, { id: string; globalId: string }> = {};

  for (const company of companies) {
    const employee = await ensurePlaceholderEmployee(company.id, company.code, seq);
    employeesByCode[company.code] = { id: employee.id, globalId: employee.globalId };
    seq = Math.max(seq, Number.parseInt(employee.globalId.replace('EMP', ''), 10)) + 1;
    console.log(`  employee ${company.code}: ${employee.globalId} (${employee.id})`);
  }

  await syncGlobalIdCounter(seq - 1);

  // Platform admin uses super_admin + scope:all — not tied to an employee record.
  await prisma.user.update({
    where: { id: adminUser.id },
    data: { employeeId: null },
  });
  console.log('  admin: platform operator (no employee record)');

  const ownerUser = await ensureOwnerUser(passwordHash);
  await mirrorAdminAccessToUser(adminUser.id, ownerUser.id);
  console.log(`  owner user: ${ownerUser.id} (${OWNER_USERNAME} / ${OWNER_DISPLAY_NAME})`);

  await seedCompanyPolicyKnowledge(prisma, adminUser.id);
  console.log('  company policy knowledge base seeded (published + reindexed)');

  await seedSystemAttendanceRules();
  console.log('  system attendance.rules seeded');

  await seedSystemLeaveRules();
  console.log('  system leave.rules seeded');

  await seedSystemReferralRules();
  console.log('  system referral.rules seeded');

  await seedSystemDepositRules();
  console.log('  system deposit.rules seeded');

  await seedSystemPayrollRules();
  console.log('  system payroll.rules seeded');

  await seedLeaveTypes();
  console.log('  leave types seeded');

  for (const company of companies) {
    await ensureMarketingTeamsForCompany(prisma, company.id);
    console.log(`  marketing teams 1-9: ${company.code}`);
  }

  console.log('Seed complete.');
}

async function seedSystemDepositRules(): Promise<void> {
  const existing = await prisma.settingProfile.findFirst({
    where: {
      companyId: null,
      category: 'deposit',
      key: DEPOSIT_RULES_SETTING_KEY,
      isActive: true,
    },
  });
  if (existing) return;

  await prisma.settingProfile.create({
    data: {
      id: randomUUID(),
      companyId: null,
      category: 'deposit',
      key: DEPOSIT_RULES_SETTING_KEY,
      value: DEFAULT_DEPOSIT_RULES as object,
      isActive: true,
    },
  });
}

async function seedSystemReferralRules(): Promise<void> {
  const existing = await prisma.settingProfile.findFirst({
    where: {
      companyId: null,
      category: 'referral',
      key: REFERRAL_RULES_SETTING_KEY,
      isActive: true,
    },
  });
  if (existing) return;

  await prisma.settingProfile.create({
    data: {
      id: randomUUID(),
      companyId: null,
      category: 'referral',
      key: REFERRAL_RULES_SETTING_KEY,
      value: DEFAULT_REFERRAL_RULES as object,
      isActive: true,
    },
  });
}

async function seedSystemPayrollRules(): Promise<void> {
  const existing = await prisma.settingProfile.findFirst({
    where: {
      companyId: null,
      category: 'payroll',
      key: PAYROLL_RULES_SETTING_KEY,
      isActive: true,
    },
  });
  if (existing) return;

  await prisma.settingProfile.create({
    data: {
      id: randomUUID(),
      companyId: null,
      category: 'payroll',
      key: PAYROLL_RULES_SETTING_KEY,
      value: DEFAULT_PAYROLL_RULES as object,
      isActive: true,
    },
  });
}

async function seedLeaveTypes(): Promise<void> {
  const types = [
    { code: 'annual', name: 'Annual Leave', defaultQuota: 10 },
    { code: 'sick', name: 'Sick Leave', defaultQuota: 30 },
    { code: 'emergency', name: 'Emergency Leave', defaultQuota: 4 },
    { code: 'unpaid', name: 'Unpaid Leave', defaultQuota: 0 },
  ];

  for (const type of types) {
    const existing = await prisma.leaveType.findFirst({
      where: { code: type.code, deletedAt: null },
    });
    if (existing) continue;

    await prisma.leaveType.create({
      data: {
        id: randomUUID(),
        code: type.code,
        name: type.name,
        accrualPeriod: type.code === 'emergency' ? 'half_year' : 'year',
        defaultQuota: type.defaultQuota,
        allowBorrowFuture: false,
      },
    });
  }
}

async function seedSystemLeaveRules(): Promise<void> {
  const existing = await prisma.settingProfile.findFirst({
    where: {
      companyId: null,
      category: 'leave',
      key: LEAVE_RULES_SETTING_KEY,
      isActive: true,
    },
  });
  if (existing) return;

  await prisma.settingProfile.create({
    data: {
      id: randomUUID(),
      companyId: null,
      category: 'leave',
      key: LEAVE_RULES_SETTING_KEY,
      value: DEFAULT_LEAVE_RULES as object,
      isActive: true,
    },
  });
}

async function seedSystemAttendanceRules(): Promise<void> {
  const existing = await prisma.settingProfile.findFirst({
    where: {
      companyId: null,
      category: 'attendance',
      key: ATTENDANCE_RULES_SETTING_KEY,
      isActive: true,
    },
  });
  if (existing) return;

  await prisma.settingProfile.create({
    data: {
      id: randomUUID(),
      companyId: null,
      category: 'attendance',
      key: ATTENDANCE_RULES_SETTING_KEY,
      value: DEFAULT_ATTENDANCE_RULES as object,
      isActive: true,
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
