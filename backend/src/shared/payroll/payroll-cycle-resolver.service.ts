// ============================================================================
// shared/payroll/payroll-cycle-resolver.service.ts
// Resolves payroll earn cycles used for KPI counting and commission accrual.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateProvider } from '../time/date.provider';

@Injectable()
export class PayrollCycleResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dates: DateProvider,
  ) {}

  /** Earn cycle whose period contains the given date (defaults to now). */
  async resolveEarnCycleId(companyId: string, asOf?: Date): Promise<string | null> {
    const ref = asOf ?? this.dates.now();
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId,
        deletedAt: null,
        periodStart: { lte: ref },
        periodEnd: { gte: ref },
      },
      orderBy: { periodStart: 'desc' },
    });
    return cycle?.id ?? null;
  }

  /** Current open or locked earn cycle for live KPI / commission views. */
  async resolveOpenEarnCycleId(companyId: string): Promise<string | null> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ['open', 'locked'] },
      },
      orderBy: { periodStart: 'desc' },
    });
    return cycle?.id ?? null;
  }
}
