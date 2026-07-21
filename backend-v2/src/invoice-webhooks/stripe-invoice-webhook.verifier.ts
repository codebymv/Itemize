import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

export class StripeInvoiceWebhookUnavailableError extends Error {
  constructor() {
    super('Stripe invoice webhook verification is unavailable');
    this.name = 'StripeInvoiceWebhookUnavailableError';
  }
}

export class StripeInvoiceWebhookVerificationError extends Error {
  constructor() {
    super('Stripe invoice webhook signature is invalid');
    this.name = 'StripeInvoiceWebhookVerificationError';
  }
}

export const STRIPE_INVOICE_WEBHOOK_VERIFIER = Symbol(
  'STRIPE_INVOICE_WEBHOOK_VERIFIER',
);

export interface StripeInvoiceWebhookVerifier {
  verify(payload: Buffer, signature: string | undefined): Stripe.Event;
}

@Injectable()
export class StripeSdkInvoiceWebhookVerifier
  implements StripeInvoiceWebhookVerifier
{
  private readonly stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_verification_only',
  );

  verify(payload: Buffer, signature: string | undefined): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new StripeInvoiceWebhookUnavailableError();
    if (!signature) throw new StripeInvoiceWebhookVerificationError();
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      throw new StripeInvoiceWebhookVerificationError();
    }
  }
}
