import { HttpStripeConnectClient } from './stripe-connect.provider';

const stripeResponse = (
  status: number,
  body: Record<string, unknown>,
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('HttpStripeConnectClient', () => {
  const savedSecret = process.env.STRIPE_SECRET_KEY;
  const savedNodeEnv = process.env.NODE_ENV;
  const savedOrigin = process.env.STRIPE_CONNECT_API_ORIGIN;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_itemize';
    process.env.NODE_ENV = 'test';
    process.env.STRIPE_CONNECT_API_ORIGIN = 'https://api.test.itemize';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = savedSecret;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedOrigin === undefined) delete process.env.STRIPE_CONNECT_API_ORIGIN;
    else process.env.STRIPE_CONNECT_API_ORIGIN = savedOrigin;
  });

  it('creates a Stripe-managed connected account scoped to the organization', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      stripeResponse(200, {
        id: 'acct_Connected123',
        charges_enabled: false,
        details_submitted: false,
      }),
    );

    await expect(new HttpStripeConnectClient().createAccount(7)).resolves.toEqual({
      stripeAccountId: 'acct_Connected123',
      chargesEnabled: false,
      detailsSubmitted: false,
    });

    const [, options] = request.mock.calls[0];
    const body = new URLSearchParams(String(options?.body));
    expect(body.has('type')).toBe(false);
    expect(body.get('controller[losses][payments]')).toBe('stripe');
    expect(body.get('controller[fees][payer]')).toBe('account');
    expect(body.get('controller[requirement_collection]')).toBe('stripe');
    expect(body.get('controller[stripe_dashboard][type]')).toBe('full');
    expect(body.get('metadata[itemize_organization_id]')).toBe('7');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer sk_test_itemize',
      'Idempotency-Key': 'itemize-connect-account-7',
    });
  });

  it('creates a single-use hosted onboarding link with signed-state return routes', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      stripeResponse(200, {
        url: 'https://connect.stripe.com/setup/s/example',
      }),
    );

    await expect(
      new HttpStripeConnectClient().createOnboardingLink(
        'acct_Connected123',
        'signed.state',
      ),
    ).resolves.toBe('https://connect.stripe.com/setup/s/example');

    const [, options] = request.mock.calls[0];
    const body = new URLSearchParams(String(options?.body));
    expect(body.get('account')).toBe('acct_Connected123');
    expect(body.get('type')).toBe('account_onboarding');
    expect(body.get('collection_options[fields]')).toBe('eventually_due');
    expect(body.get('refresh_url')).toBe(
      'https://api.test.itemize/api/invoice-integrations/stripe/refresh?state=signed.state',
    );
    expect(body.get('return_url')).toBe(
      'https://api.test.itemize/api/invoice-integrations/stripe/return?state=signed.state',
    );
  });

  it('treats a removed connected account as absent', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(stripeResponse(404, {}));
    await expect(
      new HttpStripeConnectClient().retrieveAccount('acct_Removed123'),
    ).resolves.toBeNull();
  });
});
