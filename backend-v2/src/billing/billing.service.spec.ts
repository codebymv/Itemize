import { GraphQLError } from 'graphql';
import { BillingRepository, BillingStatusRow } from './billing.repository';
import { BillingService } from './billing.service';
import { StripeBillingProvider } from './stripe-billing.provider';

describe('BillingService', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBillingEnabled =
    process.env.ITEMIZE_SUBSCRIPTION_BILLING_ENABLED;
  const repository = {
    status: jest.fn(),
    startSoloTrial: jest.fn(),
    ensureCustomer: jest.fn(),
    portalCustomer: jest.fn(),
    checkoutOrganization: jest.fn(),
    replaceStripeCustomer: jest.fn(),
  };
  const provider = {
    isConfigured: jest.fn(() => true),
    createCustomer: jest.fn(),
    activeSubscription: jest.fn(),
    createCheckoutSession: jest.fn(),
    createPortalSession: jest.fn(),
    changeSubscriptionPrice: jest.fn(),
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
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalBillingEnabled === undefined) {
      delete process.env.ITEMIZE_SUBSCRIPTION_BILLING_ENABLED;
    } else {
      process.env.ITEMIZE_SUBSCRIPTION_BILLING_ENABLED = originalBillingEnabled;
    }
  });

  const checkout = {
    planId: 'starter',
    billingPeriod: 'monthly',
    successUrl: 'https://itemize.test/success',
    cancelUrl: 'https://itemize.test/cancel',
    idempotencyKey: 'checkout-unit-test-key-0001',
  };

  const freeStatus = {
    plan: 'free',
    subscription_status: 'none',
    billing_period: 'monthly',
    billing_period_start: null,
    billing_period_end: null,
    stripe_customer_id: 'cus_abandoned_checkout',
    stripe_subscription_id: null,
    emails_used: 0,
    emails_limit: 0,
    sms_used: 0,
    sms_limit: 0,
    api_calls_used: 0,
    api_calls_limit: 0,
    contacts_limit: 0,
    users_limit: 1,
    workflows_limit: 0,
    landing_pages_limit: 0,
    forms_limit: 0,
    calendars_limit: 0,
    trial_started_at: null,
    trial_ends_at: null,
    trial_end_acknowledged_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
  } satisfies BillingStatusRow;

  it('publishes three complete purchasable plans', () => {
    expect(service.plans().map((plan) => plan.id)).toEqual([
      'starter',
      'unlimited',
      'pro',
    ]);
    expect(service.plans().every((plan) => Boolean(plan.pricing))).toBe(true);
  });

  it('starts one Solo trial for an eligible Free workspace without Stripe', async () => {
    const trialStart = new Date();
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    repository.status.mockResolvedValue(freeStatus);
    repository.startSoloTrial.mockResolvedValue({
      ...freeStatus,
      plan: 'starter',
      subscription_status: 'trialing',
      emails_limit: 1000,
      sms_limit: 500,
      contacts_limit: 5000,
      users_limit: 3,
      workflows_limit: 5,
      landing_pages_limit: 10,
      forms_limit: 10,
      calendars_limit: 3,
      trial_started_at: trialStart,
      trial_ends_at: trialEnd,
    });

    await expect(service.startSoloTrial(4)).resolves.toMatchObject({
      plan: 'starter',
      subscriptionStatus: 'trialing',
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
      stripeSubscriptionId: null,
    });
    expect(repository.startSoloTrial).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ emails: 1000, sms: 500, contacts: 5000 }),
    );
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects a repeat Solo trial', async () => {
    repository.status.mockResolvedValue({
      ...freeStatus,
      trial_started_at: new Date('2026-08-01T00:00:00.000Z'),
    });

    await expect(service.startSoloTrial(4)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'TRIAL_NOT_AVAILABLE' },
    });
    expect(repository.startSoloTrial).not.toHaveBeenCalled();
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

  it('fails closed for production subscription billing without an isolation flag', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ITEMIZE_SUBSCRIPTION_BILLING_ENABLED;

    await expect(service.checkout(4, checkout)).rejects.toMatchObject({
      message: 'Subscription checkout is temporarily unavailable',
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'BILLING_ISOLATION_REQUIRED',
      },
    });
    expect(repository.ensureCustomer).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalNodeEnv || 'test';
  });

  it('creates the Stripe customer with the organization owner email', async () => {
    repository.ensureCustomer.mockImplementation(
      async (
        _organizationId: number,
        create: (name: string, ownerEmail: string) => Promise<string>,
      ) => ({
        customerId: await create('Acme', 'owner@itemize.test'),
        existed: false,
      }),
    );
    provider.createCustomer.mockResolvedValue('cus_owner_email');
    provider.createCheckoutSession.mockResolvedValue(
      'https://stripe.test/checkout',
    );

    await expect(service.checkout(4, checkout)).resolves.toEqual({
      url: 'https://stripe.test/checkout',
    });
    expect(provider.createCustomer).toHaveBeenCalledWith({
      name: 'Acme',
      email: 'owner@itemize.test',
      organizationId: 4,
    });
  });

  it('routes an already-subscribed tenant to a provider portal', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue({
      id: 'sub_active',
      status: 'active',
      priceId: 'price_1U5ypmRxBJaRlFvtCDKzCKSC',
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

  it('routes a plan change through the portal instead of silently repricing an active subscription', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue({
      id: 'sub_active',
      status: 'active',
      priceId: 'price_1U5ypmRxBJaRlFvtCDKzCKSC',
    });
    provider.createPortalSession.mockResolvedValue('https://stripe.test/portal');

    await expect(
      service.checkout(4, { ...checkout, planId: 'unlimited' }),
    ).resolves.toEqual({
      url: 'https://stripe.test/portal',
    });
    expect(provider.createPortalSession).toHaveBeenCalledWith(
      'cus_existing',
      'https://itemize.test/success',
      'billing-portal:4:checkout-unit-test-key-0001',
    );
    expect(provider.changeSubscriptionPrice).not.toHaveBeenCalled();
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not fall back to a second checkout for an active subscription', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue({
      id: 'sub_active',
      status: 'active',
      priceId: 'price_1U5ypmRxBJaRlFvtCDKzCKSC',
    });
    provider.createPortalSession.mockResolvedValue('https://stripe.test/portal');

    await expect(
      service.checkout(4, { ...checkout, planId: 'unlimited' }),
    ).resolves.toEqual({
      url: 'https://stripe.test/portal',
    });
    expect(provider.changeSubscriptionPrice).not.toHaveBeenCalled();
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('replaces a missing Stripe customer and retries checkout', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_deleted',
      existed: true,
    });
    provider.activeSubscription.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      param: 'customer',
      message: "No such customer: 'cus_deleted'",
    });
    repository.checkoutOrganization.mockResolvedValue({
      name: 'Acme',
      ownerEmail: 'owner@itemize.test',
      stripeCustomerId: 'cus_deleted',
    });
    provider.createCustomer.mockResolvedValue('cus_new');
    provider.createCheckoutSession.mockResolvedValue(
      'https://stripe.test/checkout',
    );

    await expect(
      service.checkout(4, { ...checkout, planId: 'unlimited' }),
    ).resolves.toEqual({
      url: 'https://stripe.test/checkout',
    });
    expect(repository.replaceStripeCustomer).toHaveBeenCalledWith(4, 'cus_new');
    expect(provider.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_new' }),
    );
  });

  it('surfaces a safe Stripe price error', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue(null);
    provider.createCheckoutSession.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      message: "No such price: 'price_unlimited_monthly'",
    });

    await expect(
      service.checkout(4, { ...checkout, planId: 'unlimited' }),
    ).rejects.toMatchObject({
      message: 'This plan is not configured in Stripe yet',
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'BILLING_PROVIDER_FAILURE',
      },
    });
  });

  it('surfaces a Stripe test/live price mismatch', async () => {
    repository.ensureCustomer.mockResolvedValue({
      customerId: 'cus_existing',
      existed: true,
    });
    provider.activeSubscription.mockResolvedValue(null);
    provider.createCheckoutSession.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
      message:
        "No such price: 'price_1U5yqFRxBJaRlFvtcC8I6bbo'; a similar object exists in live mode, but a test mode key was used to make this request.",
    });

    await expect(
      service.checkout(4, { ...checkout, planId: 'unlimited' }),
    ).rejects.toMatchObject({
      message: 'Stripe test keys cannot checkout the live Solo/Studio prices',
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'BILLING_PROVIDER_FAILURE',
      },
    });
  });

  it('rejects yearly placeholders before calling Stripe', async () => {
    await expect(
      service.checkout(4, { ...checkout, billingPeriod: 'yearly' }),
    ).rejects.toMatchObject({
      message: 'This plan is not available for checkout yet',
      extensions: {
        code: 'SERVICE_UNAVAILABLE',
        reason: 'BILLING_PRICE_NOT_CONFIGURED',
      },
    });
    expect(repository.ensureCustomer).not.toHaveBeenCalled();
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
