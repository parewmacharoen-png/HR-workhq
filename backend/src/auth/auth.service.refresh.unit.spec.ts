import { AuthService } from './auth.service';
import { AuthenticatedUser } from './jwt.types';

describe('AuthService.refreshToken', () => {
  it('re-signs the same claims with a new expiry', async () => {
    const jwt = { signAsync: jest.fn().mockResolvedValue('new-token') };
    const config = { jwtSecret: 'secret-secret-secret', jwtAccessTtl: '12h' };
    const service = new AuthService({} as never, jwt as never, config as never, {} as never);
    const user: AuthenticatedUser = {
      id: 'u-1',
      username: 'owner',
      userType: 'human',
      impersonatorUserId: null,
      companyId: 'co-1',
      mustChangePassword: false,
    };

    const result = await service.refreshToken(user);

    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'u-1', username: 'owner', userType: 'human', impersonatorUserId: null, companyId: 'co-1' },
      { secret: 'secret-secret-secret', expiresIn: '12h' },
    );
    expect(result).toEqual({ accessToken: 'new-token', tokenType: 'Bearer', expiresIn: '12h', mustChangePassword: false });
  });
});
