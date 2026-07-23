// ============================================================================
// modules/position-framework/application/employee-position.service.ts
// Platform Consolidation PART A — employee position assignments
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeNotFoundError } from '../../employee/domain/errors/employee.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import { PositionFrameworkValidationError } from '../domain/errors/position-framework.errors';
import {
  BulkPositionUpdateDto,
  EmployeeCareerPathResponse,
  MigratePositionsDto,
  MissingPositionAssignmentItem,
  MissingPositionAssignmentsDashboard,
  PositionSummary,
  UpdateEmployeePositionDto,
} from './dto/position-framework.dto';
import { CareerPathService } from './career-path.service';
import { PromotionPathService } from './promotion-path.service';
import { PositionDefinitionService } from './position-definition.service';

@Injectable()
export class EmployeePositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly audit: AuditService,
    private readonly careerPaths: CareerPathService,
    private readonly promotionPaths: PromotionPathService,
    private readonly positionDefinitions: PositionDefinitionService,
  ) {}

  async listMissingAssignments(
    actor: ActorContext,
    companyId: string,
  ): Promise<MissingPositionAssignmentItem[]> {
    await this.access.assertCanView(actor, companyId);

    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        positionDefinitionId: null,
        employmentStatus: { not: 'terminated' },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
      },
      orderBy: { globalId: 'asc' },
    });

    return rows.map((row) => ({
      employeeId: row.id,
      globalId: row.globalId,
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      legacyPosition: row.position,
    }));
  }

  async getMissingAssignmentsDashboard(
    actor: ActorContext,
    companyId: string,
  ): Promise<MissingPositionAssignmentsDashboard> {
    const items = await this.listMissingAssignments(actor, companyId);
    return {
      companyId,
      total: items.length,
      items: items.slice(0, 50),
    };
  }

  async updateEmployeePosition(
    actor: ActorContext,
    employeeId: string,
    dto: UpdateEmployeePositionDto,
  ): Promise<void> {
    const employee = await this.getEmployeeOrThrow(employeeId);
    const companyId = await this.resolvePrimaryCompanyId(employeeId);
    await this.access.assertCanManage(actor, companyId);
    await this.validatePositionRefs(companyId, dto);

    const before = {
      positionFamilyId: employee.positionFamilyId,
      positionLevelId: employee.positionLevelId,
      positionDefinitionId: employee.positionDefinitionId,
    };

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        positionFamilyId: dto.positionFamilyId !== undefined ? dto.positionFamilyId : employee.positionFamilyId,
        positionLevelId: dto.positionLevelId !== undefined ? dto.positionLevelId : employee.positionLevelId,
        positionDefinitionId: dto.positionDefinitionId !== undefined
          ? dto.positionDefinitionId
          : employee.positionDefinitionId,
        updatedBy: actor.userId,
      },
    });

    const action = before.positionDefinitionId ? 'position_changed' : 'position_assigned';
    await this.audit.record(actor, {
      entityType: 'employee',
      entityId: employeeId,
      action,
      before,
      after: {
        positionFamilyId: dto.positionFamilyId ?? before.positionFamilyId,
        positionLevelId: dto.positionLevelId ?? before.positionLevelId,
        positionDefinitionId: dto.positionDefinitionId ?? before.positionDefinitionId,
      },
    });
  }

  async bulkPositionUpdate(actor: ActorContext, dto: BulkPositionUpdateDto): Promise<{ updated: number }> {
    await this.access.assertCanManage(actor, dto.companyId);
    await this.validatePositionRefs(dto.companyId, dto);

    let updated = 0;
    for (const employeeId of dto.employeeIds) {
      await this.assertEmployeeInCompany(employeeId, dto.companyId);
      await this.updateEmployeePosition(actor, employeeId, {
        positionFamilyId: dto.positionFamilyId,
        positionLevelId: dto.positionLevelId,
        positionDefinitionId: dto.positionDefinitionId,
      });
      updated += 1;
    }

    return { updated };
  }

  async migratePositions(actor: ActorContext, dto: MigratePositionsDto): Promise<{ migrated: number }> {
    await this.access.assertCanManage(actor, dto.companyId);

    let migrated = 0;
    for (const entry of dto.mappings) {
      const employees = await this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          positionDefinitionId: null,
          position: { equals: entry.legacyPosition, mode: 'insensitive' },
          assignments: {
            some: { companyId: dto.companyId, effectiveTo: null, deletedAt: null },
          },
        },
        select: { id: true, positionFamilyId: true, positionLevelId: true, positionDefinitionId: true },
      });

      const definition = await this.prisma.positionDefinition.findFirst({
        where: { id: entry.positionDefinitionId, companyId: dto.companyId, deletedAt: null },
      });
      if (!definition) {
        throw new PositionFrameworkValidationError(
          `Position definition ${entry.positionDefinitionId} not found for company`,
        );
      }

      for (const employee of employees) {
        const before = {
          positionFamilyId: employee.positionFamilyId,
          positionLevelId: employee.positionLevelId,
          positionDefinitionId: employee.positionDefinitionId,
          legacyPosition: entry.legacyPosition,
        };

        await this.prisma.employee.update({
          where: { id: employee.id },
          data: {
            positionFamilyId: definition.familyId,
            positionLevelId: definition.levelId,
            positionDefinitionId: definition.id,
            updatedBy: actor.userId,
          },
        });

        await this.audit.record(actor, {
          entityType: 'employee',
          entityId: employee.id,
          action: 'position_migrated',
          before,
          after: {
            positionFamilyId: definition.familyId,
            positionLevelId: definition.levelId,
            positionDefinitionId: definition.id,
          },
        });
        migrated += 1;
      }
    }

    return { migrated };
  }

  async getEmployeeCareerPath(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeCareerPathResponse> {
    await this.access.assertCanView(actor, companyId);
    await this.assertEmployeeInCompany(employeeId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        positionFamily: true,
        positionLevel: true,
        positionDefinition: true,
      },
    });
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const allCareerPaths = await this.careerPaths.list(actor, companyId);
    const careerPath = employee.positionDefinitionId
      ? allCareerPaths.find((path) =>
          path.steps.some((step) => step.positionDefinitionId === employee.positionDefinitionId))
      : null;

    const currentStep = careerPath?.steps.find(
      (step) => step.positionDefinitionId === employee.positionDefinitionId,
    ) ?? null;

    const allPromotionPaths = await this.promotionPaths.list(actor, companyId);
    const nextPromotionPaths = employee.positionDefinitionId
      ? allPromotionPaths.filter(
          (path) => path.fromPositionId === employee.positionDefinitionId && path.status === 'active',
        )
      : [];

    const allPositions = await this.positionDefinitions.list(actor, companyId);
    const nextPositions = allPositions.filter((pos) =>
      nextPromotionPaths.some((path) => path.toPositionId === pos.id));

    return {
      employeeId,
      companyId,
      positionFamily: this.toPositionSummary(employee.positionFamily),
      positionLevel: this.toPositionSummary(employee.positionLevel),
      positionDefinition: this.toPositionSummary(employee.positionDefinition),
      careerPath: careerPath ?? null,
      currentStep,
      nextPositions,
    };
  }

  private toPositionSummary(
    row: { id: string; code: string; name: string } | null,
  ): PositionSummary {
    if (!row) return { id: null, code: null, name: null };
    return { id: row.id, code: row.code, name: row.name };
  }

  private async getEmployeeOrThrow(employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee) throw new EmployeeNotFoundError(employeeId);
    return employee;
  }

  private async resolvePrimaryCompanyId(employeeId: string): Promise<string> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        effectiveTo: null,
        deletedAt: null,
        isPrimaryCompany: true,
      },
      select: { companyId: true },
    });
    if (!assignment) throw new EmployeeNotFoundError(employeeId);
    return assignment.companyId;
  }

  private async assertEmployeeInCompany(employeeId: string, companyId: string): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
    });
    if (!assignment) throw new EmployeeNotFoundError(employeeId);
  }

  private async validatePositionRefs(
    companyId: string,
    dto: {
      positionFamilyId?: string | null;
      positionLevelId?: string | null;
      positionDefinitionId?: string | null;
    },
  ): Promise<void> {
    if (dto.positionFamilyId) {
      const family = await this.prisma.positionFamily.findFirst({
        where: { id: dto.positionFamilyId, companyId, deletedAt: null },
      });
      if (!family) throw new PositionFrameworkValidationError('Invalid position family for company');
    }
    if (dto.positionLevelId) {
      const level = await this.prisma.positionLevel.findFirst({
        where: { id: dto.positionLevelId, companyId, deletedAt: null },
      });
      if (!level) throw new PositionFrameworkValidationError('Invalid position level for company');
    }
    if (dto.positionDefinitionId) {
      const definition = await this.prisma.positionDefinition.findFirst({
        where: { id: dto.positionDefinitionId, companyId, deletedAt: null },
      });
      if (!definition) throw new PositionFrameworkValidationError('Invalid position definition for company');
    }
  }
}
