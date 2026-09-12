import Stripe from 'stripe';
import { StripeSubscriptionStateProvider } from './stripe-subscription-state.provider';

const retrieve = jest.fn();
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn() }));

describe('Canonical Stripe subscription lookup', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = { ...original, STRIPE_SECRET_KEY: 'sk_test_unit' };
    jest.clearAllMocks();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({ subscriptions: { retrieve } }));
  });
  afterEach(() => { process.env = original; });

  it('retrieves canceled subscriptions too, with bounded provider requests', async () => {
    const subscription = { id: 'sub_unit', customer: 'cus_unit', status: 'canceled' };
    retrieve.mockResolvedValue(subscription);
    expect(await new StripeSubscriptionStateProvider().retrieve('sub_unit')).toEqual(subscription);
    expect(retrieve).toHaveBeenCalledWith('sub_unit');
    expect(Stripe).toHaveBeenCalledWith('sk_test_unit', { timeout: 10_000, maxNetworkRetries: 1 });
  });

  it('fails without credentials before attempting a provider request', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(new StripeSubscriptionStateProvider().retrieve('sub_unit')).rejects.toThrow('not configured');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it.each(['resource_missing', 'rate_limit', 'connection_error'])('retries %s without exposing SDK errors', async code => {
    retrieve.mockRejectedValue(Object.assign(new Error('Invalid API Key provided: sk_test_sensitive'), { code }));
    await expect(new StripeSubscriptionStateProvider().retrieve('sub_unit')).rejects.toThrow(
      'Stripe subscription state lookup failed; retry required',
    );
  });
});
