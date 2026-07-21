import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlPublicRequest,
  graphqlRequest,
} from '@/services/graphqlClient';
import {
  getCurrentUserViaGraphql,
  isAuthSessionGraphqlEnabled,
  loginViaGraphql,
  logoutViaGraphql,
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
});
