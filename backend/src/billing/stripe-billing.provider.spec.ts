import Stripe from 'stripe';
import { StripeBillingProvider } from './stripe-billing.provider';

const list = jest.fn();
const portalCreate = jest.fn();
jest.mock('stripe', () => ({ __esModule: true, default: jest.fn() }));

describe('Stripe billing recovery boundary', () => {
  const original = process.env;
  beforeEach(() => {
    process.env = { ...original, STRIPE_SECRET_KEY: 'sk_test_unit', STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_itemize' };
    jest.clearAllMocks();
    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      subscriptions: { list }, billingPortal: { sessions: { create: portalCreate } },
    }));
  });
  afterEach(() => { process.env = original; });

  it.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])(
    'finds %s subscriptions for checkout recovery, even after historical rows', async status => {
      list.mockImplementation(() => (async function* () {
        for (let i = 0; i < 12; i++) yield { id: `old_${i}`, status: 'canceled' };
        yield { id: 'sub_current', status, items: { data: [{ price: { id: 'price_current' } }] } };
      })());
      const provider = new StripeBillingProvider();
      expect((await provider.activeSubscription('cus_unit', true))?.id).toBe('sub_current');
      expect((await provider.activeSubscription('cus_unit'))?.id ?? null)
        .toBe(['active', 'trialing'].includes(status) ? 'sub_current' : null);
    },
  );

  it('uses the isolated Itemize portal configuration', async () => {
    portalCreate.mockResolvedValue({ url: 'https://billing.stripe.test/session' });
    await new StripeBillingProvider().createPortalSession('cus_unit', 'https://itemize.test/settings', 'stable-key');
    expect(portalCreate).toHaveBeenCalledWith({ customer: 'cus_unit', return_url: 'https://itemize.test/settings', configuration: 'bpc_itemize' }, { idempotencyKey: 'stable-key' });
  });
});
