// ============================================================================
// modules/attendance/application/employee-hourly-rate.service.ts
// Resolves hourly wage from current salary band for late deductions.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const HOURS_PER_MONTH = 30 * 8;

@Injectable()
export class EmployeeHourlyRateService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(employeeId: string, companyId: string): Promise<number> {
    const band = await this.prisma.salaryHistory.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { monthlySalary: true },
    });
    if (!band) return 0;
    return Math.round((Number(band.monthlySalary) / HOURS_PER_MONTH) * 100) / 100;
  }
}
