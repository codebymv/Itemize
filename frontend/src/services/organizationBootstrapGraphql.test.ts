import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphqlRequestError, graphqlRequest } from './graphqlClient';
import {
  getOrganizationBootstrapViaGraphql,
  resetOrganizationBootstrapCapability,
} from './organizationBootstrapGraphql';

vi.mock('./graphqlClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./graphqlClient')>()),
  graphqlRequest: vi.fn(),
}));

describe('organization bootstrap GraphQL adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOrganizationBootstrapCapability();
  });

  it('loads same-lifecycle shell state through one organization-scoped operation', async () => {
    const signal = new AbortController().signal;
    vi.mocked(graphqlRequest).mockResolvedValue({
      billingStatus: {
        plan: 'starter',
        subscriptionStatus: 'trialing',
        billingPeriod: 'monthly',
        billingPeriodStart: null,
        billingPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        emailsUsed: 0,
        emailsLimit: 1000,
        smsUsed: 0,
        smsLimit: 500,
        apiCallsUsed: 0,
        apiCallsLimit: 100,
        contactsLimit: 5000,
        usersLimit: 3,
        workflowsLimit: 5,
        landingPagesLimit: 10,
        formsLimit: 10,
        calendarsLimit: 3,
        trialStartedAt: null,
        trialEligible: false,
        trialEndsAt: null,
        trialEndAcknowledgedAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
      onboardingProgress: [{
        featureKey: 'dashboard',
        seen: true,
        timestamp: null,
        version: '2.0',
        dismissed: false,
        stepCompleted: null,
      }],
      getStartedProgress: {
        dismissed: false,
        completedCount: 1,
        totalCount: 3,
        steps: [],
      },
    });

    await expect(getOrganizationBootstrapViaGraphql(42, signal)).resolves.toMatchObject({
      billingStatus: { plan: 'starter', subscription_status: 'trialing' },
      onboardingProgress: { dashboard: { seen: true, version: '2.0' } },
      getStartedProgress: { completedCount: 1 },
    });

    expect(graphqlRequest).toHaveBeenCalledTimes(1);
    expect(graphqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('query OrganizationBootstrap'),
      {},
      42,
      signal,
    );
    const operation = vi.mocked(graphqlRequest).mock.calls[0][0];
    expect(operation).toContain('billingStatus');
    expect(operation).toContain('onboardingProgress');
    expect(operation).toContain('getStartedProgress');
  });

  it('negotiates an older schema once and remembers the separate-read capability', async () => {
    vi.mocked(graphqlRequest)
      .mockRejectedValueOnce(new GraphqlRequestError(
        'Cannot query field "getStartedProgress"',
        400,
        'GRAPHQL_VALIDATION_FAILED',
      ))
      .mockResolvedValueOnce({ billingStatus: { plan: 'free' } })
      .mockResolvedValueOnce({ onboardingProgress: [] })
      .mockResolvedValueOnce({
        getStartedProgress: { dismissed: false, completedCount: 0, totalCount: 0, steps: [] },
      });

    await expect(getOrganizationBootstrapViaGraphql(7)).resolves.toMatchObject({
      billingStatus: { plan: 'free' },
      onboardingProgress: {},
    });
    expect(graphqlRequest).toHaveBeenCalledTimes(4);

    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({ billingStatus: { plan: 'starter' } })
      .mockResolvedValueOnce({ onboardingProgress: [] })
      .mockResolvedValueOnce({
        getStartedProgress: { dismissed: false, completedCount: 0, totalCount: 0, steps: [] },
      });

    await getOrganizationBootstrapViaGraphql(8);
    expect(graphqlRequest).toHaveBeenCalledTimes(7);
    expect(vi.mocked(graphqlRequest).mock.calls[4][0]).toContain('BootstrapBillingStatus');
  });
});
