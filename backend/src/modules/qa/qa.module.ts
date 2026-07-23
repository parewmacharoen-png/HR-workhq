import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { QaReadinessService } from './application/qa-readiness.service';
import { QaEvidenceService } from './application/qa-evidence.service';
import { QaTraceabilityService } from './application/qa-traceability.service';
import { QaController } from './interface/http/qa.controller';

@Module({
  imports: [PermissionModule],
  controllers: [QaController],
  providers: [QaReadinessService, QaEvidenceService, QaTraceabilityService],
  exports: [QaReadinessService, QaEvidenceService, QaTraceabilityService],
})
export class QaModule {}
