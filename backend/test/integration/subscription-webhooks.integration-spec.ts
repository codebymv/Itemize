import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import express, { Express } from 'express';
import { Pool } from 'pg';
import Stripe from 'stripe';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { StripeSubscriptionStateProvider } from '../../src/subscription-webhooks/stripe-subscription-state.provider';

const webhookSecret = 'whsec_subscription_parity';
const stripe = new Stripe('sk_test_subscription_parity');

const subscriptionEvent = ({
  created = 1784120000,
  customerId,
  eventId,
  priceId = 'price_unlimited_monthly',
  status = 'active',
  subscriptionId,
  type = 'customer.subscription.updated',
}: {
  created?: number;
  customerId: string | null;
  eventId: string;
  priceId?: string;
  status?: string;
  subscriptionId: string;
  type?: string;
}) => ({
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
});

describe('Stripe subscription webhook retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const currentSubscriptions = new Map<string, unknown>();
  const stateProvider = { retrieve: jest.fn(async (id: string) => {
    if (!currentSubscriptions.has(id)) throw new Error('Missing provider fixture');
    return currentSubscriptions.get(id);
  }) };


  const signedPost = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    event: unknown,
    { valid = true, omitSignature = false, publish = true } = {},
  ) => {
    const fixture = event as ReturnType<typeof subscriptionEvent>;
    if (publish && fixture.type.startsWith('customer.subscription.')) {
      currentSubscriptions.set(fixture.data.object.id, structuredClone(fixture.data.object));
    }
    const payload = JSON.stringify(event);
    let req = request(server)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json');
    if (!omitSignature) {
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: valid ? webhookSecret : 'whsec_wrong',
      });
      req = req.set('Stripe-Signature', signature);
    }
    return req.send(payload);
  };

  const createBillingOrganization = async (
    label: string,
    customerId: string,
    subscriptionId: string | null = null,
  ) => {
    const user = await dbHelper.seedUser(
      `${label}-${Date.now()}-${Math.random()}@test.itemize`,
      `Billing ${label}`,
    );
    await pool.query(
      `UPDATE organizations SET
         stripe_customer_id = $1,
         stripe_subscription_id = $2,
         plan = 'starter',
         subscription_status = 'trialing',
         emails_used = 8,
         sms_used = 7,
         api_calls_used = 6
       WHERE id = $3`,
      [customerId, subscriptionId, user.org.id],
    );
    return user;
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for subscription webhook tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(StripeSubscriptionStateProvider)
      .useValue(stateProvider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

  }, 60000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it.each([
    ['nest', () => app.getHttpServer()],
  ] as const)(
    'activates a subscription, applies plan limits, and deduplicates through the %s runtime',
    async (runtime, server) => {
      const suffix = `${runtime}${Date.now()}`;
      const customerId = `cus_act_${suffix}`;
      const subscriptionId = `sub_act_${suffix}`;
      const owner = await createBillingOrganization('activate', customerId);
      const event = subscriptionEvent({
        customerId,
        eventId: `evt_act_${suffix}`,
        subscriptionId,
      });

      const first = await signedPost(server(), event);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({
        received: true,
        duplicate: false,
        status: 'processed',
        organizationId: owner.org.id,
        previousPlan: 'starter',
        newPlan: 'unlimited',
        notificationType: 'subscription_upgraded',
      });
      const duplicate = await signedPost(server(), event);
      expect(duplicate.status).toBe(200);
      expect(duplicate.body).toEqual({
        received: true,
        duplicate: true,
        status: 'duplicate',
      });

      const org = await pool.query(
        `SELECT plan, subscription_status, stripe_subscription_id, emails_limit,
                sms_limit, emails_used, sms_used, api_calls_used,
                subscription_provider_event_id
         FROM organizations WHERE id = $1`,
        [owner.org.id],
      );
      expect(org.rows[0]).toMatchObject({
        plan: 'unlimited',
        subscription_status: 'active',
        stripe_subscription_id: subscriptionId,
        emails_limit: 10000,
        sms_limit: 5000,
        emails_used: 0,
        sms_used: 0,
        api_calls_used: 0,
        subscription_provider_event_id: `evt_act_${suffix}`,
      });
      const subscription = await pool.query(
        `SELECT status, billing_period, stripe_subscription_id
         FROM subscriptions WHERE organization_id = $1`,
        [owner.org.id],
      );
      expect(subscription.rows[0]).toMatchObject({
        status: 'active',
        billing_period: 'monthly',
        stripe_subscription_id: subscriptionId,
      });
      const audit = await pool.query(
        `SELECT event_type, metadata FROM subscription_events
         WHERE organization_id = $1 AND stripe_event_id = $2`,
        [owner.org.id, `evt_act_${suffix}`],
      );
      expect(audit.rows[0].metadata).toMatchObject({
        previousPlan: 'starter',
        newPlan: 'unlimited',
      });
      const claim = await pool.query(
        `SELECT processing_status, notification_type, notification_status
         FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1`,
        [`evt_act_${suffix}`],
      );
      expect(claim.rows[0]).toMatchObject({
        processing_status: 'processed',
        notification_type: 'subscription_upgraded',
        notification_status: 'pending',
      });
      const notification = await pool.query(
        `SELECT event.event_type, event.entity_type, event.entity_id,
                notification.category, notification.title
         FROM notification_events event
         JOIN user_notifications notification ON notification.event_id = event.id
         WHERE event.organization_id = $1
           AND event.dedupe_key = $2`,
        [owner.org.id, `stripe:evt_act_${suffix}:plan-changed`],
      );
      expect(notification.rows[0]).toMatchObject({
        event_type: 'subscription.plan_changed',
        entity_type: null,
        entity_id: null,
        category: 'billing',
        title: 'Plan changed to Studio',
      });
    },
  );

  it('applies configured annual prices through upgrade, downgrade and payment recovery', async () => {
    const previous = process.env.STRIPE_PRICE_UNLIMITED_YEARLY;
    process.env.STRIPE_PRICE_UNLIMITED_YEARLY = 'price_1AnnualStudioIntegration';
    const customerId = `cus_annual_${Date.now()}`;
    const owner = await createBillingOrganization('annual', customerId);
    try {
      const event = subscriptionEvent({ customerId, eventId: `evt_annual_${Date.now()}`, subscriptionId: 'sub_annual', priceId: process.env.STRIPE_PRICE_UNLIMITED_YEARLY });
      event.data.object.items.data[0].price.recurring.interval = 'year';
      event.data.object.cancel_at_period_end = true;
      await signedPost(app.getHttpServer(), event).expect(200);
      const upgraded = (await pool.query('SELECT plan,subscription_status,billing_period,contacts_limit,users_limit,cancel_at_period_end FROM organizations WHERE id=$1', [owner.org.id])).rows[0];
      expect(upgraded).toMatchObject({ plan: 'unlimited', subscription_status: 'active', billing_period: 'yearly', contacts_limit: 25000, users_limit: 10, cancel_at_period_end: true });
      for (const [index,status] of ['past_due', 'active'].entries()) {
        await signedPost(app.getHttpServer(), subscriptionEvent({ customerId, eventId: `evt_recovery_${index}_${Date.now()}`, subscriptionId: 'sub_annual', priceId: 'price_starter_monthly', status, created: 1784120001+index })).expect(200);
      }
      expect((await pool.query('SELECT plan,subscription_status,contacts_limit,users_limit FROM organizations WHERE id=$1', [owner.org.id])).rows[0]).toMatchObject({ plan: 'starter', subscription_status: 'active', contacts_limit: 5000, users_limit: 3 });
    } finally {
      if (previous === undefined) delete process.env.STRIPE_PRICE_UNLIMITED_YEARLY;
      else process.env.STRIPE_PRICE_UNLIMITED_YEARLY = previous;
    }
  });

  it('replays a legacy-claimed event as a duplicate through NestJS', async () => {
    const suffix = `cross${Date.now()}`;
    const customerId = `cus_cross_${suffix}`;
    await createBillingOrganization('cross', customerId);
    const event = subscriptionEvent({
      customerId,
      eventId: `evt_cross_${suffix}`,
      subscriptionId: `sub_cross_${suffix}`,
    });
    await signedPost(app.getHttpServer(), event).expect(200);
    const replay = await signedPost(app.getHttpServer(), event);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({
      received: true,
      duplicate: true,
      status: 'duplicate',
    });
  });

  it('refreshes canonical state when a delayed older event arrives', async () => {
    const suffix = `stale${Date.now()}`;
    const customerId = `cus_stale_${suffix}`;
    const subscriptionId = `sub_stale_${suffix}`;
    await createBillingOrganization('stale', customerId);
    await signedPost(
      app.getHttpServer(),
      subscriptionEvent({
        customerId,
        eventId: `evt_newer_${suffix}`,
        subscriptionId,
        created: 1784120000,
      }),
    ).expect(200);
    const stale = await signedPost(
      app.getHttpServer(),
      subscriptionEvent({
        customerId,
        eventId: `evt_older_${suffix}`,
        subscriptionId,
        created: 1784110000,
        priceId: 'price_starter_monthly',
      }),
      { publish: false },
    );
    expect(stale.status).toBe(200);
    expect(stale.body).toMatchObject({ status: 'processed', duplicate: false });
    const org = await pool.query(
      'SELECT plan FROM organizations WHERE stripe_customer_id = $1',
      [customerId],
    );
    expect(org.rows[0].plan).toBe('unlimited');
  });

  it('applies terminal deletion and payment failure identically', async () => {
    const suffix = `term${Date.now()}`;
    const deletedCustomer = `cus_del_${suffix}`;
    const deletedSub = `sub_del_${suffix}`;
    const deletedOwner = await createBillingOrganization(
      'deleted',
      deletedCustomer,
      deletedSub,
    );
    const deleted = await signedPost(
      app.getHttpServer(),
      subscriptionEvent({
        customerId: deletedCustomer,
        eventId: `evt_del_${suffix}`,
        subscriptionId: deletedSub,
        type: 'customer.subscription.deleted',
        status: 'canceled',
      }),
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({
      status: 'processed',
      previousPlan: 'starter',
      newPlan: 'free',
    });
    const deletedOrg = await pool.query(
      `SELECT plan, subscription_status, stripe_subscription_id, emails_limit, users_limit
       FROM organizations WHERE id = $1`,
      [deletedOwner.org.id],
    );
    expect(deletedOrg.rows[0]).toMatchObject({
      plan: 'free',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      emails_limit: 0,
      users_limit: 1,
    });

    const failedCustomer = `cus_fail_${suffix}`;
    const failedOwner = await createBillingOrganization('failed', failedCustomer);
    currentSubscriptions.set(`sub_fail_${suffix}`, subscriptionEvent({
      customerId: failedCustomer, subscriptionId: `sub_fail_${suffix}`,
      eventId: 'fixture', status: 'past_due', priceId: 'price_starter_monthly',
    }).data.object);
    const failed = await signedPost(
      app.getHttpServer(),
      {
        id: `evt_fail_${suffix}`,
        object: 'event',
        type: 'invoice.payment_failed',
        created: 1784120000,
        data: {
          object: {
            id: `in_fail_${suffix}`,
            object: 'invoice',
            customer: failedCustomer,
            parent: { subscription_details: { subscription: `sub_fail_${suffix}` } },
          },
        },
      },
    );
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ status: 'processed' });
    const failedOrg = await pool.query(
      'SELECT plan, subscription_status FROM organizations WHERE id = $1',
      [failedOwner.org.id],
    );
    expect(failedOrg.rows[0]).toMatchObject({
      plan: 'starter',
      subscription_status: 'past_due',
    });
  });

  it('does not revoke current access for a one-off invoice or an older subscription', async () => {
    const suffix = `${Date.now()}`;
    const customerId = `cus_isolation_${suffix}`;
    const owner = await createBillingOrganization('isolation', customerId, `sub_current_${suffix}`);
    await pool.query("UPDATE organizations SET subscription_status='active' WHERE id=$1", [owner.org.id]);
    const invoice = { id: `evt_oneoff_${suffix}`, type: 'invoice.payment_failed', created: 1784120500,
      data: { object: { id: `in_oneoff_${suffix}`, object: 'invoice', customer: customerId, subscription: null } } };
    expect((await signedPost(app.getHttpServer(), invoice).expect(200)).body.status).toBe('ignored');
    const old = subscriptionEvent({ customerId, eventId: `evt_old_delete_${suffix}`, subscriptionId: `sub_old_${suffix}`, type: 'customer.subscription.deleted', status: 'canceled', created: 1784120501 });
    expect((await signedPost(app.getHttpServer(), old).expect(200)).body.status).toBe('unmatched');
    expect((await pool.query('SELECT plan,subscription_status,stripe_subscription_id FROM organizations WHERE id=$1', [owner.org.id])).rows[0]).toMatchObject({ plan: 'starter', subscription_status: 'active', stripe_subscription_id: `sub_current_${suffix}` });
  });

  it.each(['forward', 'reverse'])('uses current state for conflicting same-second events in %s order', async (order) => {
    const suffix = `tie_${order}_${Date.now()}`;
    const customerId = `cus_${suffix}`;
    const subscriptionId = `sub_${suffix}`;
    const owner = await createBillingOrganization(suffix, customerId);
    const recovered = subscriptionEvent({customerId, subscriptionId, eventId: `evt_a_${suffix}`, priceId: 'price_unlimited_yearly'});
    recovered.data.object.items.data[0].price.recurring.interval = 'year';
    currentSubscriptions.set(subscriptionId, recovered.data.object);
    const failed = { id: `evt_z_${suffix}`, type: 'invoice.payment_failed', created: recovered.created,
      data: { object: { id: `in_${suffix}`, customer: customerId, subscription: subscriptionId } } };
    const events = order === 'forward' ? [failed, recovered] : [recovered, failed];
    for (const event of events) await signedPost(app.getHttpServer(), event, {publish:false}).expect(200);
    expect((await pool.query('SELECT plan,subscription_status,billing_period FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'unlimited',subscription_status:'active',billing_period:'yearly'});
    // Both distinct events are durably claimed, but only one upgrade is queued.
    expect((await pool.query("SELECT count(*)::int AS count FROM stripe_subscription_webhook_events WHERE organization_id=$1 AND notification_type='subscription_upgraded'",[owner.org.id])).rows[0].count).toBe(1);
    const before = stateProvider.retrieve.mock.calls.length;
    expect((await signedPost(app.getHttpServer(), failed, {publish:false}).expect(200)).body.status).toBe('duplicate');
    expect(stateProvider.retrieve.mock.calls.length).toBe(before);
  });

  it.each(['forward', 'reverse'])('does not revive canceled subscriptions in %s arrival order', async order => {
    const suffix = `cancel_${order}_${Date.now()}`;
    const customerId = `cus_${suffix}`, subscriptionId = `sub_${suffix}`;
    const owner = await createBillingOrganization(suffix, customerId);
    const activation = subscriptionEvent({customerId,subscriptionId,eventId:`evt_z_${suffix}`});
    const cancellation = subscriptionEvent({customerId,subscriptionId,eventId:`evt_a_${suffix}`,status:'canceled',type:'customer.subscription.deleted'});
    currentSubscriptions.set(subscriptionId,{...cancellation.data.object,canceled_at:1784120100});
    for (const event of order === 'forward' ? [activation,cancellation] : [cancellation,activation]) {
      await signedPost(app.getHttpServer(),event,{publish:false}).expect(200);
    }
    expect((await pool.query('SELECT plan,subscription_status,emails_limit,users_limit FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'free',subscription_status:'canceled',emails_limit:0,users_limit:1});
    expect((await pool.query('SELECT canceled_at FROM organizations WHERE id=$1',[owner.org.id])).rows[0].canceled_at).toEqual(new Date(1784120100000));
  });

  it('rolls back failed provider reads and retries the same event against fresh state', async () => {
    const suffix = `retry_${Date.now()}`;
    const customerId = `cus_${suffix}`, subscriptionId = `sub_${suffix}`;
    const owner = await createBillingOrganization(suffix,customerId);
    const event = subscriptionEvent({customerId,subscriptionId,eventId:`evt_${suffix}`});
    stateProvider.retrieve.mockRejectedValueOnce(new Error('Provider unavailable'));
    await signedPost(app.getHttpServer(),event).expect(500);
    expect((await pool.query('SELECT count(*)::int AS count FROM stripe_subscription_webhook_events WHERE stripe_event_id=$1',[event.id])).rows[0].count).toBe(0);
    expect((await pool.query('SELECT plan,subscription_status FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'starter',subscription_status:'trialing'});
    currentSubscriptions.set(subscriptionId,{...event.data.object,status:'canceled'});
    await signedPost(app.getHttpServer(),event,{publish:false}).expect(200);
    expect((await pool.query('SELECT plan,subscription_status FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'free',subscription_status:'canceled'});
  });

  it('serializes canonical reads with tenant writes across concurrent deliveries', async () => {
    const suffix = `concurrent_${Date.now()}`;
    const customerId = `cus_${suffix}`, subscriptionId = `sub_${suffix}`;
    const owner = await createBillingOrganization(suffix,customerId);
    const first = subscriptionEvent({customerId,subscriptionId,eventId:`evt_z_${suffix}`});
    const second = subscriptionEvent({customerId,subscriptionId,eventId:`evt_a_${suffix}`});
    let releaseRead!: () => void;
    let enteredRead!: () => void;
    const entered = new Promise<void>(resolve => { enteredRead = resolve; });
    const release = new Promise<void>(resolve => { releaseRead = resolve; });
    stateProvider.retrieve.mockImplementationOnce(async () => {
      enteredRead();
      await release;
      return first.data.object;
    });
    currentSubscriptions.set(subscriptionId,{...first.data.object,status:'canceled'});
    const before = stateProvider.retrieve.mock.calls.length;
    const firstRequest = signedPost(app.getHttpServer(),first,{publish:false}).then(response => response);
    await entered;
    const secondRequest = signedPost(app.getHttpServer(),second,{publish:false}).then(response => response);
    try {
      let blocked = false;
      for (let attempt=0;attempt<100;attempt++) {
        const result = await pool.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%subscription_provider_event_id%') AS blocked");
        if (result.rows[0].blocked) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve,20));
      }
      expect(blocked).toBe(true);
      expect(stateProvider.retrieve.mock.calls.length).toBe(before+1);
    } finally {
      releaseRead();
      const responses = await Promise.all([firstRequest,secondRequest]);
      expect(responses.map(response => response.status)).toEqual([200,200]);
    }
    expect((await pool.query('SELECT plan,subscription_status FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'free',subscription_status:'canceled'});
  });

  it('rejects a canonical response with a different customer identity', async () => {
    const suffix = `identity_${Date.now()}`;
    const customerId = `cus_${suffix}`, subscriptionId = `sub_${suffix}`;
    const owner = await createBillingOrganization(suffix,customerId);
    const event = subscriptionEvent({customerId,subscriptionId,eventId:`evt_${suffix}`});
    currentSubscriptions.set(subscriptionId,{...event.data.object,customer:'cus_someone_else'});
    await signedPost(app.getHttpServer(),event,{publish:false}).expect(500);
    expect((await pool.query('SELECT plan,subscription_status FROM organizations WHERE id=$1',[owner.org.id])).rows[0])
      .toMatchObject({plan:'starter',subscription_status:'trialing'});
  });

  it('quarantines unmatched and ambiguous tenant mappings identically', async () => {
    const suffix = `map${Date.now()}`;
    const unmatched = await signedPost(
      app.getHttpServer(),
      subscriptionEvent({
        customerId: `cus_ghost_${suffix}`,
        eventId: `evt_ghost_${suffix}`,
        subscriptionId: `sub_ghost_${suffix}`,
      }),
    );
    expect(unmatched.status).toBe(200);
    expect(unmatched.body).toEqual({
      received: true,
      duplicate: false,
      status: 'unmatched',
    });
    const unmatchedClaim = await pool.query(
      `SELECT processing_status, reconciliation_status, reconciliation_reason
       FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1`,
      [`evt_ghost_${suffix}`],
    );
    expect(unmatchedClaim.rows[0]).toMatchObject({
      processing_status: 'unmatched',
      reconciliation_status: 'pending',
      reconciliation_reason: 'unmatched',
    });

    const sharedCustomer = `cus_shared_${suffix}`;
    await createBillingOrganization('shared-a', sharedCustomer);
    await createBillingOrganization('shared-b', sharedCustomer);
    const nest = await signedPost(
        app.getHttpServer(),
        subscriptionEvent({
          customerId: sharedCustomer,
          eventId: `evt_shared_nest_${suffix}`,
          subscriptionId: `sub_shared_n_${suffix}`,
        }),
      );
    expect(nest.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      status: 'ambiguous',
    });
  });

  it('ignores unsupported and checkout events identically', async () => {
    const suffix = `ign${Date.now()}`;
    const nest = await signedPost(app.getHttpServer(), {
        id: `evt_ign_nest_${suffix}`,
        object: 'event',
        type: 'customer.created',
        created: 1784120000,
        data: { object: { id: `cus_ign_${suffix}`, object: 'customer' } },
      });
    expect(nest.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      status: 'ignored',
    });
  });

  it('fails signature and configuration checks identically', async () => {
    const event = subscriptionEvent({
      customerId: 'cus_sig',
      eventId: `evt_sig_${Date.now()}`,
      subscriptionId: 'sub_sig',
    });
    const nestInvalid = await signedPost(app.getHttpServer(), event, { valid: false });
    expect(nestInvalid.status).toBe(400);
    expect(nestInvalid.body).toEqual({ error: 'Invalid webhook' });

    const nestMissing = await signedPost(app.getHttpServer(), event, { omitSignature: true });
    expect(nestMissing.status).toBe(400);
    expect(nestMissing.text).toBe('Webhook Error: Missing signature');

    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const nestNoSecret = await signedPost(app.getHttpServer(), event);
      expect(nestNoSecret.status).toBe(503);
      expect(nestNoSecret.body).toEqual({
        error: 'Webhook verification unavailable',
      });
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    }
  });
});
