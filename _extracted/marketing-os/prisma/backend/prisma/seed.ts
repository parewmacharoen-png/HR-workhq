/**
 * WorkHQ base seed — idempotent via upsert / find-or-create.
 * Run: npx ts-node --project tsconfig.json prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { seedCompanyPolicyKnowledge } from './seeds/company-policy-knowledge.seed';

const prisma = new PrismaClient();

const ADMIN_USERNAME = 'admin';
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
  return prisma.permission.upsert({
    where: { key },
    update: {},
    create: {
      id: randomUUID(),
      key,
      description: `Seeded permission ${key}`,
      category: key.split(':')[0],
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
  for (const key of permissionKeys) {
    permissions.push(await ensurePermission(key));
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

  await ensureUserRole(adminUser.id, superAdminRole.id);
  await ensureScopeAll(adminUser.id);
  console.log('  admin role + scope:all assigned');

  let seq = await nextGlobalIdSequence();
  const employeesByCode: Record<string, { id: string; globalId: string }> = {};

  for (const company of companies) {
    const employee = await ensurePlaceholderEmployee(company.id, company.code, seq);
    employeesByCode[company.code] = { id: employee.id, globalId: employee.globalId };
    seq = Math.max(seq, Number.parseInt(employee.globalId.replace('EMP', ''), 10)) + 1;
    console.log(`  employee ${company.code}: ${employee.globalId} (${employee.id})`);
  }

  await syncGlobalIdCounter(seq - 1);

  const sbEmployee = employeesByCode.SB;
  await prisma.user.update({
    where: { id: adminUser.id },
    data: { employeeId: sbEmployee.id },
  });
  console.log(`  admin linked to SB employee ${sbEmployee.globalId}`);

  await seedCompanyPolicyKnowledge(prisma, adminUser.id);
  console.log('  company policy knowledge base seeded (published + reindexed)');

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
