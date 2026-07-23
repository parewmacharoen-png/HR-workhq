// ============================================================================
// modules/telegram/application/company-code-cache.service.ts
// In-memory cache of active company codes → ids loaded from the database.
// Refreshes on startup and periodically so onboarding never relies on hardcoded UUIDs.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class CompanyCodeCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyCodeCacheService.name);
  private readonly REFRESH_MS = 5 * 60 * 1000;

  private map = new Map<string, string>();
  private codes: string[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => this.logger.error('Company cache refresh failed', err));
    }, this.REFRESH_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });

    const next = new Map<string, string>();
    const codes: string[] = [];
    for (const company of companies) {
      const code = company.code.trim().toUpperCase();
      if (!code) continue;
      next.set(code, company.id);
      codes.push(code);
    }

    this.map = next;
    this.codes = codes;
    this.logger.log(`Company cache refreshed (${codes.length} active companies)`);
  }

  getIdByCode(code: string): string | undefined {
    return this.map.get(code.trim().toUpperCase());
  }

  isKnownCode(code: string): boolean {
    return this.map.has(code.trim().toUpperCase());
  }

  getActiveCodes(): readonly string[] {
    return this.codes;
  }
}
