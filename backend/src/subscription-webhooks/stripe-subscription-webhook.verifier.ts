import Stripe from 'stripe';

export const STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER = Symbol(
  'STRIPE_SUBSCRIPTION_WEBHOOK_VERIFIER',
);

export class StripeSubscriptionWebhookUnavailableError extends Error {
  constructor() {
    super('Stripe webhook secret is not configured');
    this.name = 'StripeSubscriptionWebhookUnavailableError';
  }
}

export class StripeSubscriptionWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeSubscriptionWebhookVerificationError';
  }
}

export interface StripeSubscriptionWebhookVerifier {
  verify(payload: Buffer, signature: string | undefined): Stripe.Event;
}

export class StripeSdkSubscriptionWebhookVerifier
  implements StripeSubscriptionWebhookVerifier
{
  private readonly stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_verification_only',
  );

  verify(payload: Buffer, signature: string | undefined): Stripe.Event {
    const secret =
      process.env.STRIPE_BILLING_WEBHOOK_SECRET?.trim() ||
      process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new StripeSubscriptionWebhookUnavailableError();
    if (!Buffer.isBuffer(payload)) {
      throw new StripeSubscriptionWebhookVerificationError(
        'Raw webhook body is required',
      );
    }
    if (!signature || typeof signature !== 'string') {
      throw new StripeSubscriptionWebhookVerificationError(
        'Missing Stripe signature',
      );
    }
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      throw new StripeSubscriptionWebhookVerificationError(
        (error as Error).message,
      );
    }
  }
}
