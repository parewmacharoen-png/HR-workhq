import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AuthContextRepository } from '../modules/permission/domain/repositories/permission.repository';
import { JwtPayload } from './jwt.types';

describe('AuthService.refresh', () => {
  const secret = 'x'.repeat(64);
  const jwt = new JwtService();
  const config = { jwtSecret: secret, jwtAccessTtl: '8h' } as unknown as AppConfigService;
  const service = new AuthService(
    {} as PrismaService,
    jwt,
    config,
    {} as AuthContextRepository,
  );

  it('issues a new token for the same user, company and impersonator', async () => {
    const result = await service.refresh({
      id: 'user-1',
      username: 'owner',
      userType: 'human',
      impersonatorUserId: 'actor-1',
      companyId: 'co-1',
      mustChangePassword: false,
    });

    const payload = await jwt.verifyAsync<JwtPayload>(result.accessToken, { secret });
    expect(payload).toMatchObject({
      sub: 'user-1',
      username: 'owner',
      impersonatorUserId: 'actor-1',
      companyId: 'co-1',
    });
    expect(payload.exp! - payload.iat!).toBe(8 * 3600);
    expect(result).toMatchObject({ tokenType: 'Bearer', expiresIn: '8h', mustChangePassword: false });
  });
});
