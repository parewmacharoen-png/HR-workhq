import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { isServerUnavailableError, readTokenTimes, shouldRefreshToken } from './session-token';

function token(iat: number, exp: number): string {
  const body = btoa(JSON.stringify({ sub: 'u1', iat, exp })).replace(/=+$/, '');
  return `header.${body}.signature`;
}

describe('session token', () => {
  const iat = 1_000_000;
  const exp = iat + 8 * 3600;
  const t = token(iat, exp);

  it('reads issue and expiry times', () => {
    expect(readTokenTimes(t)).toEqual({ issuedAt: iat * 1000, expiresAt: exp * 1000 });
    expect(readTokenTimes('not-a-jwt')).toBeNull();
  });

  it('renews only after half the lifetime and before expiry', () => {
    expect(shouldRefreshToken(t, (iat + 3600) * 1000)).toBe(false);
    expect(shouldRefreshToken(t, (iat + 5 * 3600) * 1000)).toBe(true);
    expect(shouldRefreshToken(t, (exp + 1) * 1000)).toBe(false);
  });

  it('keeps the session when the server is down, not when the login is rejected', () => {
    expect(isServerUnavailableError(new ApiError('down', 502))).toBe(true);
    expect(isServerUnavailableError(new ApiError('slow', 504))).toBe(true);
    expect(isServerUnavailableError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isServerUnavailableError(new ApiError('Unauthorized', 401))).toBe(false);
  });
});
