import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loginViaGraphql,
  registerViaGraphql,
} from '@/services/authGraphql';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { AuthProvider, useAuthActions } from './AuthContext';

vi.mock('@/lib/api', () => ({
  markAuthenticatedSession: vi.fn(),
  clearAuthenticatedSession: vi.fn(),
  isLoggedOut: vi.fn(() => true),
  setLoggedOut: vi.fn(),
  hasSessionHint: vi.fn(() => false),
}));

vi.mock('@/services/authGraphql', () => ({
  getCurrentUserViaGraphql: vi.fn(),
  loginViaGraphql: vi.fn(),
  logoutViaGraphql: vi.fn(),
  registerViaGraphql: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/register']}>
    <AuthProvider>{children}</AuthProvider>
  </MemoryRouter>
);

describe('AuthProvider GraphQL authentication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes registration directly through GraphQL', async () => {
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
  });

  it('preserves GraphQL registration conflict reasons', async () => {
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

  it('routes email login directly through GraphQL', async () => {
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
  });

  it('preserves the stable GraphQL auth reason for login-page behavior', async () => {
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
