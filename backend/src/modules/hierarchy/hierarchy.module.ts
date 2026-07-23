// ============================================================================
// modules/hierarchy/hierarchy.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { HierarchyService } from './application/hierarchy.service';
import { HierarchyResolverService } from './application/hierarchy-resolver.service';
import { HierarchyValidationService } from './application/hierarchy-validation.service';
import { HIERARCHY_REPOSITORY } from './domain/repositories/hierarchy.repository';
import { PrismaHierarchyRepository } from './infrastructure/persistence/hierarchy.prisma.repository';

@Module({
  providers: [
    HierarchyService,
    HierarchyResolverService,
    HierarchyValidationService,
    { provide: HIERARCHY_REPOSITORY, useClass: PrismaHierarchyRepository },
  ],
  exports: [HierarchyService, HierarchyResolverService],
})
export class HierarchyModule {}
