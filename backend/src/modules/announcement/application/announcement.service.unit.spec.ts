import { AnnouncementService } from './announcement.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('AnnouncementService', () => {
  const dates = new DateProvider(new BangkokTimeProvider());

  it('returns dashboard widget counts', async () => {
    const prisma = {
      announcement: {
        count: jest.fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(1),
      },
      announcementDelivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            openedAt: null,
            acknowledgedAt: null,
            ackReminderSentAt: null,
            employeeId: 'e1',
            announcementId: 'a1',
            employee: { id: 'e1', firstName: 'A', lastName: 'B' },
            announcement: { mustAcknowledge: true },
          },
        ]),
      },
    } as unknown as PrismaService;

    const audit = { record: jest.fn() } as unknown as AuditService;
    const companyAccess = {
      assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as CompanyAccessService;
    const permissions = { findUserAccess: jest.fn() };
    const reminderNotifier = { sendUnacknowledgedReminder: jest.fn() };

    const service = new AnnouncementService(
      prisma,
      audit,
      companyAccess,
      dates,
      reminderNotifier as never,
      permissions as never,
    );
    const result = await service.getDashboard(
      { userId: 'u-1', companyId: 'co-1', impersonatorUserId: null },
      'co-1',
    );

    expect(result.published).toBe(3);
    expect(result.draft).toBe(1);
    expect(result.unopened).toBe(1);
    expect(result.unacknowledged).toBe(1);
  });
});
