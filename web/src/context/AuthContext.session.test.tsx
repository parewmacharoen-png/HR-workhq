import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchCompanies: vi.fn().mockResolvedValue([]),
    getAuthToken: vi.fn(() => 'stored-token'),
    refreshAuthToken: vi.fn().mockResolvedValue(true),
    tokenAgeSeconds: vi.fn(() => 0),
  };
});

import { ApiError, fetchMe, refreshAuthToken, tokenAgeSeconds } from '../api/client';
import { AuthProvider, useAuth } from './AuthContext';

const me = { id: 'u-1', username: 'owner', companyId: null, permissions: [], roles: [], scopes: [] } as never;

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <span>loading</span>;
  return <span>{user ? 'signed-in' : 'signed-out'}</span>;
}

describe('AuthProvider session', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchMe).mockReset();
    vi.mocked(refreshAuthToken).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the user signed in while the API restarts after a deploy', async () => {
    vi.mocked(fetchMe)
      .mockRejectedValueOnce(new ApiError('Bad Gateway', 502))
      .mockRejectedValueOnce(new ApiError('API asleep', 504))
      .mockResolvedValueOnce(me);

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText('loading')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });

    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument());
    expect(fetchMe).toHaveBeenCalledTimes(3);
  });

  it('signs out at once when the token is rejected', async () => {
    vi.mocked(fetchMe).mockRejectedValueOnce(new ApiError('Unauthorized', 401));

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });

  it('renews an old token while the app is open', async () => {
    vi.mocked(fetchMe).mockResolvedValue(me);
    vi.mocked(tokenAgeSeconds).mockReturnValue(11 * 60);

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByText('signed-in')).toBeInTheDocument());
    expect(refreshAuthToken).toHaveBeenCalled();
  });
});
