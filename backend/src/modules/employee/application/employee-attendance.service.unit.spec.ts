import { EmployeeAttendanceService } from './employee-attendance.service';
import { AttendanceService } from '../../attendance/application/attendance.service';

describe('EmployeeAttendanceService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('delegates to AttendanceService without duplicating calculations', async () => {
    const view = {
      summary: {
        todayStatus: 'working',
        lastCheckInAt: '2026-06-24T01:00:00.000Z',
        lastCheckOutAt: null,
        lateCountMonth: 1,
        breakOverCountMonth: 0,
        absentCountMonth: 0,
        otHoursMonth: 2,
        workingDaysMonth: 10,
        officeDaysMonth: 10,
        wfhDaysMonth: 0,
        holidayDaysMonth: 2,
        leaveDaysMonth: 1,
      },
      history: [{
        id: 'att-1',
        date: '2026-06-24',
        shift: 'day',
        checkInAt: '2026-06-24T01:00:00.000Z',
        checkOutAt: null,
        breakMinutes: 30,
        workedHours: 7.5,
        otHours: 0,
        lateMinutes: 0,
        status: 'working',
        workCategory: 'office',
      }],
    };

    const attendanceService = {
      getEmployeeAttendanceView: jest.fn().mockResolvedValue(view),
    };
    const employeeAccess = {
      assertEmployeeReadable: jest.fn(),
    };

    const service = new EmployeeAttendanceService(
      attendanceService as unknown as AttendanceService,
      employeeAccess as never,
    );

    const result = await service.getAttendance(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
    expect(attendanceService.getEmployeeAttendanceView).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.summary.todayStatus).toBe('working');
    expect(result.history[0].status).toBe('working');
  });
});
