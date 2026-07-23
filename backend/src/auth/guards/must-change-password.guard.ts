// ============================================================================
// auth/guards/must-change-password.guard.ts
// Blocks API access for users who must change their temporary password first.
// ============================================================================

import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_PASSWORD_CHANGE_KEY } from '../decorators/skip-password-change.decorator';
import { AuthenticatedUser } from '../jwt.types';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.id) return true;

    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null, isActive: true },
      select: { mustChangePassword: true },
    });
    if (dbUser?.mustChangePassword) {
      throw new ForbiddenException('Password change required before continuing');
    }
    return true;
  }
}
