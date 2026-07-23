// ============================================================================
// modules/telegram/application/brief.service.ts
// Schedules morning (10:30) and evening (23:59) briefs per company.
// Morning brief runs after grace period so check-in stats are meaningful.
// Delegates all metric collection and snapshot persistence to ReportingService,
// then broadcasts the formatted text to Owner Telegram accounts.
// This fixes the broken saveSnapshot upsert that existed in the original version.
// ============================================================================

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { ReportingService } from '../../reporting/application/reporting.service';
import { WorkDayDailyBriefService } from '../../workday/application/workday-daily-brief.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { formatEveningReport, formatMorningReport } from '../domain/telegram-report.formatter';
import type { MorningBriefPayload, EveningBriefPayload } from '../../reporting/domain/entities/dashboard-payloads';

@Injectable()
export class BriefService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BriefService.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private static readonly BRIEF_LOCK_TTL_SEC = 3_600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly reporting: ReportingService,
    private readonly workdayBriefs: WorkDayDailyBriefService,
    private readonly lock: RedisLockService,
    private readonly dates: DateProvider,
    private readonly schedulerTimes: SchedulerTimeProvider,
  ) {}

  onModuleInit(): void {
    this.scheduleDaily('10:30', 'morning', () => this.sendMorningBriefs());
    this.scheduleDaily('23:59', 'evening', () => this.sendEveningBriefs());
  }

  onModuleDestroy(): void {
    this.timers.forEach(clearTimeout);
  }

  private scheduleDaily(time: string, kind: 'morning' | 'evening', fn: () => Promise<void>): void {
    const [h, m] = time.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    const delay = next.getTime() - now.getTime();
    const timer = setTimeout(() => {
      this.runWithLock(kind, fn).catch((err) => this.logger.error('Brief error', err));
      this.scheduleDaily(time, kind, fn);
    }, delay);
    this.timers.push(timer);
  }

  /** Acquire a Redis lock so only one replica broadcasts briefs per day/kind. */
  private async runWithLock(kind: 'morning' | 'evening', fn: () => Promise<void>): Promise<void> {
    const dateKey = this.schedulerTimes.dateKey();
    const lockKey = `workhq:brief:${kind}:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, BriefService.BRIEF_LOCK_TTL_SEC);
    if (!acquired) {
      this.logger.log(`Skipping ${kind} brief — lock held by another replica (${lockKey})`);
      return;
    }
    try {
      await fn();
    } finally {
      await this.lock.release(lockKey);
    }
  }

  async sendMorningBriefs(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
    });
    for (const company of companies) {
      try {
        const payload = await this.reporting.generateMorningBrief(company.id) as unknown as MorningBriefPayload;
        const missingCheckIn = await this.workdayBriefs.buildMissingCheckInBrief(company.id);
        const text = formatMorningReport(payload, company.name, missingCheckIn.lines);
        await this.broadcastToOwners(company.id, text);
      } catch (err) {
        this.logger.error(`Morning brief failed for ${company.name}`, err);
      }
    }
  }

  async sendEveningBriefs(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
    });
    for (const company of companies) {
      try {
        const payload = await this.reporting.generateEveningBrief(company.id) as unknown as EveningBriefPayload;
        const missingCheckOut = await this.workdayBriefs.buildMissingCheckOutBrief(company.id);
        const text = formatEveningReport(payload, company.name, missingCheckOut.lines);
        await this.broadcastToOwners(company.id, text);
      } catch (err) {
        this.logger.error(`Evening brief failed for ${company.name}`, err);
      }
    }
  }

  private async broadcastToOwners(companyId: string, text: string): Promise<void> {
    const owners = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: {
            deletedAt: null,
            role: { code: { in: ['owner', 'super_admin'] } },
          },
        },
        scopeGrants: {
          some: {
            deletedAt: null,
            OR: [
              { scopeType: 'all' },
              { scopeType: 'company', companyId },
            ],
          },
        },
      },
      include: {
        telegramAccounts: { where: { isActive: true, deletedAt: null } },
      },
    });
    for (const user of owners) {
      for (const acc of user.telegramAccounts) {
        if (acc.chatId) {
          await this.gateway.sendMessage({
            chatId: Number(acc.chatId),
            text,
            parseMode: 'HTML',
          });
        }
      }
    }
  }
}
