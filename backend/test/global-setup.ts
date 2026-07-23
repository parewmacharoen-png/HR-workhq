// ============================================================================
// test/global-setup.ts
// Prepares the PostgreSQL test database once before integration tests run.
// ============================================================================

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '..');

const APPLICATION_SCHEMAS = [
  'organization',
  'employee',
  'permission',
  'attendance',
  'leave',
  'workflow',
  'payroll',
  'commission',
  'finance',
  'performance',
  'recruitment',
  'referral',
  'training',
  'assets',
  'knowledge',
  'ai',
  'reporting',
  'telegram',
  'marketing',
  'system',
] as const;

async function resetApplicationData(client: Client): Promise<void> {
  for (const schema of APPLICATION_SCHEMAS) {
    const { rows } = await client.query<{ tablename: string }>(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1',
      [schema],
    );
    if (rows.length === 0) continue;

    const tableList = rows
      .map((row) => `"${schema}"."${row.tablename}"`)
      .join(', ');
    await client.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
  }
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for integration tests');
  }

  process.env['NODE_ENV'] = 'test';
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'integration_test_jwt_secret_32chars';
  process.env['TELEGRAM_WEBHOOK_SECRET'] = process.env['TELEGRAM_WEBHOOK_SECRET'] ?? 'test-webhook-secret';
  process.env['SENTRY_DSN'] = '';

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const initSql = readFileSync(
      join(REPO_ROOT, 'docker/postgres/init-schemas.sql'),
      'utf8',
    );
    await client.query(initSql);
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy --schema=../prisma/schema.prisma', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  const resetClient = new Client({ connectionString: databaseUrl });
  await resetClient.connect();
  try {
    await resetApplicationData(resetClient);
  } finally {
    await resetClient.end();
  }

  execSync('npx ts-node --project tsconfig.json prisma/seed.ts', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}
