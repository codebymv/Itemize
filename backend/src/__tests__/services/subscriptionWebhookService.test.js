const Stripe = require('stripe');
const {
  compareStripeProviderOrder,
  normalizeStripeSubscriptionEvent,
  normalizedStripeSubscriptionEventFromClaim,
  snapshotStripeSubscriptionEvent,
  verifyStripeSubscriptionWebhook,
} = require('../../services/subscriptionWebhookService');

describe('Stripe subscription webhook policy', () => {
  test('verifies an exact raw Stripe payload', () => {
    const stripe = new Stripe('sk_test_subscription_webhook');
    const secret = 'whsec_subscription_test';
    const payload = JSON.stringify({ id: 'evt_1', object: 'event' });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

    expect(verifyStripeSubscriptionWebhook({
      payload: Buffer.from(payload), signature, stripe, secret,
    })).toMatchObject({ id: 'evt_1' });
  });

  test('fails closed without a signing secret or raw body', () => {
    const stripe = new Stripe('sk_test_subscription_webhook');
    expect(() => verifyStripeSubscriptionWebhook({
      payload: Buffer.from('{}'), signature: 'signature', stripe, secret: '',
    })).toThrow('Stripe webhook secret is not configured');
    expect(() => verifyStripeSubscriptionWebhook({
      payload: {}, signature: 'signature', stripe, secret: 'whsec_test',
    })).toThrow('Raw webhook body is required');
  });

  test('normalizes stable event, customer, subscription, and occurrence identities', () => {
    const normalized = normalizeStripeSubscriptionEvent({
      id: 'evt_update',
      type: 'customer.subscription.updated',
      created: 1784120000,
      data: { object: { id: 'sub_1', customer: { id: 'cus_1' } } },
    });
    expect(normalized).toMatchObject({
      customerId: 'cus_1',
      eventId: 'evt_update',
      objectId: 'sub_1',
      subscriptionId: 'sub_1',
      supported: true,
    });
  });

  test('rejects missing object identity and occurrence time', () => {
    expect(() => normalizeStripeSubscriptionEvent({
      id: 'evt_bad', type: 'customer.subscription.updated', created: 1784120000, data: { object: {} },
    })).toThrow('Invalid Stripe event object');
    expect(() => normalizeStripeSubscriptionEvent({
      id: 'evt_bad', type: 'customer.subscription.updated', created: 0,
      data: { object: { id: 'sub_1' } },
    })).toThrow('Invalid Stripe event timestamp');
  });

  test('persists only the normalized fields needed for reconciliation', () => {
    const normalized = normalizeStripeSubscriptionEvent({
      id: 'evt_snapshot',
      type: 'customer.subscription.updated',
      created: 1784120000,
      data: { object: {
        id: 'sub_snapshot',
        customer: 'cus_snapshot',
        customer_email: 'private@example.com',
        status: 'active',
        current_period_start: 1784119000,
        current_period_end: 1786711000,
        items: { data: [{ price: { id: 'price_unlimited_monthly', recurring: { interval: 'month' } } }] },
      } },
    });
    const snapshot = snapshotStripeSubscriptionEvent(normalized);
    expect(snapshot).toMatchObject({
      customerId: 'cus_snapshot',
      subscriptionId: 'sub_snapshot',
      priceId: 'price_unlimited_monthly',
      status: 'active',
    });
    expect(JSON.stringify(snapshot)).not.toContain('private@example.com');
  });

  test('reconstructs a normalized event from its minimal claim snapshot', () => {
    const normalized = normalizedStripeSubscriptionEventFromClaim({
      stripe_event_id: 'evt_replay',
      event_type: 'invoice.payment_failed',
      object_id: 'in_replay',
      object_created_at: new Date('2026-07-15T12:00:00.000Z'),
      event_snapshot: {
        customerId: 'cus_replay',
        subscriptionId: 'sub_replay',
      },
    });
    expect(normalized).toMatchObject({
      eventId: 'evt_replay',
      objectId: 'in_replay',
      customerId: 'cus_replay',
      subscriptionId: 'sub_replay',
    });
  });

  test('orders same-second events deterministically by their stable event IDs', () => {
    const organization = {
      subscription_provider_updated_at: new Date('2026-07-15T12:00:00.000Z'),
      subscription_provider_event_id: 'evt_middle',
    };
    const event = eventId => ({
      eventCreatedAt: new Date('2026-07-15T12:00:00.000Z'),
      eventId,
    });
    expect(compareStripeProviderOrder(event('evt_after'), organization)).toBe(-1);
    expect(compareStripeProviderOrder(event('evt_zulu'), organization)).toBe(1);
    expect(compareStripeProviderOrder(event('evt_middle'), organization)).toBe(0);
  });
});
