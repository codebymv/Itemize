import { GraphQLError } from 'graphql';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { StripeBillingProvider } from './stripe-billing.provider';

describe('BillingService', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const repository = {
    ensureCustomer: jest.fn(),
    portalCustomer: jest.fn(),
  };
  const provider = {
    isConfigured: jest.fn(() => true),
    createCustomer: jest.fn(),
    activeSubscription: jest.fn(),
    createCheckoutSession: jest.fn(),
    createPortalSession: jest.fn(),
  };
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://itemize.test';
    provider.isConfigured.mockReturnValue(true);
    service = new BillingService(
      repository as unknown as BillingRepository,
      provider as unknown as StripeBillingProvider,
    );
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  const checkout = {
    planId: 'starter',
    billingPeriod: 'monthly',
    successUrl: 'https://itemize.test/success',
    cancelUrl: 'https://itemize.test/cancel',
    idempotencyKey: 'checkout-unit-test-key-0001',
  };

  it('publishes three complete purchasable plans', () => {
    expect(service.plans().map((plan) => plan.id)).toEqual([
      'starter',
      'unlimited',
      'pro',
    ]);
    expect(service.plans().every((plan) => Boolean(plan.pricing))).toBe(true);
  });

  it('rejects unsupported modes, prices, redirect origins, and weak keys before provider work', async () => {
    for (const input of [
      { ...checkout, mode: 'payment' },
      { ...checkout, planId: undefined, priceId: 'price_untrusted' },
      { ...checkout, successUrl: 'https://attacker.test/success' },
      { ...checkout, idempotencyKey: 'short' },
    ]) {
      await expect(service.checkout(4, input)).rejects.toBeInstanceOf(
        GraphQLError,
      );
    }
    expect(repository.ensureCustomer).not.toHaveBeenCalled();
  });

  it('routes an already-subscribed tenant to a provider portal', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue({
      id: 'sub_active',
      status: 'active',
    });
    provider.createPortalSession.mockResolvedValue('https://stripe.test/portal');

    await expect(service.checkout(4, checkout)).resolves.toEqual({
      url: 'https://stripe.test/portal',
    });
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
    expect(provider.createPortalSession).toHaveBeenCalledWith(
      'cus_existing',
      'https://itemize.test/success',
      'billing-portal:4:checkout-unit-test-key-0001',
    );
  });

  it('redacts provider failures behind a stable service error', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockRejectedValue(
      new Error('Stripe rejected sk_live_secret'),
    );
    await expect(service.checkout(4, checkout)).rejects.toMatchObject({
      message: 'Billing provider request failed',
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'BILLING_PROVIDER_FAILURE',
      },
    });
  });
});
