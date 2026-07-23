import { AnnouncementReminderScheduler } from './announcement-reminder.scheduler';

describe('AnnouncementReminderScheduler (unit)', () => {
  it('processes 24h unopened and 72h unacknowledged deliveries', async () => {
    const now = new Date('2026-06-24T02:00:00.000Z');
    const unopened = { id: 'd1', announcementId: 'a1' };
    const unack = {
      id: 'd2',
      announcementId: 'a2',
      announcement: { id: 'a2', companyId: 'co-1', title: 'Test' },
    };

    const prisma = {
      announcementDelivery: {
        findMany: jest.fn()
          .mockResolvedValueOnce([unopened])
          .mockResolvedValueOnce([unack])
          .mockResolvedValueOnce([{
            announcementId: 'a2',
            announcement: { companyId: 'co-1', title: 'Test' },
          }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const lock = {
      acquire: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const notifier = {
      sendUnopenedReminder: jest.fn().mockResolvedValue(undefined),
      sendUnacknowledgedReminder: jest.fn().mockResolvedValue(undefined),
      notifyOwnerOverdueEscalation: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const dates = { now: () => now };
    const schedulerTimes = { dateKey: () => '2026-06-24' };

    const scheduler = new AnnouncementReminderScheduler(
      prisma as never,
      lock as never,
      notifier as never,
      audit as never,
      dates as never,
      schedulerTimes as never,
    );

    await scheduler.runDaily(now);

    expect(notifier.sendUnopenedReminder).toHaveBeenCalledWith('d1');
    expect(notifier.sendUnacknowledgedReminder).toHaveBeenCalledWith('d2');
    expect(audit.record).toHaveBeenCalled();
  });
});
