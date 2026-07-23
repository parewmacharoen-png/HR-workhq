import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError, clearToken, getCompanyId, setToken } from '../api/client';

function mockResponse(overrides: Partial<Response> & Pick<Response, 'ok' | 'status'>): Response {
  return {
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    } as Headers,
    ...overrides,
  } as Response;
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores and clears token', () => {
    setToken('abc123');
    expect(localStorage.getItem('workhq_token')).toBe('abc123');
    clearToken();
    expect(localStorage.getItem('workhq_token')).toBeNull();
  });

  it('attaches Authorization header on apiGet', async () => {
    setToken('test-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 200, text: async () => '[]' }),
    );

    await import('../api/client').then(({ apiGet }) => apiGet('/marketing/reports', { companyId: 'co-1' }));

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('redirects to login on 401', async () => {
    setToken('expired');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: false, status: 401, text: async () => 'Unauthorized' }),
    );

    await expect(import('../api/client').then(({ apiGet }) => apiGet('/marketing/reports'))).rejects.toBeInstanceOf(ApiError);
    expect(window.location.href).toContain('/login');
    expect(localStorage.getItem('workhq_token')).toBeNull();
  });

  it('handles 204 and empty JSON bodies', async () => {
    setToken('test-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 204, text: async () => '' }),
    );

    const result = await import('../api/client').then(({ apiDelete }) => apiDelete('/access-control/users/u1/overrides/o1'));
    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('parses literal null JSON bodies', async () => {
    setToken('test-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse({ ok: true, status: 200, text: async () => 'null' }),
    );

    const result = await import('../api/client').then(({ apiGet }) => apiGet<null>('/employees/e1/telegram-identity'));
    expect(result).toBeNull();
  });
});
