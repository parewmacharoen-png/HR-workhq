// ============================================================================
// modules/organization/organization.module.ts
// Binds repository ports (Symbols) to their Prisma adapters.
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { PayrollModule } from '../payroll/payroll.module';
import { OrganizationController } from './interface/http/organization.controller';
import { OrganizationService } from './application/organization.service';
import { OrganizationBootstrapService } from './application/organization-bootstrap.service';
import {
  COMPANY_REPOSITORY, TEAM_REPOSITORY, FUNCTION_REPOSITORY,
} from './domain/repositories/organization.repository';
import {
  PrismaCompanyRepository, PrismaTeamRepository, PrismaFunctionRepository,
} from './infrastructure/persistence/organization.prisma.repository';

@Module({
  imports: [HierarchyModule, forwardRef(() => PayrollModule)],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationBootstrapService,
    { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository },
    { provide: TEAM_REPOSITORY, useClass: PrismaTeamRepository },
    { provide: FUNCTION_REPOSITORY, useClass: PrismaFunctionRepository },
  ],
  exports: [OrganizationService],
})
export class OrganizationModule {}
