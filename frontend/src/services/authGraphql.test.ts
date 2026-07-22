import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlPublicRequest,
  graphqlRequest,
} from '@/services/graphqlClient';
import {
  getCurrentUserViaGraphql,
  isAuthIdentityGraphqlEnabled,
  isAuthRecoveryGraphqlEnabled,
  isAuthSessionGraphqlEnabled,
  changePasswordViaGraphql,
  loginViaGraphql,
  logoutViaGraphql,
  registerViaGraphql,
  requestPasswordResetViaGraphql,
  resetPasswordViaGraphql,
  resendVerificationViaGraphql,
  updateViewerProfileViaGraphql,
  verifyEmailViaGraphql,
} from './authGraphql';

vi.mock('@/services/graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlPublicRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

describe('authentication GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the complete session path behind one rollback flag', () => {
    vi.stubEnv('VITE_AUTH_SESSION_GRAPHQL', 'false');
    expect(isAuthSessionGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_AUTH_SESSION_GRAPHQL', 'true');
    expect(isAuthSessionGraphqlEnabled()).toBe(true);
  });

  it('keeps registration and verification behind an independent rollback flag', () => {
    vi.stubEnv('VITE_AUTH_IDENTITY_GRAPHQL', 'false');
    expect(isAuthIdentityGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_AUTH_IDENTITY_GRAPHQL', 'true');
    expect(isAuthIdentityGraphqlEnabled()).toBe(true);
  });

  it('keeps password recovery behind an independent rollback flag', () => {
    vi.stubEnv('VITE_AUTH_RECOVERY_GRAPHQL', 'false');
    expect(isAuthRecoveryGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_AUTH_RECOVERY_GRAPHQL', 'true');
    expect(isAuthRecoveryGraphqlEnabled()).toBe(true);
  });

  it('maps login, current-user, and logout operations', async () => {
    vi.mocked(graphqlPublicRequest).mockResolvedValue({
      login: { success: true, user: { uid: 7 } },
    });
    await expect(loginViaGraphql('member@example.com', 'password')).resolves.toMatchObject({
      success: true,
      user: { uid: 7 },
    });
    expect(graphqlPublicRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation Login'),
      { input: { email: 'member@example.com', password: 'password' } },
    );

    vi.mocked(graphqlRequest).mockResolvedValue({ currentUser: { id: 7 } });
    await expect(getCurrentUserViaGraphql()).resolves.toMatchObject({ id: 7 });

    vi.mocked(graphqlMutationRequest).mockResolvedValue({ logout: { success: true } });
    await expect(logoutViaGraphql()).resolves.toBeUndefined();
    expect(graphqlMutationRequest).toHaveBeenCalledWith(
      expect.stringContaining('mutation Logout'),
      {},
    );
  });

  it('maps registration, verification, and resend operations', async () => {
    vi.mocked(graphqlPublicRequest)
      .mockResolvedValueOnce({ register: { success: true, email: 'new@example.com' } })
      .mockResolvedValueOnce({ verifyEmail: { success: true, user: { uid: 8 } } })
      .mockResolvedValueOnce({ resendVerificationEmail: { success: true } });

    await registerViaGraphql('new@example.com', 'StrongPass1', 'New Member');
    expect(graphqlPublicRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation Register'),
      { input: { email: 'new@example.com', password: 'StrongPass1', name: 'New Member' } },
    );
    await expect(verifyEmailViaGraphql('token')).resolves.toMatchObject({ success: true });
    expect(graphqlPublicRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation VerifyEmail'),
      { input: { token: 'token' } },
    );
    await resendVerificationViaGraphql('new@example.com');
    expect(graphqlPublicRequest).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('mutation ResendVerificationEmail'),
      { input: { email: 'new@example.com' } },
    );
  });

  it('maps recovery plus protected password and profile mutations', async () => {
    vi.mocked(graphqlPublicRequest)
      .mockResolvedValueOnce({ requestPasswordReset: { success: true } })
      .mockResolvedValueOnce({ resetPassword: { success: true } });
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({ changePassword: { success: true } })
      .mockResolvedValueOnce({ updateViewerProfile: { id: 7, name: 'Updated' } });

    await requestPasswordResetViaGraphql('member@example.com');
    expect(graphqlPublicRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation RequestPasswordReset'),
      { input: { email: 'member@example.com' } },
    );
    await resetPasswordViaGraphql('reset-token', 'StrongPass2');
    expect(graphqlPublicRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation ResetPassword'),
      { input: { token: 'reset-token', password: 'StrongPass2' } },
    );
    await changePasswordViaGraphql('StrongPass1', 'StrongPass2');
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('mutation ChangePassword'),
      { input: { currentPassword: 'StrongPass1', newPassword: 'StrongPass2' } },
    );
    await updateViewerProfileViaGraphql('Updated');
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('mutation UpdateViewerProfile'),
      { input: { name: 'Updated' } },
    );
  });
});
