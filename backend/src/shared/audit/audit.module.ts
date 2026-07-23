// ============================================================================
// shared/audit/audit.module.ts
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { PermissionModule } from '../../modules/permission/permission.module';
import { AuditService } from './audit.service';
import { AuditExplorerService } from './audit-explorer.service';
import { AuditExplorerController } from './audit-explorer.controller';

@Global()
@Module({
  imports: [PermissionModule],
  controllers: [AuditExplorerController],
  providers: [AuditService, AuditExplorerService],
  exports: [AuditService, AuditExplorerService],
})
export class AuditModule {}
