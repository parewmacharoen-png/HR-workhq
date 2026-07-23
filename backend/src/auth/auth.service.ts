// ============================================================================
// auth/auth.service.ts
// Minimal credential validation + token issuance. Password hashing uses bcrypt.
// User lookup goes through Prisma directly (auth is cross-cutting, not a domain
// aggregate). Account lockout / refresh-token rotation are out of scope here.
// ============================================================================

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { JwtPayload } from './jwt.types';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../modules/permission/domain/repositories/permission.repository';
import { resolveEffectivePermissions } from '../modules/permission/domain/services/effective-permissions.service';

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  mustChangePassword: boolean;
}

export interface MeResponse {
  id: string;
  username: string;
  userType: string;
  mustChangePassword: boolean;
  companyId: string | null;
  employeeId: string | null;
  displayName: string | null;
  roles: string[];
  businessRole: string | null;
  permissions: string[];
  scopes: Array<{
    scopeType: string;
    companyId: string | null;
    teamId: string | null;
  }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
  ) {}

  /** Generates a one-time password for Telegram self-registration. */
  generateTemporaryPassword(): string {
    return randomBytes(9).toString('base64url');
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.resolveLoginUser(username);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // Back-office accounts use admin-set passwords — not Telegram temp passwords.
    if (!user.employeeId && user.mustChangePassword) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false },
      });
      user.mustChangePassword = false;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const companyId = await this.resolvePrimaryCompanyId(user.id);

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      userType: user.userType as JwtPayload['userType'],
      impersonatorUserId: null,
      companyId,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtAccessTtl,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwtAccessTtl,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async getMe(userId: string, jwtCompanyId: string | null): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const ctx = await this.authCtx.loadForUser(userId);
    const companyId = jwtCompanyId ?? await this.resolvePrimaryCompanyId(userId);

    const displayName = user.employee
      ? [user.employee.firstName, user.employee.lastName].filter(Boolean).join(' ')
      : (user.displayName?.trim() || user.username);

    const effective = ctx ? [...resolveEffectivePermissions(ctx)] : [];

    return {
      id: user.id,
      username: user.username,
      userType: user.userType,
      mustChangePassword: user.mustChangePassword,
      companyId,
      employeeId: user.employeeId,
      displayName: displayName || null,
      roles: ctx?.roleCodes ?? [],
      businessRole: ctx?.businessRole ?? null,
      permissions: effective,
      scopes: ctx?.scopes.map((s) => ({
        scopeType: s.scopeType,
        companyId: s.companyId,
        teamId: s.teamId,
      })) ?? [],
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid current password');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { success: true };
  }

  /** Username first; if no match, allow a unique display name (case-insensitive). */
  private async resolveLoginUser(loginId: string) {
    const trimmed = loginId.trim();
    if (!trimmed) return null;

    const byUsername = await this.prisma.user.findFirst({
      where: {
        username: { equals: trimmed, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
    });
    if (byUsername) return byUsername;

    const byDisplay = await this.prisma.user.findMany({
      where: {
        displayName: { equals: trimmed, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      take: 2,
    });
    return byDisplay.length === 1 ? byDisplay[0] : null;
  }

  private async resolvePrimaryCompanyId(userId: string): Promise<string | null> {
    const companyGrant = await this.prisma.scopeGrant.findFirst({
      where: { userId, scopeType: 'company', deletedAt: null },
      select: { companyId: true },
    });
    if (companyGrant?.companyId) return companyGrant.companyId;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: user.employeeId,
        isPrimaryCompany: true,
        effectiveTo: null,
        deletedAt: null,
      },
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }

  /** Issues an impersonation token (effective = target, real = actor). */
  async issueImpersonationToken(actorUserId: string, targetUserId: string): Promise<LoginResult> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!target) throw new UnauthorizedException('Target user not found');

    const payload: JwtPayload = {
      sub: target.id,
      username: target.username,
      userType: target.userType as JwtPayload['userType'],
      impersonatorUserId: actorUserId,
      companyId: null,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.jwtAccessTtl,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwtAccessTtl,
      mustChangePassword: false,
    };
  }
}
