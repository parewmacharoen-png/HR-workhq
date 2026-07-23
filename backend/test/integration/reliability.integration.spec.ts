// ============================================================================
// test/integration/reliability.integration.spec.ts
// Reliability & operations: outbox locking, migration singleton, backup/restore.
// ============================================================================

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { AlertingService } from '../../src/common/monitoring/alerting.service';
import { OutboxDispatcherService } from '../../src/common/outbox/outbox-dispatcher.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PrismaModule } from '../../src/shared/prisma/prisma.module';

const BACKEND_ROOT = join(__dirname, '../..');
const MONOREPO_ROOT = join(BACKEND_ROOT, '..');
const BACKUP_SCRIPT = join(MONOREPO_ROOT, 'docker/backup/backup.sh');
const RESTORE_SCRIPT = join(MONOREPO_ROOT, 'docker/backup/restore.sh');

function pgToolsAvailable(): boolean {
  if (pgDumpAvailable()) return true;
  try {
    execSync('docker run --rm postgres:16-bookworm pg_dump --version', { stdio: 'pipe', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

function runBackupScript(databaseUrl: string, backupDir: string): void {
  if (pgDumpAvailable()) {
    execSync(`bash "${BACKUP_SCRIPT}"`, {
      cwd: MONOREPO_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl, BACKUP_DIR: backupDir },
      stdio: 'pipe',
    });
    return;
  }
  execSync(
    `docker run --rm --network host ` +
      `-v "${backupDir}:/backups" ` +
      `-v "${BACKUP_SCRIPT}:/backup.sh:ro" ` +
      `-e DATABASE_URL="${databaseUrl}" ` +
      `-e BACKUP_DIR=/backups ` +
      `postgres:16-bookworm bash /backup.sh`,
    { stdio: 'pipe', timeout: 120_000 },
  );
}

function runRestoreScript(dumpPath: string, restoreUrl: string): void {
  if (pgDumpAvailable()) {
    execSync(`bash "${RESTORE_SCRIPT}" "${dumpPath}" "${restoreUrl}"`, {
      cwd: MONOREPO_ROOT,
      env: { ...process.env, DROP_SCHEMAS: 'true' },
      stdio: 'pipe',
    });
    return;
  }
  execSync(
    `docker run --rm --network host ` +
      `-v "${dumpPath}:/dump:ro" ` +
      `-v "${RESTORE_SCRIPT}:/restore.sh:ro" ` +
      `-e RESTORE_DATABASE_URL="${restoreUrl}" ` +
      `-e DROP_SCHEMAS=true ` +
      `postgres:16-bookworm bash /restore.sh /dump "${restoreUrl}"`,
    { stdio: 'pipe', timeout: 180_000 },
  );
}

function countAuthTables(restoreUrl: string): number {
  const query =
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'permission'";
  if (pgDumpAvailable()) {
    const out = execSync(`psql "${restoreUrl}" -tAc "${query}"`, { encoding: 'utf8' }).trim();
    return Number(out);
  }
  const out = execSync(
    `docker run --rm --network host postgres:16-bookworm ` +
      `psql "${restoreUrl}" -tAc "${query}"`,
    { encoding: 'utf8', timeout: 60_000 },
  ).trim();
  return Number(out);
}

function pgDumpAvailable(): boolean {
  try {
    execSync('pg_dump --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function adminDatabaseUrl(url: string): string {
  return url.replace(/\/([^/?]+)(\?.*)?$/, '/postgres$2');
}

function restoreVerifyDatabaseUrl(url: string): string {
  return url.replace(/\/([^/?]+)(\?.*)?$/, '/workhq_restore_verify$2');
}

async function ensureRestoreDatabase(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('DROP DATABASE IF EXISTS workhq_restore_verify');
    await client.query('CREATE DATABASE workhq_restore_verify');
  } finally {
    await client.end();
  }
}

describe('Reliability & operations (integration)', () => {
  describe('outbox event processed once', () => {
    let prisma: PrismaService;
    let dispatcher: OutboxDispatcherService;
    let handleCount = 0;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [PrismaModule],
        providers: [
          OutboxDispatcherService,
          {
            provide: AlertingService,
            useValue: {
              isWorkflowEvent: () => false,
              isPayrollEntity: () => false,
              workflowFailure: () => undefined,
              payrollFailure: () => undefined,
              outboxRetryStorm: () => undefined,
            },
          },
        ],
      }).compile();

      prisma = moduleRef.get(PrismaService);
      dispatcher = moduleRef.get(OutboxDispatcherService);
      dispatcher.registerHandler({
        handles: ['reliability.test'],
        handle: async () => {
          handleCount += 1;
          await new Promise((r) => setTimeout(r, 200));
        },
      });
    });

    beforeEach(async () => {
      handleCount = 0;
      await prisma.outboxEvent.deleteMany({
        where: { eventType: 'reliability.test' },
      });
    });

    it('processes a single event exactly once under concurrent dispatch', async () => {
      const eventId = randomUUID();
      await prisma.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'test',
          aggregateId: randomUUID(),
          eventType: 'reliability.test',
          payload: { probe: true },
        },
      });

      const pending = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
      expect(pending?.processedAt).toBeNull();

      const results = await Promise.all(
        Array.from({ length: 8 }, () => dispatcher.processOneEventForTest()),
      );

      expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
      expect(handleCount).toBe(1);

      const row = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
      expect(row?.processedAt).not.toBeNull();
      expect(row?.attempts).toBe(1);
    });

    it('SKIP LOCKED allows only one concurrent claim per row', async () => {
      const eventId = randomUUID();
      await prisma.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'test',
          aggregateId: randomUUID(),
          eventType: 'reliability.test',
          payload: {},
        },
      });

      const claims = await Promise.all(
        Array.from({ length: 6 }, () =>
          prisma.$transaction(
            async (tx) => {
              const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
                `SELECT id FROM system.outbox_events
                 WHERE processed_at IS NULL AND id = $1::uuid
                 FOR UPDATE SKIP LOCKED`,
                eventId,
              );
              if (rows.length > 0) {
                await new Promise((r) => setTimeout(r, 200));
              }
              return rows.length;
            },
            { timeout: 10_000 },
          ),
        ),
      );

      expect(claims.reduce((a, b) => a + b, 0)).toBe(1);
    });
  });

  describe('migration runner singleton', () => {
    it('API image does not run migrations on startup', () => {
      const dockerfile = readFileSync(join(MONOREPO_ROOT, 'Dockerfile'), 'utf8');
      expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
      expect(dockerfile).not.toMatch(/migrate deploy.*main\.js/);
    });

    it('compose defines one-shot migrate service before API', () => {
      const compose = readFileSync(join(MONOREPO_ROOT, 'docker-compose.yml'), 'utf8');
      expect(compose).toMatch(/^\s*migrate:/m);
      expect(compose).toMatch(/restart:\s*"no"/);
      expect(compose).toMatch(/service_completed_successfully/);
      expect(compose).toMatch(/Dockerfile\.migrate/);
    });

    it('migrate deploy is idempotent (safe to run twice)', () => {
      execSync('npx prisma migrate deploy --schema=../prisma/schema.prisma', {
        cwd: BACKEND_ROOT,
        stdio: 'pipe',
        env: process.env,
      });
      const second = execSync('npx prisma migrate deploy --schema=../prisma/schema.prisma', {
        cwd: BACKEND_ROOT,
        stdio: 'pipe',
        env: process.env,
      }).toString();
      expect(second).toMatch(/No pending migrations|All migrations have already been applied/i);
    });
  });

  const describeWithPgTools = pgToolsAvailable() ? describe : describe.skip;

  describeWithPgTools('backup script', () => {
    let backupDir: string;

    beforeEach(() => {
      backupDir = mkdtempSync(join(tmpdir(), 'workhq-backup-'));
    });

    afterEach(() => {
      rmSync(backupDir, { recursive: true, force: true });
    });

    it('executes and writes a custom-format dump', () => {
      runBackupScript(process.env['DATABASE_URL']!, backupDir);

      const dumps = readdirSync(backupDir).filter((f) => f.endsWith('.dump'));
      expect(dumps.length).toBe(1);
      expect(existsSync(join(backupDir, dumps[0]!))).toBe(true);
    });
  });

  describeWithPgTools('restore script', () => {
    let backupDir: string;
    let dumpPath: string;
    const databaseUrl = process.env['DATABASE_URL']!;

    beforeAll(async () => {
      backupDir = mkdtempSync(join(tmpdir(), 'workhq-restore-'));
      runBackupScript(databaseUrl, backupDir);
      const dumps = readdirSync(backupDir).filter((f) => f.endsWith('.dump'));
      dumpPath = join(backupDir, dumps[0]!);
      await ensureRestoreDatabase(adminDatabaseUrl(databaseUrl));
    });

    afterAll(() => {
      rmSync(backupDir, { recursive: true, force: true });
    });

    it('executes and verifies restore into a clean database', () => {
      const restoreUrl = restoreVerifyDatabaseUrl(databaseUrl);
      runRestoreScript(dumpPath, restoreUrl);

      expect(countAuthTables(restoreUrl)).toBeGreaterThan(0);
    });
  });
});
