// ============================================================================
// shared/time/time.module.ts
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { BangkokTimeProvider } from './bangkok-time.provider';
import { DateProvider } from './date.provider';
import { SchedulerTimeProvider } from './scheduler-time.provider';

@Global()
@Module({
  providers: [BangkokTimeProvider, DateProvider, SchedulerTimeProvider],
  exports: [BangkokTimeProvider, DateProvider, SchedulerTimeProvider],
})
export class TimeModule {}
