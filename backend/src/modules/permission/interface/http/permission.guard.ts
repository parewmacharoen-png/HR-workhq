// ============================================================================
// modules/permission/interface/http/permission.guard.ts
// @RequirePermission('payroll:read') marks a route. PermissionGuard reads the
// metadata, builds the AccessRequest from request params/body, and delegates to
// PermissionService.authorize. Scope inputs (companyId/teamId) are pulled from
// the request where present.
// ============================================================================

import {
  CanActivate, ExecutionContext, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../application/permission.service';

export const PERMISSION_KEY = 'required_permission';
export const PERMISSIONS_ANY_KEY = 'required_permissions_any';

export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);

/** Route allowed when the user has at least one listed permission. */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);

interface RequestLike {
  user?: { id: string; impersonatorUserId?: string | null; companyId?: string | null };
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredAny = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_ANY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAny?.length && !required) return true;

    const req = context.switchToHttp().getRequest<RequestLike>();
    const userId = req.user?.id;
    if (!userId) return false;

    const companyId =
      (req.params?.companyId as string) ??
      (req.query?.companyId as string) ??
      (req.body?.companyId as string) ??
      (req.user?.companyId as string) ??
      null;
    const teamId =
      (req.params?.teamId as string) ??
      (req.body?.teamId as string) ??
      null;
    const subjectEmployeeId =
      (req.params?.employeeId as string) ??
      (req.body?.employeeId as string) ??
      null;
    const subjectUserId =
      (req.params?.userId as string) ??
      (req.params?.id as string) ??
      userId;

    const access = {
      companyId,
      teamId,
      subjectUserId,
      subjectEmployeeId,
    };

    if (requiredAny?.length) {
      let lastError: unknown;
      for (const permission of requiredAny) {
        try {
          await this.permissions.authorize(userId, { permission, ...access });
          return true;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    }

    await this.permissions.authorize(userId, {
      permission: required!,
      ...access,
    });
    return true;
  }
}
