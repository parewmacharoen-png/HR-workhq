import { Injectable } from '@nestjs/common';
import { FormulaConfigStatus, FormulaDomain } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  evaluateFormula, FormulaEvaluationError, validateFormulaExpression,
} from '../../../shared/formula/safe-formula.evaluator';

export class FormulaNotFoundError extends Error {
  constructor(id: string) { super(`Formula not found: ${id}`); this.name = 'FormulaNotFoundError'; }
}

export class FormulaValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'FormulaValidationError'; }
}

export interface CreateFormulaDto {
  companyId?: string;
  key: string;
  name: string;
  description?: string;
  domain?: FormulaDomain;
  expression: string;
  variables?: Array<{
    key: string;
    label: string;
    dataType: 'number' | 'currency' | 'boolean' | 'date' | 'text';
    sourceType: string;
    sourcePath?: string;
    defaultValueJson?: unknown;
    required?: boolean;
  }>;
}

@Injectable()
export class FormulaDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async list(actor: ActorContext, companyId?: string, domain?: string, status?: string) {
    if (companyId) this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.formulaDefinition.findMany({
      where: {
        deletedAt: null,
        ...(companyId !== undefined ? { OR: [{ companyId }, { companyId: null }] } : {}),
        ...(domain ? { domain: domain as FormulaDomain } : {}),
        ...(status ? { configStatus: status as FormulaConfigStatus } : {}),
      },
      include: { variables: true },
      orderBy: [{ key: 'asc' }],
    });
  }

  async get(actor: ActorContext, id: string) {
    const row = await this.prisma.formulaDefinition.findFirst({
      where: { id, deletedAt: null },
      include: { variables: true, executionLogs: { take: 20, orderBy: { executedAt: 'desc' } } },
    });
    if (!row) throw new FormulaNotFoundError(id);
    if (row.companyId) this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  async create(actor: ActorContext, dto: CreateFormulaDto) {
    if (dto.companyId) this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const validation = validateFormulaExpression(dto.expression);
    if (!validation.valid) throw new FormulaValidationError(validation.error ?? 'Invalid expression');

    const id = randomUUID();
    const row = await this.prisma.$transaction(async (tx) => {
      const def = await tx.formulaDefinition.create({
        data: {
          id,
          companyId: dto.companyId ?? null,
          key: dto.key,
          name: dto.name,
          description: dto.description,
          domain: (dto.domain ?? 'general') as FormulaDomain,
          expression: dto.expression,
          configStatus: 'draft',
          configVersion: 1,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (dto.variables?.length) {
        await tx.formulaVariable.createMany({
          data: dto.variables.map((v) => ({
            formulaDefinitionId: id,
            key: v.key,
            label: v.label,
            dataType: v.dataType as never,
            sourceType: v.sourceType as never,
            sourcePath: v.sourcePath,
            defaultValueJson: v.defaultValueJson as object | undefined,
            required: v.required ?? true,
          })),
        });
      }
      return def;
    });

    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: id, action: 'create', after: row });
    return this.get(actor, id);
  }

  async update(actor: ActorContext, id: string, dto: Partial<CreateFormulaDto>) {
    const existing = await this.get(actor, id);
    if (existing.configStatus === 'published') {
      throw new FormulaValidationError('Published formulas are immutable — create a new version');
    }
    if (dto.expression) {
      const validation = validateFormulaExpression(dto.expression);
      if (!validation.valid) throw new FormulaValidationError(validation.error ?? 'Invalid expression');
    }

    await this.prisma.formulaDefinition.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.expression ? { expression: dto.expression } : {}),
        ...(dto.domain ? { domain: dto.domain } : {}),
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: id, action: 'edit', before: existing });
    return this.get(actor, id);
  }

  async validate(actor: ActorContext, id: string) {
    const row = await this.get(actor, id);
    if (!row.expression) return { valid: false, error: 'Expression is empty' };
    return validateFormulaExpression(row.expression);
  }

  async test(actor: ActorContext, id: string, sampleInputs: Record<string, number>) {
    const row = await this.get(actor, id);
    if (!row.expression) throw new FormulaValidationError('Expression is empty');
    try {
      const result = evaluateFormula(row.expression, sampleInputs);
      return { result, error: null };
    } catch (err) {
      return { result: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async execute(actor: ActorContext, id: string, entityType: string, entityId: string, inputs: Record<string, number>) {
    const row = await this.get(actor, id);
    if (row.configStatus !== 'published' || !row.expression) {
      throw new FormulaValidationError('Formula must be published before execution');
    }
    const result = evaluateFormula(row.expression, inputs);
    const log = await this.prisma.formulaExecutionLog.create({
      data: {
        formulaDefinitionId: id,
        formulaVersion: row.configVersion,
        entityType,
        entityId,
        inputJson: inputs,
        outputJson: { result },
        result,
        executedBy: actor.userId,
      },
    });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: id, action: 'execute', after: { result } });
    return { result, logId: log.id };
  }

  async publish(actor: ActorContext, id: string) {
    const row = await this.get(actor, id);
    if (!row.expression) throw new FormulaValidationError('Cannot publish without expression');
    const validation = validateFormulaExpression(row.expression);
    if (!validation.valid) throw new FormulaValidationError(validation.error ?? 'Invalid expression');

    await this.prisma.formulaDefinition.update({
      where: { id },
      data: { configStatus: 'published', publishedBy: actor.userId, publishedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: id, action: 'publish' });
    return this.get(actor, id);
  }

  async archive(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.formulaDefinition.update({ where: { id }, data: { configStatus: 'archived' } });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: id, action: 'archive' });
    return this.get(actor, id);
  }

  async clone(actor: ActorContext, id: string) {
    const src = await this.get(actor, id);
    const newId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.formulaDefinition.create({
        data: {
          id: newId,
          companyId: src.companyId,
          key: `${src.key}_copy_${Date.now()}`,
          name: `${src.name} (Copy)`,
          description: src.description,
          domain: src.domain,
          expression: src.expression,
          configStatus: 'draft',
          configVersion: 1,
          rootId: src.rootId ?? src.id,
          sourceId: src.id,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (src.variables.length) {
        await tx.formulaVariable.createMany({
          data: src.variables.map((v) => ({
            formulaDefinitionId: newId,
            key: v.key,
            label: v.label,
            dataType: v.dataType,
            sourceType: v.sourceType,
            sourcePath: v.sourcePath,
            defaultValueJson: v.defaultValueJson ?? undefined,
            required: v.required,
          })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: newId, action: 'clone', after: { sourceId: id } });
    return this.get(actor, newId);
  }

  async version(actor: ActorContext, id: string) {
    const src = await this.get(actor, id);
    if (src.configStatus !== 'published') throw new FormulaValidationError('Only published formulas can be versioned');
    const newId = randomUUID();
    const newVersion = src.configVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.formulaDefinition.create({
        data: {
          id: newId,
          companyId: src.companyId,
          key: src.key,
          name: src.name,
          description: src.description,
          domain: src.domain,
          expression: src.expression,
          configStatus: 'draft',
          configVersion: newVersion,
          rootId: src.rootId ?? src.id,
          sourceId: src.id,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (src.variables.length) {
        await tx.formulaVariable.createMany({
          data: src.variables.map((v) => ({
            formulaDefinitionId: newId,
            key: v.key,
            label: v.label,
            dataType: v.dataType,
            sourceType: v.sourceType,
            sourcePath: v.sourcePath,
            defaultValueJson: v.defaultValueJson ?? undefined,
            required: v.required,
          })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'FormulaDefinition', entityId: newId, action: 'version', after: { sourceId: id, version: newVersion } });
    return this.get(actor, newId);
  }
}

@Injectable()
export class FormulaIntegrationService {
  /** Advisory integration — exposes formula test mode for payroll/KPI domains. */
  async resolveForDomain(domain: FormulaDomain, key: string, inputs: Record<string, number>): Promise<number | null> {
    const def = await this.prisma.formulaDefinition.findFirst({
      where: { key, domain, configStatus: 'published', deletedAt: null },
    });
    if (!def?.expression) return null;
    try {
      return evaluateFormula(def.expression, inputs);
    } catch (err) {
      if (err instanceof FormulaEvaluationError) return null;
      throw err;
    }
  }

  constructor(private readonly prisma: PrismaService) {}
}
