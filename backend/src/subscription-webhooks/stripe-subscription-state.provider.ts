import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

/** Webhook snapshots identify a subscription; only a fresh read supplies its state. */
@Injectable()
export class StripeSubscriptionStateProvider {
  private readonly stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY?.trim() || 'sk_test_unconfigured',
    { timeout: 10_000, maxNetworkRetries: 1 },
  );

  async retrieve(subscriptionId: string): Promise<Stripe.Subscription> {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      throw new Error('Stripe subscription state lookup is not configured');
    }
    // Canceled subscriptions remain retrievable. A missing resource or provider
    // outage must retry, never fall back to the potentially obsolete snapshot.
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch {
      // SDK errors can contain credentials or provider object details; the
      // controller and reconciliation worker only need a safe retry reason.
      throw new Error('Stripe subscription state lookup failed; retry required');
    }
  }
}
