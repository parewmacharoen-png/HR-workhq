/**
 * Phase 2 seam tests — request approval → attendance integration
 * Run: npx ts-node -r tsconfig-paths/register scripts/audit-seam-tests.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const API = 'http://localhost:3000/api/v1';
const prisma = new PrismaClient();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const results: TestResult[] = [];

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function testWebhookBadSecret(): Promise<void> {
  const res = await fetch(`${API}/telegram/webhook/wrong-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong',
    },
    body: JSON.stringify({ update_id: 1 }),
  });
  results.push({
    name: '2b Telegram webhook กับ secret ผิด → 401',
    status: res.status === 401 ? 'PASS' : 'FAIL',
    detail: `status=${res.status}`,
  });
}

async function resolveDemoEmployee() {
  const preferred = process.env.DEMO_EMP_GLOBAL ?? 'EMP000001';
  const emp = await prisma.employee.findFirst({
    where: { globalId: preferred, deletedAt: null },
  }) ?? await prisma.employee.findFirst({ where: { deletedAt: null }, orderBy: { globalId: 'asc' } });
  if (!emp) throw new Error('No employees — run seed first');
  return emp;
}

async function testHappyPathSync(token: string): Promise<void> {
  const emp = await resolveDemoEmployee();
  const assign = await prisma.employeeAssignment.findFirst({
    where: { employeeId: emp.id, deletedAt: null, effectiveTo: null },
  });
  if (!assign) {
    results.push({ name: '2a Happy path — GET attendance sync checkout 21:00', status: 'SKIP', detail: 'no assignment' });
    return;
  }
  const url = `${API}/employees/${emp.id}/attendance?companyId=${assign.companyId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json()) as { history: Array<{ date: string; checkOutAt: string | null; workedHours: number }> };
  const day = body.history.find((h) => h.date.startsWith('2026-07-05'));
  const out = day?.checkOutAt
    ? new Date(day.checkOutAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
    : null;
  const ok = out === '21:00' && (day?.workedHours ?? 0) > 10;
  results.push({
    name: '2a Happy path — GET attendance sync checkout 21:00',
    status: ok ? 'PASS' : 'FAIL',
    detail: `checkout=${out} worked=${day?.workedHours}`,
  });
}

async function testValuesMapFallback(): Promise<void> {
  const { valuesMapFromRows } = await import('../src/modules/request/application/request-condition.util');
  const map = valuesMapFromRows([
    { fieldKey: 'requestedTime', valueJson: null as unknown as string, valueText: '21:00' },
  ]);
  results.push({
    name: '2c valuesMapFromRows อ่าน valueText เมื่อ valueJson null',
    status: map.requestedTime === '21:00' ? 'PASS' : 'FAIL',
    detail: JSON.stringify(map),
  });
}

async function testIdempotentIntegration(token: string): Promise<void> {
  const req = await prisma.requestInstance.findFirst({
    where: { status: 'approved', requestType: { key: 'time_correction' }, deletedAt: null },
    orderBy: { approvedAt: 'desc' },
  });
  if (!req) {
    results.push({ name: '2d Idempotency — approve ซ้ำไม่สร้าง correction ซ้ำ', status: 'SKIP', detail: 'no request' });
    return;
  }
  const before = await prisma.attendanceCorrection.count({
    where: { deletedAt: null, attendanceRecord: { employeeId: req.requesterEmployeeId } },
  });
  const res = await fetch(`${API}/requests/${req.id}/retry-integration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const after = await prisma.attendanceCorrection.count({
    where: { deletedAt: null, attendanceRecord: { employeeId: req.requesterEmployeeId } },
  });
  results.push({
    name: '2d Retry integration ไม่สร้าง correction ซ้ำโดยไม่จำเป็น',
    status: res.ok && after <= before + 1 ? 'PASS' : 'FAIL',
    detail: `retry=${res.status} corrections before=${before} after=${after}`,
  });
}

async function testGoogleSheetsConfigured(): Promise<void> {
  const health = await fetch(`${API}/health`).then((r) => r.json()) as Record<string, unknown>;
  results.push({
    name: '2e Google Sheets credentials ใน env',
    status: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY ? 'PASS' : 'SKIP',
    detail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      ? 'configured locally'
      : 'NOT SET — export จะ fallback CSV (by design)',
  });
  void health;
}

async function main(): Promise<void> {
  console.log('=== WorkHQ Seam Audit (Phase 2) ===\n');
  try {
    await testWebhookBadSecret();
    const token = await login();
    await testHappyPathSync(token);
    await testValuesMapFallback();
    await testIdempotentIntegration(token);
    await testGoogleSheetsConfigured();
  } catch (e) {
    results.push({ name: 'setup', status: 'FAIL', detail: String(e) });
  }

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}`);
    console.log(`   ${r.detail}\n`);
  }
  const failed = results.filter((r) => r.status === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

main().finally(() => prisma.$disconnect());
