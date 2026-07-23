// ============================================================================
// shared/kernel/company-access.service.ts
// Reusable tenant guard: platform admins (scope:all) may access any company;
// company-scoped users may only access their granted company.
// ============================================================================

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../../modules/permission/domain/repositories/permission.repository';
import { ActorContext } from './actor-context';
import { CompanyAccessDeniedError } from './company-access.errors';

@Injectable()
export class CompanyAccessService {
  constructor(
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
  ) {}

  async hasAllScope(userId: string): Promise<boolean> {
    const ctx = await this.authCtx.loadForUser(userId);
    return !!ctx?.scopes.some((s) => s.scopeType === 'all');
  }

  async hasCompanyScope(userId: string, companyId: string): Promise<boolean> {
    const ctx = await this.authCtx.loadForUser(userId);
    return !!ctx?.scopes.some((s) => s.scopeType === 'company' && s.companyId === companyId);
  }

  async assertCompanyAccess(actor: ActorContext, companyId: string | null): Promise<void> {
    if (!companyId) {
      if (await this.hasAllScope(actor.userId)) return;
      throw new CompanyAccessDeniedError();
    }

    const ctx = await this.authCtx.loadForUser(actor.userId);
    if (!ctx) throw new CompanyAccessDeniedError();

    if (ctx.scopes.some((s) => s.scopeType === 'all')) return;
    if (ctx.scopes.some((s) => s.scopeType === 'company' && s.companyId === companyId)) return;
    // Self-scoped actors (e.g. Telegram employees) may access their own company when companyId is set on the actor.
    if (ctx.scopes.some((s) => s.scopeType === 'self') && actor.companyId === companyId) return;

    throw new CompanyAccessDeniedError();
  }

  /** Non-all-scope callers must supply companyId; returns the resolved id. */
  async requireCompanyId(actor: ActorContext, companyId?: string | null): Promise<string> {
    if (companyId) {
      await this.assertCompanyAccess(actor, companyId);
      return companyId;
    }
    if (await this.hasAllScope(actor.userId)) {
      throw new BadRequestException('companyId is required');
    }
    throw new BadRequestException('companyId is required');
  }
}
