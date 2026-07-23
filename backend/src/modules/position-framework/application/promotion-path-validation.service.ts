// ============================================================================
// modules/position-framework/application/promotion-path-validation.service.ts
// Platform Consolidation PART A — promotion path validation
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeNotFoundError } from '../../employee/domain/errors/employee.errors';
import { PositionDefinitionNotFoundError } from '../domain/errors/position-framework.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import { CareerPathService } from './career-path.service';
import { PromotionPathService } from './promotion-path.service';
import { PositionDefinitionService } from './position-definition.service';
import {
  PromotionPathValidationResult,
  PromotionPathResponse,
  PositionDefinitionResponse,
} from './dto/position-framework.dto';

export interface ValidatePromotionPathInput {
  employeeId: string;
  companyId: string;
  targetPositionDefinitionId: string;
}

@Injectable()
export class PromotionPathValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly careerPaths: CareerPathService,
    private readonly promotionPaths: PromotionPathService,
    private readonly positionDefinitions: PositionDefinitionService,
  ) {}

  async validate(
    actor: ActorContext,
    input: ValidatePromotionPathInput,
  ): Promise<PromotionPathValidationResult> {
    await this.access.assertCanView(actor, input.companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
    });
    if (!employee) throw new EmployeeNotFoundError(input.employeeId);

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    if (!assignment) throw new EmployeeNotFoundError(input.employeeId);

    const allPositions = await this.positionDefinitions.list(actor, input.companyId);
    const targetPosition = allPositions.find((pos) => pos.id === input.targetPositionDefinitionId);
    if (!targetPosition) throw new PositionDefinitionNotFoundError(input.targetPositionDefinitionId);

    const currentPosition = employee.positionDefinitionId
      ? allPositions.find((pos) => pos.id === employee.positionDefinitionId) ?? null
      : null;

    const allPromotionPaths = await this.promotionPaths.list(actor, input.companyId);
    const activeFromCurrent = employee.positionDefinitionId
      ? allPromotionPaths.filter(
          (path) => path.fromPositionId === employee.positionDefinitionId && path.status === 'active',
        )
      : [];

    const nextPositions = allPositions.filter((pos) =>
      activeFromCurrent.some((path) => path.toPositionId === pos.id));

    const directPath = activeFromCurrent.find(
      (path) => path.toPositionId === input.targetPositionDefinitionId,
    );

    const allCareerPaths = await this.careerPaths.list(actor, input.companyId);
    const careerPath = employee.positionDefinitionId
      ? allCareerPaths.find((path) =>
          path.steps.some((step) => step.positionDefinitionId === employee.positionDefinitionId))
      : null;

    const currentStepIndex = careerPath?.steps.findIndex(
      (step) => step.positionDefinitionId === employee.positionDefinitionId,
    ) ?? -1;
    const nextCareerStep = currentStepIndex >= 0
      ? careerPath?.steps[currentStepIndex + 1] ?? null
      : null;
    const validViaCareerPath = nextCareerStep?.positionDefinitionId === input.targetPositionDefinitionId;

    const valid = Boolean(directPath) || validViaCareerPath;
    const warning = this.buildWarning(
      valid,
      currentPosition,
      targetPosition,
      directPath,
      validViaCareerPath,
      activeFromCurrent,
    );

    const suggestedPaths = this.buildSuggestedPaths(
      activeFromCurrent,
      input.targetPositionDefinitionId,
      allPromotionPaths,
      employee.positionDefinitionId,
    );

    return {
      valid,
      warning,
      currentPosition,
      careerPath: careerPath ?? null,
      nextPositions,
      suggestedPaths,
    };
  }

  private buildWarning(
    valid: boolean,
    currentPosition: PositionDefinitionResponse | null,
    targetPosition: PositionDefinitionResponse,
    directPath: PromotionPathResponse | undefined,
    validViaCareerPath: boolean,
    activeFromCurrent: PromotionPathResponse[],
  ): string | null {
    if (valid) return null;
    if (!currentPosition) {
      return 'Employee has no current position definition assigned';
    }
    if (currentPosition.id === targetPosition.id) {
      return 'Target position is the same as current position';
    }
    if (activeFromCurrent.length === 0) {
      return 'No active promotion paths from current position';
    }
    if (!directPath && !validViaCareerPath) {
      return 'Target position is not the next step on any active career or promotion path';
    }
    return 'Promotion path validation failed';
  }

  private buildSuggestedPaths(
    directPaths: PromotionPathResponse[],
    targetId: string,
    allPaths: PromotionPathResponse[],
    fromPositionId: string | null,
  ): PromotionPathResponse[] {
    if (directPaths.some((path) => path.toPositionId === targetId)) {
      return directPaths.filter((path) => path.toPositionId === targetId);
    }

    if (!fromPositionId) return directPaths;

    const twoHop: PromotionPathResponse[] = [];
    for (const first of directPaths) {
      const second = allPaths.find(
        (path) =>
          path.fromPositionId === first.toPositionId
          && path.toPositionId === targetId
          && path.status === 'active',
      );
      if (second) twoHop.push(first, second);
    }

    return twoHop.length > 0 ? twoHop : directPaths;
  }
}
