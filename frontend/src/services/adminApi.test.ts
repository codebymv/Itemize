import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStats, getUserCount, getUserIds, getUsersByIds, searchUsers, updateMyPlan } from './adminApi';
import * as adminGraphql from './adminGraphql';
import { isAdminDirectoryGraphqlEnabled, isAdminPlanGraphqlEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('./graphqlClient', () => ({
  isAdminDirectoryGraphqlEnabled: vi.fn(), isAdminPlanGraphqlEnabled: vi.fn(),
}));
vi.mock('./adminGraphql', () => ({
  getAdminStatsViaGraphql: vi.fn(), getAdminUserCountViaGraphql: vi.fn(),
  getAdminUserIdsViaGraphql: vi.fn(), getAdminUsersByIdsViaGraphql: vi.fn(),
  searchAdminUsersViaGraphql: vi.fn(), updateAdminOwnPlanViaGraphql: vi.fn(),
}));

describe('admin API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdminDirectoryGraphqlEnabled).mockReturnValue(false);
    vi.mocked(isAdminPlanGraphqlEnabled).mockReturnValue(false);
  });

  it('keeps legacy requests available while flags are disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: {} } });
    vi.mocked(api.patch).mockResolvedValue({ data: { data: {} } });
    await getUserCount();
    await searchUsers({ query: 'x', page: 1, limit: 20, plan: 'pro' });
    await getUserIds('x', 'pro');
    await getUsersByIds([2, 1]);
    await getStats();
    await updateMyPlan('pro');
    expect(api.get).toHaveBeenCalledWith('/api/admin/users/ids', { params: { query: 'x', plan: 'pro' } });
    expect(api.patch).toHaveBeenCalledWith('/api/admin/me/plan', { plan: 'pro' });
    expect(adminGraphql.getAdminStatsViaGraphql).not.toHaveBeenCalled();
  });

  it('routes directory reads and plan mutation through independent GraphQL flags', async () => {
    vi.mocked(isAdminDirectoryGraphqlEnabled).mockReturnValue(true);
    vi.mocked(isAdminPlanGraphqlEnabled).mockReturnValue(true);
    vi.mocked(adminGraphql.getAdminUserCountViaGraphql).mockResolvedValue({ count: 2 });
    vi.mocked(adminGraphql.searchAdminUsersViaGraphql).mockResolvedValue({ users: [], total: 0, hasMore: false });
    vi.mocked(adminGraphql.getAdminUserIdsViaGraphql).mockResolvedValue({ ids: [4] });
    vi.mocked(adminGraphql.getAdminUsersByIdsViaGraphql).mockResolvedValue({ users: [] });
    vi.mocked(adminGraphql.getAdminStatsViaGraphql).mockResolvedValue({ users: 2, contacts: 3, invoices: 4 });
    vi.mocked(adminGraphql.updateAdminOwnPlanViaGraphql).mockResolvedValue({ message: 'Plan updated to pro', plan: 'pro' });
    await getUserCount();
    await searchUsers({ query: 'x', page: 1, limit: 20, plan: 'pro' });
    await getUserIds('x', 'pro');
    await getUsersByIds([4]);
    await getStats();
    await updateMyPlan('pro');
    expect(adminGraphql.getAdminUserIdsViaGraphql).toHaveBeenCalledWith('x', 'pro');
    expect(adminGraphql.searchAdminUsersViaGraphql).toHaveBeenCalledWith({ query: 'x', page: 1, limit: 20, plan: 'pro' });
    expect(api.get).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
