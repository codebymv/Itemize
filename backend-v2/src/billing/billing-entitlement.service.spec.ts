import { Pool } from 'pg';
import { RequestContextService } from '../request-context/request-context.service';
import { BillingEntitlementService } from './billing-entitlement.service';

describe('BillingEntitlementService', () => {
  const requestContext = new RequestContextService();
  const pool = { query: jest.fn() };
  const service = new BillingEntitlementService(
    pool as unknown as Pool,
    requestContext,
  );

  beforeEach(() => jest.clearAllMocks());

  const inRequest = <T>(work: () => Promise<T>): Promise<T> =>
    requestContext.run({ requestId: 'entitlement-test' }, work);

  it.each([
    ['free', 'none', null],
    ['starter', 'canceled', null],
    ['starter', 'trialing', '2020-01-01T00:00:00.000Z'],
  ])(
    'denies plan %s with subscription state %s',
    async (plan, subscription_status, trial_ends_at) => {
      pool.query.mockResolvedValueOnce({
        rows: [{ plan, subscription_status, trial_ends_at }],
      });

      await expect(
        inRequest(() => service.assertPlan(7, 'starter')),
      ).rejects.toMatchObject({
        extensions: {
          code: 'FORBIDDEN',
          reason: 'SUBSCRIPTION_REQUIRED',
          requiredPlan: 'starter',
        },
      });
    },
  );

  it('allows an active plan at or above the required tier', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ plan: 'unlimited', subscription_status: 'active', trial_ends_at: null }],
    });

    await expect(
      inRequest(() => service.assertPlan(7, 'unlimited')),
    ).resolves.toBeUndefined();
  });

  it('allows an unexpired trial and caches billing state within the request', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        plan: 'starter',
        subscription_status: 'trialing',
        trial_ends_at: new Date(Date.now() + 60_000),
      }],
    });

    await inRequest(async () => {
      await service.assertPlan(7, 'starter');
      await service.assertPlan(7, 'starter');
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the organization no longer exists', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      inRequest(() => service.assertPlan(99, 'starter')),
    ).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND' } });
  });
});
