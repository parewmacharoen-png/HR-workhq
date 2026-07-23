// ============================================================================
// auth/decorators/current-actor.decorator.ts
// Injects a ready-built ActorContext into controller methods, replacing the
// per-controller actorFrom(req) helpers. Falls back to SYSTEM_ACTOR if absent.
// ============================================================================

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorContext, SYSTEM_ACTOR } from '../../shared/kernel/actor-context';
import { AuthenticatedUser } from '../jwt.types';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorContext => {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const u = req.user;
    if (!u) return SYSTEM_ACTOR;
    return {
      userId: u.id,
      impersonatorUserId: u.impersonatorUserId,
      companyId: u.companyId,
    };
  },
);
