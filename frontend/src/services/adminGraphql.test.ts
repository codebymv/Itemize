import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest, isAdminDirectoryGraphqlEnabled, isAdminPlanGraphqlEnabled } from './graphqlClient';
import { getAdminUserIdsViaGraphql, searchAdminUsersViaGraphql, updateAdminOwnPlanViaGraphql } from './adminGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(), graphqlRequest: vi.fn(), graphqlMutationRequest: vi.fn(),
}));

describe('admin GraphQL adapters', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it('uses independent default-off rollout boundaries', () => {
    vi.stubEnv('VITE_ADMIN_DIRECTORY_GRAPHQL', 'false');
    vi.stubEnv('VITE_ADMIN_PLAN_GRAPHQL', 'false');
    expect(isAdminDirectoryGraphqlEnabled()).toBe(false);
    expect(isAdminPlanGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_ADMIN_DIRECTORY_GRAPHQL', 'true');
    vi.stubEnv('VITE_ADMIN_PLAN_GRAPHQL', 'true');
    expect(isAdminDirectoryGraphqlEnabled()).toBe(true);
    expect(isAdminPlanGraphqlEnabled()).toBe(true);
  });

  it('carries the plan filter through search and all-IDs queries', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ adminUsers: { users: [], total: 0, hasMore: false } })
      .mockResolvedValueOnce({ adminUserIds: { ids: [7] } });
    await searchAdminUsersViaGraphql({ query: 'x', plan: 'pro', page: 0, limit: 50 });
    await getAdminUserIdsViaGraphql('x', 'pro');
    expect(graphqlRequest).toHaveBeenNthCalledWith(2, expect.stringContaining('AdminUserIds'), { input: { query: 'x', plan: 'pro' } });
  });

  it('uses the CSRF-protected mutation transport for plan changes', async () => {
    vi.mocked(graphqlMutationRequest).mockResolvedValue({ updateAdminOwnPlan: { message: 'ok', plan: 'pro' } });
    await expect(updateAdminOwnPlanViaGraphql('pro')).resolves.toEqual({ message: 'ok', plan: 'pro' });
    expect(graphqlMutationRequest).toHaveBeenCalledWith(expect.stringContaining('UpdateAdminOwnPlan'), { plan: 'pro' });
  });
});
