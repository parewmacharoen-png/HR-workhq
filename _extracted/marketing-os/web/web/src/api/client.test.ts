import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError, clearToken, getCompanyId, setToken } from '../api/client';

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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([]),
    } as Response);

    await import('../api/client').then(({ apiGet }) => apiGet('/marketing/reports', { companyId: 'co-1' }));

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('redirects to login on 401', async () => {
    setToken('expired');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(import('../api/client').then(({ apiGet }) => apiGet('/marketing/reports'))).rejects.toBeInstanceOf(ApiError);
    expect(window.location.href).toContain('/login');
    expect(localStorage.getItem('workhq_token')).toBeNull();
  });

  it('reads company id from storage', () => {
    localStorage.setItem('workhq_company_id', 'company-1');
    expect(getCompanyId()).toBe('company-1');
  });
});
