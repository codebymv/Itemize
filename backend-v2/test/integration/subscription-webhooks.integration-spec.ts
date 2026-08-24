import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import express, { Express } from 'express';
import { Pool } from 'pg';
import Stripe from 'stripe';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

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
  let legacyApp: Express;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const signedPost = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    event: unknown,
    { valid = true, omitSignature = false } = {},
  ) => {
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
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    const createBillingRoutes = require('../../../backend/src/routes/billing.routes');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

    legacyApp = express();
    legacyApp.use(
      '/api/billing',
      createBillingRoutes(
        pool,
        (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
      ),
    );
  }, 60000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it.each([
    ['nest', () => app.getHttpServer()],
    ['legacy', () => legacyApp],
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
    },
  );

  it('replays a legacy-claimed event as a duplicate through NestJS', async () => {
    const suffix = `cross${Date.now()}`;
    const customerId = `cus_cross_${suffix}`;
    await createBillingOrganization('cross', customerId);
    const event = subscriptionEvent({
      customerId,
      eventId: `evt_cross_${suffix}`,
      subscriptionId: `sub_cross_${suffix}`,
    });
    await signedPost(legacyApp, event).expect(200);
    const replay = await signedPost(app.getHttpServer(), event);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({
      received: true,
      duplicate: true,
      status: 'duplicate',
    });
  });

  it('rejects stale provider ordering identically after a newer event landed', async () => {
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
      legacyApp,
      subscriptionEvent({
        customerId,
        eventId: `evt_older_${suffix}`,
        subscriptionId,
        created: 1784110000,
        priceId: 'price_starter_monthly',
      }),
    );
    expect(stale.status).toBe(200);
    expect(stale.body).toMatchObject({ status: 'stale', duplicate: false });
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
      `SELECT plan, subscription_status, stripe_subscription_id, emails_limit
       FROM organizations WHERE id = $1`,
      [deletedOwner.org.id],
    );
    expect(deletedOrg.rows[0]).toMatchObject({
      plan: 'free',
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      emails_limit: 0,
    });

    const failedCustomer = `cus_fail_${suffix}`;
    const failedOwner = await createBillingOrganization('failed', failedCustomer);
    const failed = await signedPost(
      legacyApp,
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
            subscription: null,
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
    const [nest, legacy] = await Promise.all([
      signedPost(
        app.getHttpServer(),
        subscriptionEvent({
          customerId: sharedCustomer,
          eventId: `evt_shared_nest_${suffix}`,
          subscriptionId: `sub_shared_n_${suffix}`,
        }),
      ),
      signedPost(
        legacyApp,
        subscriptionEvent({
          customerId: sharedCustomer,
          eventId: `evt_shared_legacy_${suffix}`,
          subscriptionId: `sub_shared_l_${suffix}`,
        }),
      ),
    ]);
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      status: 'ambiguous',
    });
    expect(legacy.body).toEqual(nest.body);
  });

  it('ignores unsupported and checkout events identically', async () => {
    const suffix = `ign${Date.now()}`;
    const [nest, legacy] = await Promise.all([
      signedPost(app.getHttpServer(), {
        id: `evt_ign_nest_${suffix}`,
        object: 'event',
        type: 'customer.created',
        created: 1784120000,
        data: { object: { id: `cus_ign_${suffix}`, object: 'customer' } },
      }),
      signedPost(legacyApp, {
        id: `evt_ign_legacy_${suffix}`,
        object: 'event',
        type: 'checkout.session.completed',
        created: 1784120000,
        data: { object: { id: `cs_ign_${suffix}`, object: 'checkout.session' } },
      }),
    ]);
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      status: 'ignored',
    });
    expect(legacy.body).toEqual(nest.body);
  });

  it('fails signature and configuration checks identically', async () => {
    const event = subscriptionEvent({
      customerId: 'cus_sig',
      eventId: `evt_sig_${Date.now()}`,
      subscriptionId: 'sub_sig',
    });
    const [nestInvalid, legacyInvalid] = await Promise.all([
      signedPost(app.getHttpServer(), event, { valid: false }),
      signedPost(legacyApp, event, { valid: false }),
    ]);
    expect(nestInvalid.status).toBe(400);
    expect(legacyInvalid.status).toBe(400);
    expect(nestInvalid.body).toEqual(legacyInvalid.body);
    expect(nestInvalid.body).toEqual({ error: 'Invalid webhook' });

    const [nestMissing, legacyMissing] = await Promise.all([
      signedPost(app.getHttpServer(), event, { omitSignature: true }),
      signedPost(legacyApp, event, { omitSignature: true }),
    ]);
    expect(nestMissing.status).toBe(400);
    expect(legacyMissing.status).toBe(400);
    expect(nestMissing.text).toBe('Webhook Error: Missing signature');
    expect(legacyMissing.text).toBe('Webhook Error: Missing signature');

    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const [nestNoSecret, legacyNoSecret] = await Promise.all([
        signedPost(app.getHttpServer(), event),
        signedPost(legacyApp, event),
      ]);
      expect(nestNoSecret.status).toBe(503);
      expect(legacyNoSecret.status).toBe(503);
      expect(nestNoSecret.body).toEqual(legacyNoSecret.body);
      expect(nestNoSecret.body).toEqual({
        error: 'Webhook verification unavailable',
      });
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    }
  });
});
