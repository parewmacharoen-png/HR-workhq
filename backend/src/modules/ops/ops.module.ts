import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { DataExchangeModule } from '../data-exchange/data-exchange.module';
import { OpsService } from './application/ops.service';
import { OpsAccessService } from './application/ops-access.service';
import { OpsController } from './interface/http/ops.controller';

@Module({
  imports: [PermissionModule, OutboxModule, DataExchangeModule],
  controllers: [OpsController],
  providers: [OpsService, OpsAccessService],
  exports: [OpsService],
})
export class OpsModule {}
