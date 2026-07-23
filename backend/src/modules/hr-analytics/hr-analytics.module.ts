import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { HrAnalyticsService } from './application/hr-analytics.service';
import { HrDailySnapshotScheduler } from './application/hr-daily-snapshot.scheduler';
import { HrAnalyticsController } from './interface/http/hr-analytics.controller';

@Module({
  imports: [PermissionModule],
  controllers: [HrAnalyticsController],
  providers: [HrAnalyticsService, HrDailySnapshotScheduler],
  exports: [HrAnalyticsService],
})
export class HrAnalyticsModule {}
