// ============================================================================
// modules/attendance/application/shift-assignment.service.unit.spec.ts
// ============================================================================

import { ShiftAssignmentService } from './shift-assignment.service';
import { parseWorkDateIso } from '../domain/services/shift-assignment.domain';

describe('ShiftAssignmentService.scheduleAssignment (mark recalculation)', () => {
  const prisma: {
    shift: { findFirst: jest.Mock };
    employeeAssignment: { findFirst: jest.Mock };
    employeeShiftAssignment: { findMany: jest.Mock; update: jest.Mock; create: jest.Mock };
    attendanceRecord: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  } = {
    shift: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
    employeeShiftAssignment: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    attendanceRecord: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma));
  const audit = { record: jest.fn() };
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const time = { workDate: () => parseWorkDateIso('2026-06-20'), workDateString: () => '2026-06-20' };
  const attendanceSettings = { getRules: jest.fn() };

  const service = new ShiftAssignmentService(
    prisma as never,
    attendanceSettings as never,
    time as never,
    audit as never,
    companyAccess as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.shift.findFirst.mockResolvedValue({
      id: 'shift-1',
      name: 'Night',
      companyId: 'co-1',
    });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ id: 'asg-1' });
    prisma.employeeShiftAssignment.findMany.mockResolvedValue([
      {
        id: 'old-1',
        shiftId: 'shift-day',
        effectiveFrom: parseWorkDateIso('2026-06-01'),
        effectiveTo: null,
        reason: null,
        assignedById: null,
        createdAt: new Date(),
        shift: {
          id: 'shift-day',
          name: 'Day',
          startMinutes: 540,
          endMinutes: 1260,
          crossesMidnight: false,
        },
      },
    ]);
    prisma.employeeShiftAssignment.update.mockResolvedValue({});
    prisma.employeeShiftAssignment.create.mockResolvedValue({});
    prisma.attendanceRecord.updateMany.mockResolvedValue({ count: 2 });
  });

  it('marks existing attendance in range as needsRecalculation without rewriting values', async () => {
    await service.scheduleAssignment(
      { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' },
      {
        employeeId: 'emp-1',
        companyId: 'co-1',
        shiftId: 'shift-1',
        effectiveFrom: '2026-06-15',
        reason: 'Monthly rotation',
      },
    );

    expect(prisma.attendanceRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'emp-1',
          checkInAt: { not: null },
          workDate: { gte: parseWorkDateIso('2026-06-15') },
        }),
        data: { needsRecalculation: true, updatedBy: 'user-1' },
      }),
    );
    expect(prisma.employeeShiftAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-1' },
        data: { effectiveTo: parseWorkDateIso('2026-06-14') },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'shift_assignment_scheduled',
        after: expect.objectContaining({
          shiftId: 'shift-1',
          effectiveFrom: '2026-06-15',
          changedBy: 'user-1',
          reason: 'Monthly rotation',
        }),
      }),
    );
  });
});
