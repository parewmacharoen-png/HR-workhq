import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  evaluateFormula, FormulaEvaluationError,
} from '../../../shared/formula/safe-formula.evaluator';

export interface FormulaResolveContext {
  companyId?: string | null;
  entityType: string;
  entityId: string;
  inputs: Record<string, number>;
  executedBy?: string | null;
}

export interface FormulaResolveResult {
  value: number;
  fallbackUsed: boolean;
  formulaKey: string;
}

@Injectable()
export class FormulaResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWithFallback(
    key: string,
    ctx: FormulaResolveContext,
    fallback: () => number | Promise<number>,
  ): Promise<FormulaResolveResult> {
    const def = await this.prisma.formulaDefinition.findFirst({
      where: {
        key,
        configStatus: 'published',
        deletedAt: null,
        ...(ctx.companyId
          ? { OR: [{ companyId: ctx.companyId }, { companyId: null }] }
          : { companyId: null }),
      },
      orderBy: [{ companyId: 'desc' }, { configVersion: 'desc' }],
    });

    if (!def?.expression) {
      const value = await fallback();
      await this.logExecution(key, ctx, def?.id ?? null, def?.configVersion ?? 0, value, true);
      return { value, fallbackUsed: true, formulaKey: key };
    }

    try {
      const value = evaluateFormula(def.expression, ctx.inputs);
      await this.logExecution(key, ctx, def.id, def.configVersion, value, false);
      return { value, fallbackUsed: false, formulaKey: key };
    } catch (err) {
      if (!(err instanceof FormulaEvaluationError)) throw err;
      const value = await fallback();
      await this.logExecution(key, ctx, def.id, def.configVersion, value, true);
      return { value, fallbackUsed: true, formulaKey: key };
    }
  }

  private async logExecution(
    key: string,
    ctx: FormulaResolveContext,
    formulaDefinitionId: string | null,
    formulaVersion: number,
    result: number,
    fallbackUsed: boolean,
  ): Promise<void> {
    await this.prisma.formulaExecutionLog.create({
      data: {
        formulaDefinitionId,
        formulaKey: key,
        formulaVersion,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        inputJson: ctx.inputs,
        outputJson: { result, fallbackUsed },
        result,
        fallbackUsed,
        executedBy: ctx.executedBy ?? null,
      },
    });
  }
}
