import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { AuthProvider, useAuthActions } from './AuthContext';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  markAuthenticatedSession: vi.fn(),
  clearAuthenticatedSession: vi.fn(),
  isLoggedOut: vi.fn(() => true),
  setLoggedOut: vi.fn(),
  hasSessionHint: vi.fn(() => false),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/register']}>
    <AuthProvider>{children}</AuthProvider>
  </MemoryRouter>
);

describe('AuthProvider registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts the data-only body produced by the shared response interceptor', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { email: 'new-user@example.com' },
    } as never);

    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await expect(result.current.register(
        'new-user@example.com',
        'correct-horse-battery-staple',
        'New User',
      )).resolves.toBeUndefined();
    });

    expect(api.post).toHaveBeenCalledWith('/api/auth/register', {
      email: 'new-user@example.com',
      password: 'correct-horse-battery-staple',
      name: 'New User',
    });
  });

  it('preserves structured registration errors from non-2xx responses', async () => {
    const error = new AxiosError('Request failed with status code 400');
    error.response = {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {
        error: 'This email is already registered with Google.',
        code: 'GOOGLE_ACCOUNT_EXISTS',
      },
    };
    vi.mocked(api.post).mockRejectedValue(error);

    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await expect(result.current.register(
        'google-user@example.com',
        'correct-horse-battery-staple',
      )).rejects.toMatchObject({
        message: 'This email is already registered with Google.',
        code: 'GOOGLE_ACCOUNT_EXISTS',
      });
    });
  });
});
