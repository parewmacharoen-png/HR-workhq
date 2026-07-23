// ============================================================================
// modules/referral/referral.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ReferralController } from './interface/http/referral.controller';
import { ReferralService } from './application/referral.service';
import {
  REFERRAL_REPOSITORY, DUPLICATE_CHECK_REPOSITORY,
  REFERRAL_EMPLOYEE_REPOSITORY, REFERRAL_PAYROLL_REPOSITORY,
  REFERRAL_ANALYTICS_REPOSITORY,
} from './domain/repositories/referral.repository';
import {
  PrismaReferralRepository, PrismaDuplicateCheckRepository,
  PrismaReferralEmployeeRepository, PrismaReferralPayrollRepository,
  PrismaReferralAnalyticsRepository,
} from './infrastructure/persistence/referral.prisma.repository';

@Module({
  imports: [SettingsModule],
  controllers: [ReferralController],
  providers: [
    ReferralService,
    { provide: REFERRAL_REPOSITORY,            useClass: PrismaReferralRepository },
    { provide: DUPLICATE_CHECK_REPOSITORY,     useClass: PrismaDuplicateCheckRepository },
    { provide: REFERRAL_EMPLOYEE_REPOSITORY,   useClass: PrismaReferralEmployeeRepository },
    { provide: REFERRAL_PAYROLL_REPOSITORY,    useClass: PrismaReferralPayrollRepository },
    { provide: REFERRAL_ANALYTICS_REPOSITORY,  useClass: PrismaReferralAnalyticsRepository },
  ],
  exports: [ReferralService, REFERRAL_PAYROLL_REPOSITORY],
})
export class ReferralModule {}
