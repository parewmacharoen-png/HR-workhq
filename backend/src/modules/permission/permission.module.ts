// ============================================================================
// modules/permission/permission.module.ts
// Exports PermissionService and PermissionGuard so other modules can guard
// their routes. Marked @Global so @RequirePermission works app-wide without
// re-importing.
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { PermissionController } from './interface/http/permission.controller';
import { BusinessPermissionController } from './interface/http/business-permission.controller';
import { AccessControlController } from './interface/http/access-control.controller';
import { BackofficeUserController } from './interface/http/backoffice-user.controller';
import { PermissionService } from './application/permission.service';
import { BusinessPermissionService } from './application/business-permission.service';
import { AccessControlService } from './application/access-control.service';
import { BackofficeUserService } from './application/backoffice-user.service';
import { OperatorTelegramInviteService } from './application/operator-telegram-invite.service';
import { SalaryVisibilityService } from './application/salary-visibility.service';
import { PermissionGuard } from './interface/http/permission.guard';
import { CompanyAccessService } from '../../shared/kernel/company-access.service';
import {
  AUTH_CONTEXT_REPOSITORY, ROLE_ASSIGNMENT_REPOSITORY, IMPERSONATION_REPOSITORY,
} from './domain/repositories/permission.repository';
import { BUSINESS_PERMISSION_REPOSITORY } from './domain/repositories/business-permission.repository';
import {
  PrismaAuthContextRepository, PrismaRoleAssignmentRepository, PrismaImpersonationRepository,
} from './infrastructure/persistence/permission.prisma.repository';
import { PrismaBusinessPermissionRepository } from './infrastructure/persistence/business-permission.prisma.repository';

@Global()
@Module({
  controllers: [
    PermissionController,
    BusinessPermissionController,
    AccessControlController,
    BackofficeUserController,
  ],
  providers: [
    PermissionService,
    BusinessPermissionService,
    AccessControlService,
    BackofficeUserService,
    OperatorTelegramInviteService,
    SalaryVisibilityService,
    PermissionGuard,
    CompanyAccessService,
    { provide: AUTH_CONTEXT_REPOSITORY, useClass: PrismaAuthContextRepository },
    { provide: ROLE_ASSIGNMENT_REPOSITORY, useClass: PrismaRoleAssignmentRepository },
    { provide: IMPERSONATION_REPOSITORY, useClass: PrismaImpersonationRepository },
    { provide: BUSINESS_PERMISSION_REPOSITORY, useClass: PrismaBusinessPermissionRepository },
  ],
  exports: [
    PermissionService,
    BusinessPermissionService,
    AccessControlService,
    SalaryVisibilityService,
    OperatorTelegramInviteService,
    PermissionGuard,
    CompanyAccessService,
    AUTH_CONTEXT_REPOSITORY,
    BUSINESS_PERMISSION_REPOSITORY,
  ],
})
export class PermissionModule {}
