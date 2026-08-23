import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import type { ActivationFunnel, AdminUser, OperationsSnapshot, SearchUsersResponse, SystemStats, UserCountResponse } from './adminApi';

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

export const getAdminActivationFunnelViaGraphql = async (
  days = 30,
): Promise<ActivationFunnel> => {
  const data = await graphqlRequest<
    { adminActivationFunnel: ActivationFunnel }, { days: number }
  >(`query AdminActivationFunnel($days: Int) {
    adminActivationFunnel(days: $days) {
      asOf cohortStartedAt cohortDays organizationsCreated organizationsSent
      organizationsAdvanced organizationsReturned trialOrganizationsSent
      organizationsTrialToPaid sendRate advanceRate returnRate trialToPaidRate
    }
  }`, { days });
  return data.adminActivationFunnel;
};

export const getAdminOperationsSnapshotViaGraphql = async (): Promise<OperationsSnapshot> => {
  const data = await graphqlRequest<
    { adminOperationsSnapshot: OperationsSnapshot }, Record<string, never>
  >(`query AdminOperationsSnapshot {
    adminOperationsSnapshot {
      asOf status activeJobs retryingJobs actionRequiredJobs
      providers { id name status detail required }
      queues {
        id name status available queued processing retrying actionRequired active oldestPendingAt
      }
    }
  }`, {});
  return data.adminOperationsSnapshot;
};

export const updateAdminOwnPlanViaGraphql = async (plan: string): Promise<{ message: string; plan: string }> => {
  const data = await graphqlMutationRequest<
    { updateAdminOwnPlan: { message: string; plan: string } }, { plan: string }
  >('mutation UpdateAdminOwnPlan($plan:String!){ updateAdminOwnPlan(plan:$plan){ message plan } }', { plan });
  return data.updateAdminOwnPlan;
};
