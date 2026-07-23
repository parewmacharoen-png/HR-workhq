// ============================================================================
// modules/settings/settings.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { RuleConfigController } from './interface/http/rule-config.controller';
import { RuleConfigService } from './application/rule-config.service';

@Module({
  controllers: [RuleConfigController],
  providers: [RuleConfigService],
  exports: [RuleConfigService],
})
export class SettingsModule {}
