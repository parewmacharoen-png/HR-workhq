// ============================================================================
// shared/prisma/prisma.module.ts
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { PayrollCycleResolverService } from '../payroll/payroll-cycle-resolver.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PayrollCycleResolverService],
  exports: [PrismaService, PayrollCycleResolverService],
})
export class PrismaModule {}
