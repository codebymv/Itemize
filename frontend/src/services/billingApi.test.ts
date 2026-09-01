import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeBillingTrialEndViaGraphql,
  createBillingCheckoutViaGraphql,
  createBillingPortalViaGraphql,
  getBillingPlansViaGraphql,
  getBillingStatusViaGraphql,
  getBillingUsageViaGraphql,
  startBillingSoloTrialViaGraphql,
} from './billingGraphql';
import {
  acknowledgeTrialEnd,
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  getPlans,
  getUsageStats,
  startSoloTrial,
} from './billingApi';

vi.mock('./billingGraphql', () => ({
  acknowledgeBillingTrialEndViaGraphql: vi.fn(),
  createBillingCheckoutViaGraphql: vi.fn(),
  createBillingPortalViaGraphql: vi.fn(),
  getBillingPlansViaGraphql: vi.fn(),
  getBillingStatusViaGraphql: vi.fn(),
  getBillingUsageViaGraphql: vi.fn(),
  startBillingSoloTrialViaGraphql: vi.fn(),
}));

describe('billing API compatibility facade', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves success envelopes for all billing GraphQL operations', async () => {
    vi.mocked(getBillingStatusViaGraphql).mockResolvedValue({ plan: 'starter' } as never);
    vi.mocked(getBillingPlansViaGraphql).mockResolvedValue([]);
    vi.mocked(getBillingUsageViaGraphql).mockResolvedValue({} as never);
    vi.mocked(createBillingCheckoutViaGraphql).mockResolvedValue({ url: 'checkout' });
    vi.mocked(createBillingPortalViaGraphql).mockResolvedValue({ url: 'portal' });
    vi.mocked(acknowledgeBillingTrialEndViaGraphql).mockResolvedValue({
      acknowledged: true,
    });
    vi.mocked(startBillingSoloTrialViaGraphql).mockResolvedValue({
      plan: 'starter',
      subscription_status: 'trialing',
    } as never);

    expect(await getBillingStatus()).toMatchObject({ success: true });
    expect(await getPlans()).toEqual({ success: true, data: [] });
    expect(await getUsageStats()).toMatchObject({ success: true });
    expect(
      await createCheckoutSession({
        planId: 'starter',
        successUrl: 'https://itemize.cloud/success',
        cancelUrl: 'https://itemize.cloud/cancel',
        idempotencyKey: 'checkout-request-0001',
      }),
    ).toEqual({ success: true, data: { url: 'checkout' } });
    expect(await createPortalSession(
      'https://itemize.cloud/settings',
      'portal-request-0001',
    )).toEqual({
      success: true,
      data: { url: 'portal' },
    });
    expect(await acknowledgeTrialEnd()).toEqual({
      success: true,
      data: { acknowledged: true },
    });
    expect(await startSoloTrial()).toMatchObject({
      success: true,
      data: { plan: 'starter', subscription_status: 'trialing' },
    });
  });

  it('preserves failure envelopes instead of leaking rejected requests', async () => {
    vi.mocked(getBillingStatusViaGraphql).mockRejectedValue(
      new Error('Billing unavailable'),
    );
    expect(await getBillingStatus()).toEqual({
      success: false,
      error: 'Billing unavailable',
    });
  });
});
