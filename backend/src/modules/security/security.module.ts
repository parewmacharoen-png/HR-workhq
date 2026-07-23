// ============================================================================
// modules/security/security.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../../shared/audit/audit.module';
import { RequestModule } from '../request/request.module';
import { TelegramModule } from '../telegram/telegram.module';
import { EmployeeOnboardingModule } from '../employee-onboarding/employee-onboarding.module';
import { TelegramIdentityService } from './application/telegram-identity.service';
import { TelegramIdentityGuard } from './application/telegram-identity-guard.service';
import { TelegramRegistrationIntegrationService } from './application/telegram-registration-integration.service';
import { SecurityController } from './interface/http/security.controller';

@Module({
  imports: [
    AuditModule,
    forwardRef(() => RequestModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => EmployeeOnboardingModule),
  ],
  controllers: [SecurityController],
  providers: [TelegramIdentityService, TelegramIdentityGuard, TelegramRegistrationIntegrationService],
  exports: [TelegramIdentityService, TelegramIdentityGuard, TelegramRegistrationIntegrationService],
})
export class SecurityModule {}
