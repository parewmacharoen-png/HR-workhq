import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ensureMarketingTeamsForCompany } from './marketing-teams.bootstrap';

/** Ensures default Marketing teams exist for every active company on API startup. */
@Injectable()
export class OrganizationBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, code: true },
    });
    for (const company of companies) {
      try {
        await ensureMarketingTeamsForCompany(this.prisma, company.id);
      } catch (err) {
        this.logger.warn(`Marketing teams bootstrap failed for ${company.code}: ${(err as Error).message}`);
      }
    }
    if (companies.length > 0) {
      this.logger.log(`Marketing teams ensured for ${companies.length} company(ies)`);
    }
  }
}
