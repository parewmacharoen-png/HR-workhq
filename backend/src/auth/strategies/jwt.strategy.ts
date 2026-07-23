// ============================================================================
// auth/strategies/jwt.strategy.ts
// Verifies the bearer token and produces the AuthenticatedUser that Passport
// attaches to request.user. Also writes the ActorContext into the request
// context store so services/audit can read "who is acting".
// ============================================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../config/app-config.service';
import { RequestContextService } from '../../common/context/request-context';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtPayload, AuthenticatedUser } from '../jwt.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly ctx: RequestContextService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  // Passport calls validate() with the decoded payload after signature/exp checks.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) throw new UnauthorizedException('Malformed token');

    const dbUser = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true, username: true, userType: true, isActive: true, mustChangePassword: true,
      },
    });
    if (!dbUser || !dbUser.isActive) {
      throw new UnauthorizedException('Account is inactive or deleted');
    }

    const user: AuthenticatedUser = {
      id: dbUser.id,
      username: dbUser.username,
      userType: dbUser.userType,
      impersonatorUserId: payload.impersonatorUserId ?? null,
      companyId: payload.companyId ?? null,
      mustChangePassword: dbUser.mustChangePassword,
    };

    // Populate the request-scoped actor for downstream services / audit.
    this.ctx.setActor({
      userId: user.id,
      impersonatorUserId: user.impersonatorUserId,
      companyId: user.companyId,
    });

    return user;
  }
}
