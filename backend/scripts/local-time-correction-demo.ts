/**
 * Local dev: seed July 5 broken attendance + approved time_correction request.
 * API sync runs on startup / GET attendance view.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/local-time-correction-demo.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { combineBangkokWorkDateAndTime } from '../src/shared/time/thai-time-input.util';
import { bangkokTimeKey } from '../src/shared/time/time-correction-field.util';

const prisma = new PrismaClient();
const WORK_DATE = '2026-07-05';
const EMP_GLOBAL = process.env.DEMO_EMP_GLOBAL ?? 'EMP000001';

async function resolveEmployee() {
  const byGlobal = await prisma.employee.findFirst({
    where: { globalId: EMP_GLOBAL, deletedAt: null },
  });
  if (byGlobal) return byGlobal;
  const fallback = await prisma.employee.findFirst({
    where: { deletedAt: null },
    orderBy: { globalId: 'asc' },
  });
  if (!fallback) throw new Error('No employees in DB — run seed first');
  console.warn(`Employee ${EMP_GLOBAL} not found — using ${fallback.globalId}`);
  return fallback;
}

async function main(): Promise<void> {
  const emp = await resolveEmployee();

  const assignment = await prisma.employeeAssignment.findFirst({
    where: { employeeId: emp.id, deletedAt: null, effectiveTo: null },
    include: { company: true },
    orderBy: { isPrimaryCompany: 'desc' },
  });
  if (!assignment) throw new Error('No active company assignment');

  const companyId = assignment.companyId;
  console.log(`Employee: ${emp.firstName} ${emp.lastName} @ ${assignment.company.code}`);

  const workDate = new Date(`${WORK_DATE}T00:00:00.000Z`);
  const checkInAt = combineBangkokWorkDateAndTime(WORK_DATE, '09:15')!;
  // Legacy UTC bug: 21:00 stored as UTC → displays 04:00 Bangkok, workedMinutes stuck at 0
  const wrongCheckOut = new Date(`${WORK_DATE}T21:00:00.000Z`);

  let record = await prisma.attendanceRecord.findFirst({
    where: { employeeId: emp.id, companyId, workDate, deletedAt: null },
  });

  const recordData = {
    checkInAt,
    checkOutAt: wrongCheckOut,
    workedMinutes: 0,
    totalBreakMinutes: 62,
    breakDeduction: 83.34,
    status: 'present' as const,
    workCategory: 'wfh',
    updatedBy: emp.id,
  };

  if (record) {
    await prisma.attendanceRecord.update({ where: { id: record.id }, data: recordData });
  } else {
    record = await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: emp.id,
        companyId,
        workDate,
        source: 'telegram',
        createdBy: emp.id,
        ...recordData,
      },
    });
  }

  const requestType = await prisma.requestType.findFirst({
    where: { key: 'time_correction', deletedAt: null },
  });
  if (!requestType) throw new Error('time_correction type missing');

  const version = await prisma.requestTypeVersion.findFirst({
    where: { requestTypeId: requestType.id, status: 'published' },
    orderBy: { versionNumber: 'desc' },
  });
  if (!version) throw new Error('No published time_correction version');

  // Remove old corrections for clean demo
  await prisma.attendanceCorrection.updateMany({
    where: { attendanceRecordId: record.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  const requestId = randomUUID();
  await prisma.requestInstance.create({
    data: {
      id: requestId,
      companyId,
      requestTypeId: requestType.id,
      requestTypeVersionId: version.id,
      requesterEmployeeId: emp.id,
      title: 'แก้ checkout 21:00 (local demo)',
      status: 'approved',
      approvedAt: new Date(),
      integrationStatus: 'completed',
      integrationEntityId: null,
      integrationError: 'simulated drift — completed but not applied',
      submittedAt: new Date(),
      values: {
        create: [
          { id: randomUUID(), fieldKey: 'attendanceDate', fieldLabelSnapshot: 'วันที่', fieldTypeSnapshot: 'quick_date', valueText: WORK_DATE, valueJson: WORK_DATE },
          { id: randomUUID(), fieldKey: 'correctionType', fieldLabelSnapshot: 'ประเภท', fieldTypeSnapshot: 'select', valueText: 'missed_out', valueJson: 'missed_out' },
          { id: randomUUID(), fieldKey: 'requestedTime', fieldLabelSnapshot: 'เวลา', fieldTypeSnapshot: 'quick_time', valueText: '21:00', valueJson: '21:00' },
          { id: randomUUID(), fieldKey: 'reason', fieldLabelSnapshot: 'เหตุผล', fieldTypeSnapshot: 'text', valueText: 'ลืมเช็คเอาท์', valueJson: 'ลืมเช็คเอาท์' },
        ],
      },
    },
  });

  const row = await prisma.attendanceRecord.findFirst({ where: { id: record.id } });
  console.log('\nSeeded broken state (refresh attendance page to trigger sync):');
  console.log('  recordId:', record.id);
  console.log('  requestId:', requestId);
  console.log('  checkIn:  ', bangkokTimeKey(row?.checkInAt ?? null));
  console.log('  checkOut: ', bangkokTimeKey(row?.checkOutAt ?? null), '← should become 21:00');
  console.log('  worked:   ', row?.workedMinutes, 'min ← should become ~645min');
  console.log('\nTest: http://localhost:8080 → login admin/password → attendance → 5 Jul 2026');
  console.log(`  employee globalId: ${emp.globalId}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
