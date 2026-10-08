import { ApiError } from '../api/client';

/** Reads the issued-at / expiry times (ms) from a JWT without verifying it. */
export function readTokenTimes(token: string): { issuedAt: number; expiresAt: number } | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { iat?: unknown; exp?: unknown };
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return { issuedAt: payload.iat * 1000, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

/** Renew once half of the token's lifetime has passed, while it is still valid. */
export function shouldRefreshToken(token: string, now: number = Date.now()): boolean {
  const times = readTokenTimes(token);
  if (!times) return false;
  if (now >= times.expiresAt) return false;
  const halfLife = times.issuedAt + (times.expiresAt - times.issuedAt) / 2;
  return now >= halfLife;
}

/**
 * True when the server could not answer (asleep, restarting after a deploy, network down)
 * rather than rejecting the login — the saved session should be kept and retried.
 */
export function isServerUnavailableError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status >= 500;
  // fetch() rejects with TypeError when the request never reached the server.
  return err instanceof TypeError;
}
