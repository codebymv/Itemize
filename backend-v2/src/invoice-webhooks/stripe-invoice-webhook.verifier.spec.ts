import Stripe from 'stripe';
import {
  StripeInvoiceWebhookUnavailableError,
  StripeInvoiceWebhookVerificationError,
  StripeSdkInvoiceWebhookVerifier,
} from './stripe-invoice-webhook.verifier';

describe('StripeSdkInvoiceWebhookVerifier', () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = 'whsec_invoice_verifier_test';
  const stripe = new Stripe('sk_test_webhook_verification_test');
  const payload = Buffer.from(
    '{"id":"evt_exact","type":"checkout.session.expired","data":{"object":{}}}',
  );

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  });

  it('verifies the exact raw bytes with Stripe signature semantics', () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString('utf8'),
      secret,
    });
    const verifier = new StripeSdkInvoiceWebhookVerifier();

    expect(verifier.verify(payload, signature)).toMatchObject({
      id: 'evt_exact',
      type: 'checkout.session.expired',
    });
    expect(() => verifier.verify(Buffer.concat([payload, Buffer.from(' ')]), signature))
      .toThrow(StripeInvoiceWebhookVerificationError);
    const staleSignature = stripe.webhooks.generateTestHeaderString({
      payload: payload.toString('utf8'),
      secret,
      timestamp: Math.floor(Date.now() / 1000) - 301,
    });
    expect(() => verifier.verify(payload, staleSignature))
      .toThrow(StripeInvoiceWebhookVerificationError);
  });

  it('fails closed when signing configuration or the signature is absent', () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const verifier = new StripeSdkInvoiceWebhookVerifier();
    expect(() => verifier.verify(payload, 'signed'))
      .toThrow(StripeInvoiceWebhookUnavailableError);

    process.env.STRIPE_WEBHOOK_SECRET = secret;
    expect(() => verifier.verify(payload, undefined))
      .toThrow(StripeInvoiceWebhookVerificationError);
  });
});
