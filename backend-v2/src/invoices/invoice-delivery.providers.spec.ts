import { StripeInvoicePaymentLinkProvider } from './invoice-delivery.providers';

describe('StripeInvoicePaymentLinkProvider', () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const originalFrontend = process.env.FRONTEND_URL;
  const request = {
    invoiceId: 12,
    invoiceNumber: 'INV-12',
    organizationId: 4,
    amountDue: '26.06',
    currency: 'USD',
    customerName: 'Ada',
    customerEmail: null,
    existingSessionId: 'cs_existing',
    idempotencyKey: 'invoice-payment:4:12',
  };

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_contract';
    process.env.FRONTEND_URL = 'https://app.itemize.test/path';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = originalSecret;
    process.env.FRONTEND_URL = originalFrontend;
  });

  it('reuses an open session only when tenant, invoice, amount, and currency match', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'cs_existing', status: 'open', url: 'https://checkout.test/existing',
        amount_total: 2606, currency: 'usd',
        metadata: { invoice_id: '12', organization_id: '4' },
      }),
    });

    await expect(new StripeInvoicePaymentLinkProvider().getOrCreate(request))
      .resolves.toEqual({
        kind: 'ready', sessionId: 'cs_existing',
        url: 'https://checkout.test/existing',
      });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('creates a new session instead of reusing a stale-balance session', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'open', url: 'https://checkout.test/stale',
          amount_total: 2500, currency: 'usd',
          metadata: { invoice_id: '12', organization_id: '4' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cs_fresh', url: 'https://checkout.test/fresh' }),
      });

    await expect(new StripeInvoicePaymentLinkProvider().getOrCreate(request))
      .resolves.toEqual({
        kind: 'ready', sessionId: 'cs_fresh', url: 'https://checkout.test/fresh',
      });
    const [, createCall] = (global.fetch as jest.Mock).mock.calls;
    expect(createCall[0]).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(createCall[1].headers['Idempotency-Key']).toBe(request.idempotencyKey);
    expect(createCall[1].body).toContain('unit_amount%5D=2606');
    expect(createCall[1].body).not.toContain('customer_email');
    expect(createCall[1].body).toContain(
      'success_url=https%3A%2F%2Fapp.itemize.test%2Finvoices',
    );
  });

  it('returns a definite rejection without attempting Stripe for a zero balance', async () => {
    await expect(new StripeInvoicePaymentLinkProvider().getOrCreate({
      ...request, amountDue: '0.00',
    })).resolves.toEqual({
      kind: 'rejected', message: 'Invoice has no payable balance',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
