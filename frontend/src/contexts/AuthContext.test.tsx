import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentUserViaGraphql,
  loginViaGraphql,
  registerViaGraphql,
} from '@/services/authGraphql';
import {
  clearAuthenticatedSession,
  hasSessionHint,
  isLoggedOut,
} from '@/lib/api';
import { storage } from '@/lib/storage';
import { GraphqlRequestError } from '@/services/graphqlClient';
import { AuthProvider, useAuthActions, useAuthState } from './AuthContext';

const storageMemory = vi.hoisted(() => new Map<string, string>());

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

vi.mock('@/lib/storage', () => ({
  storage: {
    getItem: vi.fn((key: string) => storageMemory.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storageMemory.set(key, value)),
    removeItem: vi.fn((key: string) => storageMemory.delete(key)),
    getJson: vi.fn((key: string) => {
      const value = storageMemory.get(key);
      return value ? JSON.parse(value) : null;
    }),
    setJson: vi.fn((key: string, value: unknown) => storageMemory.set(key, JSON.stringify(value))),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/register']}>
    <AuthProvider>{children}</AuthProvider>
  </MemoryRouter>
);

describe('AuthProvider GraphQL authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMemory.clear();
    window.localStorage.clear();
    vi.mocked(isLoggedOut).mockReturnValue(true);
    vi.mocked(hasSessionHint).mockReturnValue(false);
  });

  it('preserves cached identity when protected-route hydration is temporarily rate limited', async () => {
    vi.mocked(isLoggedOut).mockReturnValue(false);
    vi.mocked(hasSessionHint).mockReturnValue(true);
    storage.setJson('itemize_user', {
      uid: '42',
      email: 'member@example.com',
      name: 'Member',
      role: 'USER',
    });
    storage.setItem('itemize_expiry', String(Date.now() + 60_000));
    expect(storage.getJson('itemize_user')).toMatchObject({ uid: '42' });
    vi.mocked(getCurrentUserViaGraphql).mockRejectedValue(
      new GraphqlRequestError('Too many requests', 429),
    );

    const protectedWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/canvas']}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );
    const { result } = renderHook(() => useAuthState(), { wrapper: protectedWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUser).toMatchObject({
      uid: '42',
      email: 'member@example.com',
    });
    expect(clearAuthenticatedSession).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('itemize_user')).not.toBeNull();
  });

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
      'FREE',
      undefined,
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
