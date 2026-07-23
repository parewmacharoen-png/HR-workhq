// ============================================================================
// modules/settings/settings.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { RuleConfigController } from './interface/http/rule-config.controller';
import { SettingsController } from './interface/http/settings.controller';
import { AttendanceSettingsCacheService } from './application/attendance-settings-cache.service';
import { AttendanceSettingsService } from './application/attendance-settings.service';
import { DepositSettingsCacheService } from './application/deposit-settings-cache.service';
import { DepositSettingsService } from './application/deposit-settings.service';
import { LeaveSettingsCacheService } from './application/leave-settings-cache.service';
import { LeaveSettingsService } from './application/leave-settings.service';
import { ReferralSettingsCacheService } from './application/referral-settings-cache.service';
import { ReferralSettingsService } from './application/referral-settings.service';
import { PayrollSettingsCacheService } from './application/payroll-settings-cache.service';
import { PayrollSettingsService } from './application/payroll-settings.service';
import { RuleConfigService } from './application/rule-config.service';
import { SettingsService } from './application/settings.service';

@Module({
  controllers: [RuleConfigController, SettingsController],
  providers: [
    AttendanceSettingsCacheService,
    AttendanceSettingsService,
    DepositSettingsCacheService,
    DepositSettingsService,
    LeaveSettingsCacheService,
    LeaveSettingsService,
    ReferralSettingsCacheService,
    ReferralSettingsService,
    PayrollSettingsCacheService,
    PayrollSettingsService,
    RuleConfigService,
    SettingsService,
  ],
  exports: [
    AttendanceSettingsCacheService,
    AttendanceSettingsService,
    DepositSettingsCacheService,
    DepositSettingsService,
    LeaveSettingsCacheService,
    LeaveSettingsService,
    ReferralSettingsCacheService,
    ReferralSettingsService,
    PayrollSettingsCacheService,
    PayrollSettingsService,
    RuleConfigService,
    SettingsService,
  ],
})
export class SettingsModule {}
