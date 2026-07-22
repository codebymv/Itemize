import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type { AdminUser, SearchUsersResponse, SystemStats, UserCountResponse } from './adminApi';

type GraphqlAdminUser = {
  id: number; email: string; name: string | null; role: 'USER' | 'ADMIN';
  plan: string; createdAt: string;
};

const fields = 'id email name role plan createdAt';

export const getAdminUserCountViaGraphql = async (): Promise<UserCountResponse> => {
  const data = await graphqlRequest<{ adminUserCount: UserCountResponse }, Record<string, never>>(
    'query AdminUserCount { adminUserCount { count } }', {},
  );
  return data.adminUserCount;
};

export const searchAdminUsersViaGraphql = async (input: {
  query?: string; page?: number; limit?: number; plan?: string;
}): Promise<SearchUsersResponse> => {
  const data = await graphqlRequest<
    { adminUsers: SearchUsersResponse }, { input: typeof input }
  >(`query AdminUsers($input: AdminUserSearchInput) {
    adminUsers(input: $input) { users { ${fields} } total hasMore }
  }`, { input });
  return data.adminUsers;
};

export const getAdminUserIdsViaGraphql = async (query?: string, plan?: string): Promise<{ ids: number[] }> => {
  const input = { ...(query ? { query } : {}), ...(plan ? { plan } : {}) };
  const data = await graphqlRequest<{ adminUserIds: { ids: number[] } }, { input: typeof input }>(
    'query AdminUserIds($input:AdminUserIdsInput){ adminUserIds(input:$input){ ids } }', { input },
  );
  return data.adminUserIds;
};

export const getAdminUsersByIdsViaGraphql = async (ids: number[]): Promise<{ users: AdminUser[] }> => {
  const data = await graphqlRequest<{ adminUsersByIds: AdminUser[] }, { ids: number[] }>(
    `query AdminUsersByIds($ids:[Int!]!){ adminUsersByIds(ids:$ids){ ${fields} } }`, { ids },
  );
  return { users: data.adminUsersByIds };
};

export const getAdminStatsViaGraphql = async (): Promise<SystemStats> => {
  const data = await graphqlRequest<{ adminSystemStats: SystemStats }, Record<string, never>>(
    'query AdminSystemStats { adminSystemStats { users contacts invoices } }', {},
  );
  return data.adminSystemStats;
};

export const updateAdminOwnPlanViaGraphql = async (plan: string): Promise<{ message: string; plan: string }> => {
  const data = await graphqlMutationRequest<
    { updateAdminOwnPlan: { message: string; plan: string } }, { plan: string }
  >('mutation UpdateAdminOwnPlan($plan:String!){ updateAdminOwnPlan(plan:$plan){ message plan } }', { plan });
  return data.updateAdminOwnPlan;
};
