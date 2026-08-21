import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  graphqlMutationRequest,
  graphqlPublicRequest,
  graphqlRequest,
} from './graphqlClient';
import {
  acknowledgeBillingTrialEndViaGraphql,
  createBillingCheckoutViaGraphql,
  createBillingPortalViaGraphql,
  getBillingPlansViaGraphql,
  getBillingStatusViaGraphql,
  getBillingUsageViaGraphql,
  startBillingSoloTrialViaGraphql,
} from './billingGraphql';

vi.mock('./graphqlClient', () => ({
  graphqlMutationRequest: vi.fn(),
  graphqlPublicRequest: vi.fn(),
  graphqlRequest: vi.fn(),
}));

describe('billing GraphQL adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps status and unlimited usage to retained consumer shapes', async () => {
    vi.mocked(graphqlRequest)
      .mockResolvedValueOnce({
        billingStatus: {
          plan: 'starter',
          subscriptionStatus: 'trialing',
          billingPeriod: 'monthly',
          billingPeriodStart: null,
          billingPeriodEnd: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          emailsUsed: 2,
          emailsLimit: 1000,
          smsUsed: 1,
          smsLimit: 500,
          apiCallsUsed: 3,
          apiCallsLimit: 0,
          contactsLimit: 5000,
          usersLimit: 3,
          workflowsLimit: 5,
          landingPagesLimit: 10,
          formsLimit: 10,
          calendarsLimit: 3,
          trialStartedAt: '2026-08-21T18:51:00.000Z',
          trialEndsAt: null,
          trialEndAcknowledgedAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      })
      .mockResolvedValueOnce({
        billingUsage: {
          period: { start: null, end: null },
          usage: {
            emails: { used: 2, limit: -1, percentage: 0 },
            sms: { used: 1, limit: 500, percentage: 0 },
            apiCalls: { used: 3, limit: 0, percentage: 0 },
          },
          resources: {
            contacts: 4,
            workflows: 5,
            forms: 6,
            landingPages: 7,
          },
        },
      });

    expect(await getBillingStatusViaGraphql()).toMatchObject({
      subscription_status: 'trialing',
      billing_period: 'monthly',
      emails_used: 2,
      landing_pages_limit: 10,
      trial_started_at: '2026-08-21T18:51:00.000Z',
      cancel_at_period_end: false,
    });
    expect((await getBillingUsageViaGraphql()).usage.emails.limit).toBe(
      'unlimited',
    );
    expect(graphqlRequest).toHaveBeenCalledTimes(2);
  });

  it('uses the public transport for plans', async () => {
    const plans = [
      {
        id: 'starter',
        name: 'Starter',
        displayName: 'Starter',
        tagline: 'Small teams',
        description: 'Start',
        icon: 'zap',
        color: 'blue',
        bgColor: 'blue-bg',
        borderColor: 'blue-border',
        popular: false,
        pricing: { monthly: 97, yearly: 970, yearlyMonthly: 80.83 },
        tier: 1,
        limits: {
          organizations: 3,
          contacts: 5000,
          users: 3,
          workflows: 5,
          emails: 1000,
          sms: 500,
          landingPages: 10,
          forms: 10,
          calendars: 3,
          apiCalls: 0,
          storage: 1024,
        },
      },
    ];
    vi.mocked(graphqlPublicRequest).mockResolvedValue({ billingPlans: plans });
    expect(await getBillingPlansViaGraphql()).toEqual(plans);
    expect(graphqlPublicRequest).toHaveBeenCalledWith(
      expect.stringContaining('query BillingPlans'),
      {},
    );
  });

  it('routes all provider session writes through CSRF-protected mutations', async () => {
    vi.mocked(graphqlMutationRequest)
      .mockResolvedValueOnce({
        createBillingCheckoutSession: { url: 'https://stripe.test/checkout' },
      })
      .mockResolvedValueOnce({
        createBillingPortalSession: { url: 'https://stripe.test/portal' },
      })
      .mockResolvedValueOnce({
        acknowledgeBillingTrialEnd: { acknowledged: true },
      })
      .mockResolvedValueOnce({
        startBillingSoloTrial: {
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
          apiCallsLimit: 0,
          contactsLimit: 5000,
          usersLimit: 3,
          workflowsLimit: 5,
          landingPagesLimit: 10,
          formsLimit: 10,
          calendarsLimit: 3,
          trialStartedAt: '2026-08-21T18:51:00.000Z',
          trialEndsAt: '2026-09-04T00:00:00.000Z',
          trialEndAcknowledgedAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

    const checkout = {
      planId: 'starter' as const,
      billingPeriod: 'monthly' as const,
      mode: 'subscription' as const,
      successUrl: 'https://itemize.cloud/success',
      cancelUrl: 'https://itemize.cloud/cancel',
    };
    expect(await createBillingCheckoutViaGraphql(checkout)).toEqual({
      url: 'https://stripe.test/checkout',
    });
    expect(
      await createBillingPortalViaGraphql('https://itemize.cloud/settings'),
    ).toEqual({ url: 'https://stripe.test/portal' });
    expect(await acknowledgeBillingTrialEndViaGraphql()).toEqual({
      acknowledged: true,
    });
    expect(await startBillingSoloTrialViaGraphql()).toMatchObject({
      plan: 'starter',
      subscription_status: 'trialing',
      emails_limit: 1000,
    });
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CreateBillingCheckoutSession'),
      {
        input: {
          ...checkout,
          idempotencyKey: expect.any(String),
        },
      },
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CreateBillingPortalSession'),
      {
        input: {
          returnUrl: 'https://itemize.cloud/settings',
          idempotencyKey: expect.any(String),
        },
      },
    );
    expect(graphqlMutationRequest).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('StartBillingSoloTrial'),
      {},
    );
  });
});
