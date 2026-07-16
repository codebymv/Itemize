const express = require('express');
const request = require('supertest');
const Stripe = require('stripe');

const TestDbHelper = require('./test-db-helper');
const createBillingRoutes = require('../../routes/billing.routes');
const {
  runSubscriptionWebhookNotificationJobs,
  runSubscriptionWebhookReconciliationJobs,
} = require('../../jobs/subscription-webhook-jobs');

const webhookSecret = 'whsec_subscription_integration';
const stripe = new Stripe('sk_test_subscription_integration');

function createApp(pool) {
  const app = express();
  app.use('/api/billing', createBillingRoutes(pool, (_req, _res, next) => next()));
  return app;
}

function signedPost(app, event, { valid = true } = {}) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: valid ? webhookSecret : 'whsec_wrong',
  });
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

function subscriptionEvent({
  created = 1784120000,
  customerId,
  eventId,
  priceId = 'price_unlimited_monthly',
  status = 'active',
  subscriptionId,
  type = 'customer.subscription.updated',
}) {
  return {
    id: eventId,
    object: 'event',
    type,
    created,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status,
        current_period_start: 1784119000,
        current_period_end: 1786711000,
        cancel_at_period_end: false,
        items: {
          data: [{ price: { id: priceId, recurring: { interval: 'month' } } }],
        },
      },
    },
  };
}

describe('Stripe subscription webhook PostgreSQL contract', () => {
  let dbHelper;
  let app;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    app = createApp(dbHelper.pool);
  }, 30000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    await dbHelper.teardown();
  }, 30000);

  async function createBillingOrganization(label, customerId, subscriptionId = null) {
    const user = await dbHelper.seedUser(
      `${label}-${Date.now()}-${Math.random()}@test.itemize`,
      `Billing ${label}`
    );
    await dbHelper.pool.query(`
      UPDATE organizations SET
        stripe_customer_id = $1,
        stripe_subscription_id = $2,
        plan = 'starter',
        subscription_status = 'trialing',
        emails_used = 8,
        sms_used = 7,
        api_calls_used = 6
      WHERE id = $3
    `, [customerId, subscriptionId, user.org.id]);
    return user;
  }

  test('fails closed and rejects invalid signatures before claiming an event', async () => {
    const event = subscriptionEvent({
      customerId: 'cus_invalid', eventId: `evt_invalid_${Date.now()}`, subscriptionId: 'sub_invalid',
    });
    expect((await signedPost(app, event, { valid: false })).status).toBe(400);

    process.env.STRIPE_WEBHOOK_SECRET = '';
    const unavailable = await signedPost(app, event);
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    expect(unavailable.status).toBe(503);

    const claims = await dbHelper.pool.query(
      'SELECT stripe_event_id FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1', [event.id]
    );
    expect(claims.rows).toHaveLength(0);
  });

  test('concurrent duplicate updates apply once and persist upgrade notification intent', async () => {
    const customerId = `cus_upgrade_${Date.now()}`;
    const subscriptionId = `sub_upgrade_${Date.now()}`;
    const user = await createBillingOrganization('upgrade', customerId);
    const event = subscriptionEvent({
      customerId, eventId: `evt_upgrade_${Date.now()}`, subscriptionId,
    });

    const [first, duplicate] = await Promise.all([
      signedPost(app, event),
      signedPost(app, event),
    ]);
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);

    const [org, subscription, claim, audit] = await Promise.all([
      dbHelper.pool.query(`
        SELECT plan, subscription_status, stripe_subscription_id,
               emails_used, sms_used, api_calls_used
        FROM organizations WHERE id = $1
      `, [user.org.id]),
      dbHelper.pool.query('SELECT status, stripe_subscription_id FROM subscriptions WHERE organization_id = $1', [user.org.id]),
      dbHelper.pool.query(`
        SELECT processing_status, notification_type, notification_status
        FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1
      `, [event.id]),
      dbHelper.pool.query('SELECT COUNT(*)::int AS count FROM subscription_events WHERE stripe_event_id = $1', [event.id]),
    ]);
    expect(org.rows[0]).toMatchObject({
      plan: 'unlimited', subscription_status: 'active', stripe_subscription_id: subscriptionId,
      emails_used: 0, sms_used: 0, api_calls_used: 0,
    });
    expect(subscription.rows[0]).toMatchObject({ status: 'active', stripe_subscription_id: subscriptionId });
    expect(claim.rows[0]).toMatchObject({
      processing_status: 'processed',
      notification_type: 'subscription_upgraded',
      notification_status: 'pending',
    });
    expect(audit.rows[0].count).toBe(1);
  });

  test('an older deletion is recorded without regressing newer active state', async () => {
    const customerId = `cus_order_${Date.now()}`;
    const subscriptionId = `sub_order_${Date.now()}`;
    const user = await createBillingOrganization('ordering', customerId);
    const update = subscriptionEvent({
      created: 1900000200,
      customerId,
      eventId: `evt_new_${Date.now()}`,
      priceId: 'price_starter_monthly',
      subscriptionId,
    });
    const deleted = subscriptionEvent({
      created: 1900000100,
      customerId,
      eventId: `evt_old_${Date.now()}`,
      status: 'canceled',
      subscriptionId,
      type: 'customer.subscription.deleted',
    });

    expect((await signedPost(app, update)).status).toBe(200);
    expect((await signedPost(app, deleted)).status).toBe(200);
    const [org, claim] = await Promise.all([
      dbHelper.pool.query('SELECT subscription_status FROM organizations WHERE id = $1', [user.org.id]),
      dbHelper.pool.query('SELECT processing_status FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1', [deleted.id]),
    ]);
    expect(org.rows[0].subscription_status).toBe('active');
    expect(claim.rows[0].processing_status).toBe('stale');
  });

  test('quarantines a Stripe customer mapped to multiple organizations', async () => {
    const customerId = `cus_ambiguous_${Date.now()}`;
    const first = await createBillingOrganization('ambiguous-a', customerId);
    const second = await createBillingOrganization('ambiguous-b', customerId);
    const event = subscriptionEvent({
      customerId, eventId: `evt_ambiguous_${Date.now()}`, subscriptionId: `sub_ambiguous_${Date.now()}`,
    });

    expect((await signedPost(app, event)).status).toBe(200);
    const [claim, organizations] = await Promise.all([
      dbHelper.pool.query('SELECT processing_status, organization_id FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1', [event.id]),
      dbHelper.pool.query('SELECT subscription_status FROM organizations WHERE id = ANY($1::int[]) ORDER BY id', [[first.org.id, second.org.id]]),
    ]);
    expect(claim.rows[0]).toMatchObject({ processing_status: 'ambiguous', organization_id: null });
    expect(organizations.rows.map(row => row.subscription_status)).toEqual(['trialing', 'trialing']);
  });

  test('payment failure uses payload identity without a second Stripe API call', async () => {
    const customerId = `cus_failed_${Date.now()}`;
    const subscriptionId = `sub_failed_${Date.now()}`;
    const user = await createBillingOrganization('failed', customerId, subscriptionId);
    const event = {
      id: `evt_failed_${Date.now()}`,
      object: 'event',
      type: 'invoice.payment_failed',
      created: 1900000300,
      data: { object: {
        id: `in_failed_${Date.now()}`,
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
      } },
    };

    expect((await signedPost(app, event)).status).toBe(200);
    const [org, claim] = await Promise.all([
      dbHelper.pool.query('SELECT subscription_status FROM organizations WHERE id = $1', [user.org.id]),
      dbHelper.pool.query('SELECT processing_status FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1', [event.id]),
    ]);
    expect(org.rows[0].subscription_status).toBe('past_due');
    expect(claim.rows[0].processing_status).toBe('processed');
  });

  test('concurrent notification workers deliver one idempotent upgrade email', async () => {
    const customerId = `cus_notify_${Date.now()}`;
    const subscriptionId = `sub_notify_${Date.now()}`;
    await createBillingOrganization('notify', customerId);
    const event = subscriptionEvent({
      customerId, eventId: `evt_notify_${Date.now()}`, subscriptionId,
    });
    expect((await signedPost(app, event)).status).toBe(200);
    await dbHelper.pool.query(`
      UPDATE stripe_subscription_webhook_events
      SET notification_status = 'sent', notification_sent_at = CURRENT_TIMESTAMP
      WHERE stripe_event_id <> $1 AND notification_status = 'pending'
    `, [event.id]);
    const sendNotification = jest.fn().mockResolvedValue({ id: 'email_notification_1' });

    const results = await Promise.all([
      runSubscriptionWebhookNotificationJobs(dbHelper.pool, { batchSize: 1, sendNotification }),
      runSubscriptionWebhookNotificationJobs(dbHelper.pool, { batchSize: 1, sendNotification }),
    ]);
    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      stripe_event_id: event.id,
      owner_email: expect.stringMatching(/@test\.itemize$/),
    }));

    const claim = await dbHelper.pool.query(`
      SELECT notification_status, notification_attempt_count,
             notification_provider_id, notification_sent_at
      FROM stripe_subscription_webhook_events
      WHERE stripe_event_id = $1
    `, [event.id]);
    expect(claim.rows[0]).toMatchObject({
      notification_status: 'sent',
      notification_attempt_count: 1,
      notification_provider_id: 'email_notification_1',
    });
    expect(claim.rows[0].notification_sent_at).not.toBeNull();
  });

  test('failed notifications retry and later complete without losing the attempt history', async () => {
    const customerId = `cus_retry_${Date.now()}`;
    const subscriptionId = `sub_retry_${Date.now()}`;
    await createBillingOrganization('retry', customerId);
    const event = subscriptionEvent({
      customerId, eventId: `evt_retry_${Date.now()}`, subscriptionId,
    });
    expect((await signedPost(app, event)).status).toBe(200);

    const failed = await runSubscriptionWebhookNotificationJobs(dbHelper.pool, {
      baseDelayMs: 1,
      batchSize: 1,
      maxAttempts: 3,
      sendNotification: jest.fn().mockRejectedValue(new Error('Failed owner@example.com with re_secret123')),
    });
    expect(failed).toMatchObject({ claimed: 1, retry: 1, sent: 0 });
    await dbHelper.pool.query(`
      UPDATE stripe_subscription_webhook_events
      SET notification_next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE stripe_event_id = $1
    `, [event.id]);

    const succeeded = await runSubscriptionWebhookNotificationJobs(dbHelper.pool, {
      batchSize: 1,
      maxAttempts: 3,
      sendNotification: jest.fn().mockResolvedValue({ id: 'email_retry_success' }),
    });
    expect(succeeded).toMatchObject({ claimed: 1, retry: 0, sent: 1 });
    const claim = await dbHelper.pool.query(`
      SELECT notification_status, notification_attempt_count,
             notification_last_error, notification_provider_id
      FROM stripe_subscription_webhook_events
      WHERE stripe_event_id = $1
    `, [event.id]);
    expect(claim.rows[0]).toMatchObject({
      notification_status: 'sent',
      notification_attempt_count: 2,
      notification_last_error: null,
      notification_provider_id: 'email_retry_success',
    });
  });

  test('exhausted notification attempts become redacted dead letters', async () => {
    const customerId = `cus_dead_${Date.now()}`;
    const subscriptionId = `sub_dead_${Date.now()}`;
    await createBillingOrganization('dead-letter', customerId);
    const event = subscriptionEvent({
      customerId, eventId: `evt_dead_${Date.now()}`, subscriptionId,
    });
    expect((await signedPost(app, event)).status).toBe(200);

    const result = await runSubscriptionWebhookNotificationJobs(dbHelper.pool, {
      batchSize: 1,
      maxAttempts: 1,
      sendNotification: jest.fn().mockRejectedValue(
        new Error('Provider rejected owner@example.com using whsec_secret456')
      ),
    });
    expect(result).toMatchObject({ claimed: 1, deadLetter: 1, sent: 0 });
    const claim = await dbHelper.pool.query(`
      SELECT notification_status, notification_attempt_count,
             notification_next_attempt_at, notification_last_error
      FROM stripe_subscription_webhook_events
      WHERE stripe_event_id = $1
    `, [event.id]);
    expect(claim.rows[0]).toMatchObject({
      notification_status: 'dead_letter',
      notification_attempt_count: 1,
      notification_next_attempt_at: null,
      notification_last_error: 'Provider rejected [redacted-email] using [redacted-secret]',
    });
  });

  test('same-second Stripe events converge on a deterministic event-ID tie break', async () => {
    const suffix = Date.now();
    const firstCustomer = `cus_tie_first_${suffix}`;
    const secondCustomer = `cus_tie_second_${suffix}`;
    const first = await createBillingOrganization('tie-first', firstCustomer);
    const second = await createBillingOrganization('tie-second', secondCustomer);
    const created = 1900000400;
    const lowId = `evt_a_${suffix}`;
    const highId = `evt_z_${suffix}`;
    const eventFor = (customerId, eventId, type, status) => subscriptionEvent({
      created,
      customerId,
      eventId,
      priceId: 'price_starter_monthly',
      status,
      subscriptionId: `sub_tie_${customerId}`,
      type,
    });

    expect((await signedPost(app, eventFor(
      firstCustomer, lowId, 'customer.subscription.updated', 'active'
    ))).status).toBe(200);
    expect((await signedPost(app, eventFor(
      firstCustomer, highId, 'customer.subscription.deleted', 'canceled'
    ))).status).toBe(200);
    expect((await signedPost(app, eventFor(
      secondCustomer, highId.replace('evt_z_', 'evt_z_second_'),
      'customer.subscription.deleted', 'canceled'
    ))).status).toBe(200);
    expect((await signedPost(app, eventFor(
      secondCustomer, lowId.replace('evt_a_', 'evt_a_second_'),
      'customer.subscription.updated', 'active'
    ))).status).toBe(200);

    const organizations = await dbHelper.pool.query(`
      SELECT id, subscription_status, subscription_provider_event_id
      FROM organizations
      WHERE id = ANY($1::integer[])
      ORDER BY id
    `, [[first.org.id, second.org.id]]);
    expect(organizations.rows[0]).toMatchObject({
      subscription_status: 'canceled',
      subscription_provider_event_id: highId,
    });
    expect(organizations.rows[1]).toMatchObject({
      subscription_status: 'canceled',
      subscription_provider_event_id: highId.replace('evt_z_', 'evt_z_second_'),
    });
  });

  test('an unmatched event is replayed once after its tenant mapping appears', async () => {
    const suffix = Date.now();
    const customerId = `cus_reconcile_unmatched_${suffix}`;
    const event = subscriptionEvent({
      customerId,
      eventId: `evt_reconcile_unmatched_${suffix}`,
      subscriptionId: `sub_reconcile_unmatched_${suffix}`,
    });
    expect((await signedPost(app, event)).status).toBe(200);
    const user = await createBillingOrganization('reconcile-unmatched', customerId);
    await dbHelper.pool.query(`
      UPDATE stripe_subscription_webhook_events
      SET reconciliation_status = 'dead_letter'
      WHERE stripe_event_id <> $1 AND reconciliation_status IN ('pending', 'retry')
    `, [event.id]);

    const results = await Promise.all([
      runSubscriptionWebhookReconciliationJobs(dbHelper.pool, { batchSize: 1 }),
      runSubscriptionWebhookReconciliationJobs(dbHelper.pool, { batchSize: 1 }),
    ]);
    expect(results.reduce((total, result) => total + result.resolved, 0)).toBe(1);
    const [organization, claim, audit] = await Promise.all([
      dbHelper.pool.query(`
        SELECT plan, subscription_status, stripe_subscription_id
        FROM organizations WHERE id = $1
      `, [user.org.id]),
      dbHelper.pool.query(`
        SELECT processing_status, reconciliation_status, reconciliation_attempt_count,
               reconciled_at
        FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1
      `, [event.id]),
      dbHelper.pool.query(`
        SELECT COUNT(*)::integer AS count
        FROM subscription_events WHERE stripe_event_id = $1
      `, [event.id]),
    ]);
    expect(organization.rows[0]).toMatchObject({
      plan: 'unlimited',
      subscription_status: 'active',
      stripe_subscription_id: event.data.object.id,
    });
    expect(claim.rows[0]).toMatchObject({
      processing_status: 'processed',
      reconciliation_status: 'resolved',
      reconciliation_attempt_count: 1,
    });
    expect(claim.rows[0].reconciled_at).not.toBeNull();
    expect(audit.rows[0].count).toBe(1);
  });

  test('ambiguous reconciliation retries until tenant mapping becomes unique', async () => {
    const suffix = Date.now();
    const customerId = `cus_reconcile_ambiguous_${suffix}`;
    const first = await createBillingOrganization('reconcile-ambiguous-a', customerId);
    const second = await createBillingOrganization('reconcile-ambiguous-b', customerId);
    const event = subscriptionEvent({
      customerId,
      eventId: `evt_reconcile_ambiguous_${suffix}`,
      subscriptionId: `sub_reconcile_ambiguous_${suffix}`,
    });
    expect((await signedPost(app, event)).status).toBe(200);
    await dbHelper.pool.query(`
      UPDATE stripe_subscription_webhook_events
      SET reconciliation_status = 'dead_letter'
      WHERE stripe_event_id <> $1 AND reconciliation_status IN ('pending', 'retry')
    `, [event.id]);

    const deferred = await runSubscriptionWebhookReconciliationJobs(dbHelper.pool, {
      baseDelayMs: 1, batchSize: 1, maxAttempts: 3,
    });
    expect(deferred).toMatchObject({ claimed: 1, retry: 1, resolved: 0 });
    await dbHelper.pool.query(
      'UPDATE organizations SET stripe_customer_id = NULL WHERE id = $1',
      [second.org.id]
    );
    await dbHelper.pool.query(`
      UPDATE stripe_subscription_webhook_events
      SET reconciliation_next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE stripe_event_id = $1
    `, [event.id]);

    const resolved = await runSubscriptionWebhookReconciliationJobs(dbHelper.pool, {
      batchSize: 1, maxAttempts: 3,
    });
    expect(resolved).toMatchObject({ claimed: 1, retry: 0, resolved: 1 });
    const [organizations, claim] = await Promise.all([
      dbHelper.pool.query(`
        SELECT id, subscription_status
        FROM organizations WHERE id = ANY($1::integer[]) ORDER BY id
      `, [[first.org.id, second.org.id]]),
      dbHelper.pool.query(`
        SELECT reconciliation_status, reconciliation_attempt_count, reconciliation_last_error
        FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1
      `, [event.id]),
    ]);
    expect(organizations.rows.map(row => row.subscription_status)).toEqual(['active', 'trialing']);
    expect(claim.rows[0]).toMatchObject({
      reconciliation_status: 'resolved',
      reconciliation_attempt_count: 2,
      reconciliation_last_error: null,
    });
  });
});
