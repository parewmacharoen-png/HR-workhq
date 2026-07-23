import { AttendanceAlertScheduler } from './attendance-alert.scheduler';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('AttendanceAlertScheduler (unit)', () => {
  const dates = new DateProvider(new BangkokTimeProvider());
  const schedulerTimes = new SchedulerTimeProvider(new BangkokTimeProvider());

  const prisma = {
    company: { findMany: jest.fn().mockResolvedValue([{ id: 'co-1' }]) },
  };
  const alertService = { runForCompany: jest.fn() };
  const lock = {
    acquire: jest.fn().mockResolvedValue(true),
    release: jest.fn(),
  };

  const scheduler = new AttendanceAlertScheduler(
    prisma as never,
    alertService as never,
    lock as never,
    dates,
    schedulerTimes,
  );

  beforeEach(() => jest.clearAllMocks());

  it('runs alert checks for all active companies when lock acquired', async () => {
    await scheduler.runTick(new Date('2026-06-24T03:00:00.000Z'));
    expect(alertService.runForCompany).toHaveBeenCalledWith('co-1', expect.any(Date));
    expect(lock.release).toHaveBeenCalled();
  });

  it('skips when lock not acquired', async () => {
    lock.acquire.mockResolvedValueOnce(false);
    await scheduler.runTick(new Date('2026-06-24T03:00:00.000Z'));
    expect(alertService.runForCompany).not.toHaveBeenCalled();
  });
});
