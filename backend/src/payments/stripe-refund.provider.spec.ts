import { StripeRefundProvider } from './stripe-refund.provider';

describe('StripeRefundProvider', () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const request = {
    paymentIntentId: 'pi_payment_7',
    stripeAccountId: 'acct_Merchant123',
    amount: '25.50',
    paymentId: 7,
    organizationId: 3,
    idempotencyKey: 'payment-refund:3:refund-request-0001',
    reason: 'Customer request',
  };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_contract';
    global.fetch = jest.fn();
  });

  afterAll(() => { process.env.STRIPE_SECRET_KEY = originalSecret; });

  it('creates a connected-account refund with cents and an idempotency key', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 're_Refund31', status: 'succeeded' }),
    });

    await expect(new StripeRefundProvider().create(request)).resolves.toEqual({
      kind: 'accepted',
      refundId: 're_Refund31',
      status: 'succeeded',
      failureCode: null,
      failureMessage: null,
    });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/refunds');
    expect(init.headers['Stripe-Account']).toBe('acct_Merchant123');
    expect(init.headers['Idempotency-Key']).toBe(request.idempotencyKey);
    expect(init.body).toContain('amount=2550');
    expect(init.body).toContain('payment_intent=pi_payment_7');
    expect(init.body).not.toContain('Customer+request&reason=');
  });

  it('preserves requires-action as a nonterminal provider state', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 're_Refund32', status: 'requires_action' }),
    });
    await expect(new StripeRefundProvider().create(request)).resolves.toMatchObject({
      kind: 'accepted', status: 'requires_action',
    });
  });

  it('rejects malformed connected-account evidence before the network', async () => {
    await expect(new StripeRefundProvider().create({
      ...request,
      stripeAccountId: 'acct_../foreign',
    })).resolves.toMatchObject({ kind: 'rejected' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
