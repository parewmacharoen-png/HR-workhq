/**
 * Verify local time-correction sync via API (login + GET attendance).
 * Run after local-time-correction-demo.ts
 */
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:3000/api/v1';
const EMP_GLOBAL = process.env.DEMO_EMP_GLOBAL ?? 'EMP000001';
const WORK_DATE = '2026-07-05';

async function main(): Promise<void> {
  for (const cred of [
    { username: 'owner', password: 'password' },
    { username: 'admin', password: 'password' },
  ]) {
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred),
    });
    if (loginRes.ok) {
      var accessToken = ((await loginRes.json()) as { accessToken: string }).accessToken;
      console.log(`Logged in as ${cred.username}`);
      break;
    }
  }
  if (!accessToken!) throw new Error('Login failed for owner/admin');

  const prisma = new PrismaClient();
  const emp = await prisma.employee.findFirst({
    where: { globalId: EMP_GLOBAL, deletedAt: null },
  }) ?? await prisma.employee.findFirst({ where: { deletedAt: null }, orderBy: { globalId: 'asc' } });
  if (!emp) throw new Error('No employee in DB');
  const assignment = await prisma.employeeAssignment.findFirst({
    where: { employeeId: emp.id, deletedAt: null, effectiveTo: null },
    orderBy: { isPrimaryCompany: 'desc' },
  });
  await prisma.$disconnect();

  const url = `${API}/employees/${emp.id}/attendance?companyId=${assignment!.companyId}`;
  const viewRes = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!viewRes.ok) throw new Error(`Attendance GET failed ${viewRes.status}: ${await viewRes.text()}`);

  const view = (await viewRes.json()) as {
    history: Array<{ date: string; checkInAt: string | null; checkOutAt: string | null; workedHours: number }>;
  };

  const day = view.history.find((h) => h.date.startsWith(WORK_DATE));
  if (!day) throw new Error(`No history row for ${WORK_DATE}`);

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
    : '—';

  console.log('API attendance after sync:');
  console.log('  checkIn: ', fmt(day.checkInAt));
  console.log('  checkOut:', fmt(day.checkOutAt));
  console.log('  worked:  ', day.workedHours?.toFixed(2), 'h');

  const okOut = fmt(day.checkOutAt) === '21:00';
  const okHours = (day.workedHours ?? 0) > 10;
  if (!okOut || !okHours) {
    throw new Error(`Sync verification FAILED (expected checkout 21:00 and >10h, got ${fmt(day.checkOutAt)} / ${day.workedHours}h)`);
  }
  console.log('\n✅ Local sync verified — approval drift fixed on GET attendance');
}

main().catch((e) => { console.error(e); process.exit(1); });
