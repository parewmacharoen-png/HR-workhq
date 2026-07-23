import { Module } from '@nestjs/common';
import { MonitoringModule } from '../../common/monitoring/monitoring.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { SystemController } from './interface/http/system.controller';

@Module({
  imports: [PrismaModule, MonitoringModule],
  controllers: [SystemController],
})
export class SystemModule {}
