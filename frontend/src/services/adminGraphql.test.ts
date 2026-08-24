import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';
import { getAdminActivationFunnelViaGraphql, getAdminJobQueueDetailsViaGraphql, getAdminOperationsSnapshotViaGraphql, getAdminUserIdsViaGraphql, searchAdminUsersViaGraphql, updateAdminOwnPlanViaGraphql } from './adminGraphql';

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

  it('requests the bounded activation cohort explicitly', async () => {
    const funnel = {
      asOf: '2026-08-20T12:00:00.000Z', cohortStartedAt: '2026-07-21T12:00:00.000Z',
      cohortDays: 30, organizationsCreated: 10, organizationsVerified: 8,
      organizationsWorkspaceActivated: 6, organizationsTrialStarted: 5,
      organizationsContactCreated: 4, organizationsArtifactCreated: 4,
      organizationsSent: 4, organizationsCheckoutStarted: 2,
      organizationsSubscriptionActivated: 1,
      organizationsAdvanced: 3, organizationsReturned: 2,
      trialOrganizationsSent: 2, organizationsTrialToPaid: 1,
      sendRate: 0.4, verificationRate: 0.8, workspaceActivationRate: 0.75,
      trialStartRate: 0.625, contactCreationRate: 0.5, artifactCreationRate: 0.5,
      artifactToSendRate: 1, checkoutStartRate: 0.25,
      subscriptionActivationRate: 0.5, advanceRate: 0.75, returnRate: 0.5,
      trialToPaidRate: 0.5, medianHoursToWorkspace: 1,
      medianHoursToTrial: 2, medianHoursToContact: 3,
      medianHoursToArtifact: 4, medianHoursToSend: 5,
      medianHoursToAdvance: 6, medianHoursToCheckout: 7,
      medianHoursToSubscription: 8,
    };
    vi.mocked(graphqlRequest).mockResolvedValue({ adminActivationFunnel: funnel });
    await expect(getAdminActivationFunnelViaGraphql(30)).resolves.toEqual(funnel);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('AdminActivationFunnel'), { days: 30 },
    );
  });

  it('requests the complete read-only operations snapshot', async () => {
    const snapshot = {
      asOf: '2026-08-22T12:00:00.000Z', status: 'healthy', activeJobs: 0,
      retryingJobs: 0, actionRequiredJobs: 0, providers: [], queues: [],
    };
    vi.mocked(graphqlRequest).mockResolvedValue({ adminOperationsSnapshot: snapshot });
    await expect(getAdminOperationsSnapshotViaGraphql()).resolves.toEqual(snapshot);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('adminOperationsSnapshot'), {},
    );
  });

  it('requests bounded queue details with an explicit status bucket', async () => {
    const details = {
      queueId: 'realtime', name: 'Realtime events', bucket: 'queued' as const,
      available: true, total: 1, hasMore: false,
      kindCounts: [{ kind: 'CONTENT_CHANGED', count: 1 }], items: [],
    };
    vi.mocked(graphqlRequest).mockResolvedValue({ adminJobQueueDetails: details });
    await expect(getAdminJobQueueDetailsViaGraphql('realtime', 'queued', 25, 0)).resolves.toEqual(details);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('adminJobQueueDetails'),
      { queueId: 'realtime', bucket: 'queued', limit: 25, offset: 0 },
    );
  });
});
