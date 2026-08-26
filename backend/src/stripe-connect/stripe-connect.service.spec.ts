import { Pool, PoolClient } from 'pg';
import {
  createStripeConnectState,
  verifyStripeConnectState,
} from './stripe-connect-state';
import { StripeConnectClient } from './stripe-connect.provider';
import { StripeConnectService } from './stripe-connect.service';

describe('StripeConnectService', () => {
  const savedSecret = process.env.JWT_SECRET;
  let stripe: jest.Mocked<StripeConnectClient>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'stripe-connect-service-secret';
    stripe = {
      createAccount: jest.fn(),
      retrieveAccount: jest.fn(),
      createOnboardingLink: jest.fn(),
    };
  });

  afterAll(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it('reuses the organization account and returns a hosted onboarding link', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_Existing123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    stripe.retrieveAccount.mockResolvedValue({
      stripeAccountId: 'acct_Existing123',
      chargesEnabled: false,
      detailsSubmitted: false,
    });
    stripe.createOnboardingLink.mockResolvedValue(
      'https://connect.stripe.com/setup/s/example',
    );

    const service = new StripeConnectService(stripe, pool);
    await expect(service.start(5, 9, '/payment-settings')).resolves.toBe(
      'https://connect.stripe.com/setup/s/example',
    );

    expect(stripe.createAccount).not.toHaveBeenCalled();
    const state = stripe.createOnboardingLink.mock.calls[0][1];
    expect(verifyStripeConnectState(state)).toEqual({
      userId: 5,
      organizationId: 9,
      returnPath: '/payment-settings',
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('marks onboarding complete only when details and charges are active', async () => {
    const stateServicePool = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('organization_members')) return { rows: [{ '?column?': 1 }] };
        if (sql.includes('SELECT stripe_account_id')) {
          return { rows: [{ stripe_account_id: 'acct_Connected123' }] };
        }
        return { rows: [] };
      }),
    } as unknown as Pool;
    stripe.retrieveAccount.mockResolvedValue({
      stripeAccountId: 'acct_Connected123',
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    const service = new StripeConnectService(stripe, stateServicePool);
    const startedAt = Date.now();
    const state = createStripeConnectState(
      { userId: 5, organizationId: 9, returnUrl: '/payment-settings' },
      { now: startedAt },
    );

    await expect(service.complete(state)).resolves.toEqual({
      connected: true,
      returnPath: '/payment-settings',
    });
    expect(stateServicePool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET stripe_connected = $2'),
      [9, true],
    );
  });

  it('disables local payment use without losing the reusable account reference', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
    const service = new StripeConnectService(stripe, pool);

    await expect(service.disconnect(9)).resolves.toBe(true);
    const sql = String((pool.query as jest.Mock).mock.calls[0][0]);
    expect(sql).toContain('stripe_connected = FALSE');
    expect(sql).not.toContain('stripe_account_id = NULL');
  });
});
