import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import { getAdminUserIdsViaGraphql, searchAdminUsersViaGraphql, updateAdminOwnPlanViaGraphql } from './adminGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./graphqlClient')>(), graphqlRequest: vi.fn(), graphqlMutationRequest: vi.fn(),
}));

describe('admin GraphQL adapters', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

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
