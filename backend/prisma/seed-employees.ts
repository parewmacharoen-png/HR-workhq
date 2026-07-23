/**
 * WorkHQ employee seed — edit EMPLOYEES below, then run:
 *   npx ts-node --project tsconfig.json prisma/seed-employees.ts
 *
 * Creates Employee + company assignment + User (login) + TelegramAccount placeholder.
 * Note: telegram_user_id must be unique in the DB, so placeholders use 0 only when
 * unassigned; multiple employees get sequential negative IDs until HR links real ones.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Company ID map ────────────────────────────────────────────────────────────
const COMPANY_IDS = {
  SB: 'ec86ce6d-bbd3-4805-89ea-b1e7fc0535c2',
  MB: '03888a5a-4bef-4c22-a9c0-5ba15a7e936f',
  KW: '6d9ea03c-5dbf-4f53-87a4-8f58d6645ecd',
  VB: '1e012d45-e564-47c4-96dc-6df42969cf9f',
  HH: '90518e2e-67d2-4794-9f8d-8fade3171d0c',
} as const;

type CompanyCode = keyof typeof COMPANY_IDS;

/** Edit this list with real employee data. */
const EMPLOYEES: Array<{
  firstName: string;
  lastName: string;
  phone: string;
  hireDate: string;
  company: CompanyCode;
}> = [
  {
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    phone: '0812345678',
    hireDate: '2026-01-15',
    company: 'SB',
  },
  {
    firstName: 'สมหญิง',
    lastName: 'รักงาน',
    phone: '0898765432',
    hireDate: '2026-02-01',
    company: 'MB',
  },
];

const DEFAULT_PASSWORD = '1234';
const GLOBAL_ID_COUNTER_KEY = 'employee.global_id_counter';
const PLACEHOLDER_TELEGRAM_USER_ID = BigInt(0);

function formatGlobalId(seq: number): string {
  return `EMP${seq.toString().padStart(6, '0')}`;
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

/**
 * DB enforces unique telegram_user_id; only one row may use 0.
 * Re-use 0 when free, otherwise assign a unique negative placeholder.
 */
async function resolvePlaceholderTelegramUserId(index: number): Promise<bigint> {
  const existingZero = await prisma.telegramAccount.findFirst({
    where: { telegramUserId: PLACEHOLDER_TELEGRAM_USER_ID, deletedAt: null },
  });
  if (!existingZero) return PLACEHOLDER_TELEGRAM_USER_ID;

  let candidate = BigInt(-(index + 1));
  while (true) {
    const taken = await prisma.telegramAccount.findFirst({
      where: { telegramUserId: candidate, deletedAt: null },
    });
    if (!taken) return candidate;
    candidate -= BigInt(1);
  }
}

async function seedEmployee(
  input: (typeof EMPLOYEES)[number],
  index: number,
  globalIdSeq: number,
) {
  const companyId = COMPANY_IDS[input.company];
  if (!companyId) throw new Error(`Unknown company code: ${input.company}`);

  const hireDate = new Date(input.hireDate);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  let employee = await prisma.employee.findFirst({
    where: { phone: input.phone, deletedAt: null },
  });

  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        id: randomUUID(),
        globalId: formatGlobalId(globalIdSeq),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        hireDate,
        employmentStatus: 'active',
      },
    });
  } else {
    employee = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        hireDate,
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
        effectiveFrom: hireDate,
      },
    });
  }

  let user = await prisma.user.findFirst({
    where: { username: input.phone, deletedAt: null },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: input.phone,
        passwordHash,
        userType: 'human',
        isActive: true,
        employeeId: employee.id,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { employeeId: employee.id, isActive: true },
    });
  }

  let telegram = await prisma.telegramAccount.findFirst({
    where: { userId: user.id, deletedAt: null },
  });
  if (!telegram) {
    const placeholderId = await resolvePlaceholderTelegramUserId(index);
    telegram = await prisma.telegramAccount.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        telegramUserId: placeholderId,
        chatId: placeholderId,
        isActive: true,
      },
    });
  }

  return {
    globalId: employee.globalId,
    employeeId: employee.id,
    userId: user.id,
    username: user.username,
    company: input.company,
    telegramUserId: telegram.telegramUserId.toString(),
    telegramAccountId: telegram.id,
  };
}

async function main() {
  if (EMPLOYEES.length === 0) {
    console.log('No employees in config — edit EMPLOYEES in prisma/seed-employees.ts');
    return;
  }

  console.log(`Seeding ${EMPLOYEES.length} employee(s)...`);

  let seq = await nextGlobalIdSequence();
  const results = [];

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const row = EMPLOYEES[i];
    const existing = await prisma.employee.findFirst({
      where: { phone: row.phone, deletedAt: null },
      select: { globalId: true },
    });

    const useSeq = existing
      ? Number.parseInt(existing.globalId.replace('EMP', ''), 10)
      : seq++;

    const result = await seedEmployee(row, i, useSeq);
    results.push(result);
    console.log(
      `  ✓ ${result.globalId} ${row.firstName} ${row.lastName} @ ${result.company}` +
        ` | login: ${result.username} / ${DEFAULT_PASSWORD}` +
        ` | telegram placeholder: ${result.telegramUserId}`,
    );
  }

  await syncGlobalIdCounter(seq - 1);
  console.log('\nDone:', JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
