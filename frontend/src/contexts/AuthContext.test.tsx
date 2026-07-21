import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  isAuthIdentityGraphqlEnabled,
  isAuthSessionGraphqlEnabled,
  loginViaGraphql,
  registerViaGraphql,
} from '@/services/authGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';
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

vi.mock('@/services/authGraphql', () => ({
  getCurrentUserViaGraphql: vi.fn(),
  isAuthSessionGraphqlEnabled: vi.fn(() => false),
  isAuthIdentityGraphqlEnabled: vi.fn(() => false),
  loginViaGraphql: vi.fn(),
  logoutViaGraphql: vi.fn(),
  registerViaGraphql: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/register']}>
    <AuthProvider>{children}</AuthProvider>
  </MemoryRouter>
);

describe('AuthProvider registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthSessionGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isAuthIdentityGraphqlEnabled).mockReturnValue(false);
  });

  it('routes registration through GraphQL when the identity flag is enabled', async () => {
    vi.mocked(isAuthIdentityGraphqlEnabled).mockReturnValue(true);
    vi.mocked(registerViaGraphql).mockResolvedValue({
      success: true,
      message: 'Account created',
      email: 'new-user@example.com',
    });
    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await result.current.register('new-user@example.com', 'StrongPass1', 'New User');
    });

    expect(registerViaGraphql).toHaveBeenCalledWith(
      'new-user@example.com',
      'StrongPass1',
      'New User',
    );
    expect(api.post).not.toHaveBeenCalledWith('/api/auth/register', expect.anything());
  });

  it('preserves GraphQL registration conflict reasons', async () => {
    vi.mocked(isAuthIdentityGraphqlEnabled).mockReturnValue(true);
    vi.mocked(registerViaGraphql).mockRejectedValue(
      new GraphqlRequestError(
        'This email is already registered with Google.',
        200,
        'ACCOUNT_CONFLICT',
        'GOOGLE_ACCOUNT_EXISTS',
      ),
    );
    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await expect(result.current.register(
        'google-user@example.com',
        'StrongPass1',
      )).rejects.toMatchObject({ code: 'GOOGLE_ACCOUNT_EXISTS' });
    });
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

  it('routes email login through GraphQL when the session flag is enabled', async () => {
    vi.mocked(isAuthSessionGraphqlEnabled).mockReturnValue(true);
    vi.mocked(loginViaGraphql).mockResolvedValue({
      success: true,
      user: {
        uid: 42,
        email: 'member@example.com',
        name: 'Member',
        role: 'USER',
        photoURL: 'https://example.test/avatar',
      },
    });
    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await result.current.loginWithEmail('member@example.com', 'password');
    });

    expect(loginViaGraphql).toHaveBeenCalledWith('member@example.com', 'password');
    expect(api.post).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });

  it('preserves the stable GraphQL auth reason for login-page behavior', async () => {
    vi.mocked(isAuthSessionGraphqlEnabled).mockReturnValue(true);
    vi.mocked(loginViaGraphql).mockRejectedValue(
      new GraphqlRequestError(
        'Email not verified',
        200,
        'UNAUTHENTICATED',
        'EMAIL_NOT_VERIFIED',
      ),
    );
    const { result } = renderHook(() => useAuthActions(), { wrapper });

    await act(async () => {
      await expect(result.current.loginWithEmail(
        'member@example.com',
        'password',
      )).rejects.toMatchObject({
        message: 'Email not verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    });
  });
});
