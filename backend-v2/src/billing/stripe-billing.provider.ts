import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

export type BillingSubscription = {
  id: string;
  status: string;
  priceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

@Injectable()
export class StripeBillingProvider {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY?.trim() || 'sk_test_unconfigured',
      { maxNetworkRetries: 1, timeout: 10_000 },
    );
  }

  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  }

  async createCustomer(input: {
    email: string;
    name: string;
    organizationId: number;
    generation?: string;
  }): Promise<string> {
    this.requireConfiguration();
    const customer = await this.stripe.customers.create(
      {
        email: input.email,
        name: input.name,
        metadata: { organizationId: String(input.organizationId) },
      },
      {
        idempotencyKey: input.generation
          ? `billing-customer:${input.organizationId}:${input.generation}`
          : `billing-customer:${input.organizationId}`,
      },
    );
    return customer.id;
  }

  async activeSubscription(
    customerId: string,
  ): Promise<BillingSubscription | null> {
    this.requireConfiguration();
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    const subscription = subscriptions.data.find(
      (candidate) =>
        candidate.status === 'active' || candidate.status === 'trialing',
    );
    if (!subscription) return null;
    const raw = subscription as unknown as Record<string, unknown>;
    const items = subscription.items.data;
    const firstItem = items[0] as unknown as Record<string, unknown> | undefined;
    return {
      id: subscription.id,
      status: subscription.status,
      priceId: items[0]?.price?.id ?? null,
      currentPeriodStart: this.timestamp(
        raw.current_period_start ?? firstItem?.current_period_start,
      ),
      currentPeriodEnd: this.timestamp(
        raw.current_period_end ?? firstItem?.current_period_end,
      ),
      trialEnd: this.timestamp(raw.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    organizationId: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<string> {
    this.requireConfiguration();
    const session = await this.stripe.checkout.sessions.create(
      {
        customer: input.customerId,
        mode: 'subscription',
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          organizationId: String(input.organizationId),
          type: 'subscription_upgrade',
        },
      },
      {
        idempotencyKey: `billing-checkout:${input.organizationId}:${input.idempotencyKey}`,
      },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return session.url;
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
    idempotencyKey: string,
  ): Promise<string> {
    this.requireConfiguration();
    const session = await this.stripe.billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: returnUrl,
      },
      { idempotencyKey },
    );
    return session.url;
  }

  async changeSubscriptionPrice(
    subscriptionId: string,
    priceId: string,
  ): Promise<void> {
    this.requireConfiguration();
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) throw new Error('Subscription has no items');
    await this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'create_prorations',
    });
  }

  private requireConfiguration(): void {
    if (!this.isConfigured()) throw new Error('Stripe is not configured');
  }

  private timestamp(value: unknown): Date | null {
    return typeof value === 'number' && Number.isFinite(value)
      ? new Date(value * 1000)
      : null;
  }
}
