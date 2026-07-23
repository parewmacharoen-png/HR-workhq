// ============================================================================
// P0-001c — Scope-aware permission enforcement for onboarding invites
// ============================================================================

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PermissionService } from '../../permission/application/permission.service';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../../permission/domain/repositories/permission.repository';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { PermissionDeniedError } from '../../permission/domain/errors/permission.errors';
import { InvitationEmploymentPreset, InviteCompanyAssignment } from '../domain/self-onboarding.types';
import { normalizeInviteCompanyIds } from '../domain/employment-preset.util';
import {
  ONBOARDING_INVITE_PERMISSIONS,
} from '../domain/onboarding-invite-permissions';

@Injectable()
export class OnboardingInviteAccessService {
  constructor(
    private readonly permissions: PermissionService,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly businessPermissions: BusinessPermissionRepository,
  ) {}

  async assertCanView(actor: ActorContext, companyId?: string | null): Promise<void> {
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.view, { companyId: companyId ?? null });
  }

  async assertCanCreateNewEmployee(
    actor: ActorContext,
    companyId: string,
    teamId?: string | null,
    additionalCompanyIds?: string[],
    companyAssignments?: InviteCompanyAssignment[],
  ): Promise<void> {
    const rows: InviteCompanyAssignment[] = companyAssignments?.length
      ? companyAssignments
      : (() => {
        const { primaryCompanyId, additionalCompanyIds: extras } = normalizeInviteCompanyIds(
          companyId,
          additionalCompanyIds,
        );
        return [primaryCompanyId, ...extras].map((cid, index) => ({
          companyId: cid,
          teamId: index === 0 ? teamId ?? undefined : undefined,
        }));
      })();

    for (const row of rows) {
      await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.create, {
        companyId: row.companyId,
        teamId: row.teamId ?? null,
      });
      await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.newEmployee, {
        companyId: row.companyId,
        teamId: row.teamId ?? null,
      });
    }
  }

  async assertCanLinkExisting(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.create, {
      companyId,
      subjectEmployeeId: employeeId,
    });
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.linkExisting, {
      companyId,
      subjectEmployeeId: employeeId,
    });
  }

  async assertCanManage(actor: ActorContext, inviteId: string): Promise<void> {
    const invite = await this.loadInviteOrThrow(inviteId);
    const scope = await this.inviteScope(invite);
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.manage, scope);
  }

  async assertCanRegenerate(actor: ActorContext, inviteId: string): Promise<void> {
    const invite = await this.loadInviteOrThrow(inviteId);
    const scope = await this.inviteScope(invite);
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.regenerate, scope);
  }

  async assertCanCancel(actor: ActorContext, inviteId: string): Promise<void> {
    const invite = await this.loadInviteOrThrow(inviteId);
    const scope = await this.inviteScope(invite);
    await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.cancel, scope);
  }

  async assertInviteReadable(actor: ActorContext, inviteId: string): Promise<void> {
    const invite = await this.loadInviteOrThrow(inviteId);
    const scope = await this.inviteScope(invite);
    try {
      await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.view, scope);
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        await this.authorize(actor, ONBOARDING_INVITE_PERMISSIONS.manage, scope);
        return;
      }
      throw err;
    }
  }

  async buildListScopeWhere(actor: ActorContext, companyId?: string): Promise<Prisma.EmployeeTelegramInviteWhereInput> {
    await this.assertCanView(actor, companyId ?? null);

    const ctx = await this.authCtx.loadForUser(actor.userId);
    if (!ctx) throw new PermissionDeniedError('user not found');

    if (ctx.scopes.some((s) => s.scopeType === 'all')) {
      return companyId ? { companyId } : {};
    }

    const companyIds = ctx.scopes
      .filter((s) => s.scopeType === 'company' && s.companyId)
      .map((s) => s.companyId as string);

    const teamIds = ctx.scopes
      .filter((s) => s.scopeType === 'team' && s.teamId)
      .map((s) => s.teamId as string);

    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      return { companyId };
    }

    if (companyIds.length > 0) {
      return { companyId: { in: companyIds } };
    }

    if (teamIds.length > 0) {
      return {
        OR: [
          {
            employee: {
              assignments: {
                some: {
                  teamId: { in: teamIds },
                  effectiveTo: null,
                  deletedAt: null,
                },
              },
            },
          },
          ...teamIds.map((teamId) => ({
            presetJson: { path: ['teamId'], equals: teamId },
          })),
        ],
      };
    }

    throw new PermissionDeniedError('out of scope');
  }

  async auditContext(actor: ActorContext) {
    const access = await this.businessPermissions.findUserAccess(actor.userId);
    return {
      actorId: actor.userId,
      actorRole: access?.businessRole ?? null,
      actorScope: access?.scopes ?? [],
    };
  }

  private async authorize(
    actor: ActorContext,
    permission: string,
    scope: {
      companyId?: string | null;
      teamId?: string | null;
      subjectEmployeeId?: string | null;
    },
  ): Promise<void> {
    await this.permissions.authorize(actor.userId, {
      permission,
      companyId: scope.companyId ?? null,
      teamId: scope.teamId ?? null,
      subjectEmployeeId: scope.subjectEmployeeId ?? null,
      subjectUserId: actor.userId,
    });
  }

  private async loadInviteOrThrow(inviteId: string) {
    const invite = await this.prisma.employeeTelegramInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    return invite;
  }

  private async inviteScope(invite: {
    companyId: string;
    employeeId: string | null;
    presetJson: unknown;
  }): Promise<{ companyId: string; teamId: string | null; subjectEmployeeId: string | null }> {
    const preset = (invite.presetJson ?? {}) as InvitationEmploymentPreset;
    let teamId = preset.teamId ?? null;

    if (!teamId && invite.employeeId) {
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: {
          employeeId: invite.employeeId,
          companyId: invite.companyId,
          effectiveTo: null,
          deletedAt: null,
        },
        orderBy: [{ isPrimaryTeam: 'desc' }, { effectiveFrom: 'desc' }],
        select: { teamId: true },
      });
      teamId = assignment?.teamId ?? null;
    }

    return {
      companyId: invite.companyId,
      teamId,
      subjectEmployeeId: invite.employeeId,
    };
  }
}
