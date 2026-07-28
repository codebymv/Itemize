import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStats, getUserCount, getUserIds, getUsersByIds, searchUsers, updateMyPlan } from './adminApi';
import * as adminGraphql from './adminGraphql';

vi.mock('./adminGraphql', () => ({
  getAdminStatsViaGraphql: vi.fn(), getAdminUserCountViaGraphql: vi.fn(),
  getAdminUserIdsViaGraphql: vi.fn(), getAdminUsersByIdsViaGraphql: vi.fn(),
  searchAdminUsersViaGraphql: vi.fn(), updateAdminOwnPlanViaGraphql: vi.fn(),
}));

describe('admin GraphQL service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates every operation to its GraphQL adapter', async () => {
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
    expect(adminGraphql.getAdminUserCountViaGraphql).toHaveBeenCalledOnce();
    expect(adminGraphql.getAdminUserIdsViaGraphql).toHaveBeenCalledWith('x', 'pro');
    expect(adminGraphql.searchAdminUsersViaGraphql).toHaveBeenCalledWith({ query: 'x', page: 1, limit: 20, plan: 'pro' });
    expect(adminGraphql.getAdminUsersByIdsViaGraphql).toHaveBeenCalledWith([4]);
    expect(adminGraphql.getAdminStatsViaGraphql).toHaveBeenCalledOnce();
    expect(adminGraphql.updateAdminOwnPlanViaGraphql).toHaveBeenCalledWith('pro');
  });
});
