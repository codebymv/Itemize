import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/database.module';
import {
  SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER,
  SubscriptionNotificationEmail,
} from '../../src/subscription-webhooks/subscription-notification-email.provider';
import { SubscriptionWebhookJobsService } from '../../src/subscription-webhooks/subscription-webhook-jobs.service';

type NotificationRow = {
  notification_status: string;
  notification_provider_id: string | null;
  notification_sent_at: Date | null;
  notification_attempt_count: number;
  notification_last_error: string | null;
  notification_next_attempt_at: Date | null;
};

type ReconciliationRow = {
  processing_status: string;
  reconciliation_status: string;
  reconciliation_attempt_count: number;
  reconciliation_last_error: string | null;
  reconciled_at: Date | null;
};

describe('Subscription webhook workers (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let nestJobs: SubscriptionWebhookJobsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  const nestSent: SubscriptionNotificationEmail[] = [];

  const nestProvider = {
    send: jest.fn(async (message: SubscriptionNotificationEmail) => {
      nestSent.push(message);
      return { success: true, id: 'prov_nest' };
    }),
  };

  const seedOrganization = async (label: string) => {
    const user = await dbHelper.seedUser(
      `${label}-${Date.now()}-${Math.random()}@test.itemize`,
      `Worker ${label}`,
    );
    await pool.query(
      `UPDATE organizations SET
         plan = 'starter', subscription_status = 'trialing', name = $2
       WHERE id = $1`,
      [user.org.id, `Worker ${label}`],
    );
    return user;
  };

  const seedNotificationEvent = async (
    suffix: string,
    {
      organizationId,
      notificationType = 'subscription_upgraded',
      attemptCount = 0,
      previousPlan = 'starter',
      newPlan = 'unlimited',
    }: {
      organizationId: number;
      notificationType?: string;
      attemptCount?: number;
      previousPlan?: string;
      newPlan?: string;
    },
  ) => {
    const eventId = `evt_jobs_${suffix}_${Date.now()}`;
    await pool.query(
      `INSERT INTO stripe_subscription_webhook_events (
         stripe_event_id, event_type, object_id, object_created_at, event_snapshot,
         processing_status, organization_id, previous_plan, new_plan,
         notification_type, notification_status, notification_attempt_count,
         notification_next_attempt_at, reconciliation_status
       ) VALUES ($1, 'customer.subscription.updated', $2, CURRENT_TIMESTAMP, '{}'::jsonb,
                 'processed', $3, $4, $5, $6, 'pending', $7,
                 CURRENT_TIMESTAMP - INTERVAL '1 second', 'not_required')`,
      [
        eventId,
        `sub_jobs_${suffix}`,
        organizationId,
        previousPlan,
        newPlan,
        notificationType,
        attemptCount,
      ],
    );
    return eventId;
  };

  const seedReconciliationEvent = async (
    suffix: string,
    { customerId, subscriptionId }: { customerId: string; subscriptionId: string },
  ) => {
    const eventId = `evt_rec_${suffix}_${Date.now()}`;
    const snapshot = {
      customerId,
      subscriptionId,
      status: 'active',
      currentPeriodStart: 1784119000,
      currentPeriodEnd: 1786711000,
      cancelAtPeriodEnd: false,
      priceId: 'price_unlimited_monthly',
      billingInterval: 'month',
      trialStart: null,
      trialEnd: null,
      pauseCollection: null,
    };
    await pool.query(
      `INSERT INTO stripe_subscription_webhook_events (
         stripe_event_id, event_type, object_id, object_created_at, event_snapshot,
         processing_status, notification_status, reconciliation_status,
         reconciliation_reason, reconciliation_next_attempt_at
       ) VALUES ($1, 'customer.subscription.updated', $2, CURRENT_TIMESTAMP, $3::jsonb,
                 'unmatched', 'not_required', 'pending', 'unmatched',
                 CURRENT_TIMESTAMP - INTERVAL '1 second')`,
      [eventId, subscriptionId, JSON.stringify(snapshot)],
    );
    return eventId;
  };

  const notificationRow = async (eventId: string): Promise<NotificationRow> =>
    (
      await pool.query<NotificationRow>(
        `SELECT notification_status, notification_provider_id, notification_sent_at,
                notification_attempt_count, notification_last_error, notification_next_attempt_at
         FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1`,
        [eventId],
      )
    ).rows[0];

  const reconciliationRow = async (
    eventId: string,
  ): Promise<ReconciliationRow> =>
    (
      await pool.query<ReconciliationRow>(
        `SELECT processing_status, reconciliation_status, reconciliation_attempt_count,
                reconciliation_last_error, reconciled_at
         FROM stripe_subscription_webhook_events WHERE stripe_event_id = $1`,
        [eventId],
      )
    ).rows[0];

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for subscription job tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER)
      .useValue(nestProvider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
    nestJobs = app.get(SubscriptionWebhookJobsService);

    // Other suites sharing this scratch database can leave claimable
    // notification/reconciliation rows; neutralize them so summary counts
    // here stay deterministic regardless of suite order.
    await pool.query(
      `UPDATE stripe_subscription_webhook_events
       SET notification_status = 'not_required'
       WHERE notification_status IN ('pending', 'retry')`,
    );
    await pool.query(
      `UPDATE stripe_subscription_webhook_events
       SET reconciliation_status = 'resolved'
       WHERE reconciliation_status IN ('pending', 'retry')`,
    );
  }, 60000);

  afterAll(async () => {
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

  it('sends the upgrade notification and marks it sent', async () => {
    const nestOwner = await seedOrganization('notify-nest');
    const nestEvent = await seedNotificationEvent('notify-nest', {
      organizationId: nestOwner.org.id,
    });
    const nestSummary = await nestJobs.runNotifications();
    expect(nestSummary).toEqual({ claimed: 1, sent: 1, retry: 0, deadLetter: 0 });

    const nestCaptured = nestSent[nestSent.length - 1];
    expect(nestCaptured.to).toBe(nestOwner.user.email);
    expect(nestCaptured.subject).toBe('Your Itemize plan was updated');
    expect(nestCaptured.text).toBe(
      'Worker notify-nest has been upgraded from Solo to Studio.',
    );
    expect(nestCaptured.html).toContain(
      'Worker notify-nest has been upgraded from <strong>Solo</strong> to <strong>Studio</strong>.',
    );
    expect(nestCaptured.tags).toEqual([
      { name: 'notification_type', value: 'subscription_upgraded' },
    ]);
    expect(nestCaptured.idempotencyKey).toBe(`subscription-upgrade-${nestEvent}`);

    const nestRow = await notificationRow(nestEvent);
    expect(nestRow.notification_status).toBe('sent');
    expect(nestRow.notification_provider_id).toBe('prov_nest');
    expect(nestRow.notification_sent_at).not.toBeNull();
  });

  it('sends the activation notification variant', async () => {
    const nestOwner = await seedOrganization('activate-nest');
    const nestEvent = await seedNotificationEvent('activate-nest', {
      organizationId: nestOwner.org.id,
      notificationType: 'subscription_activated',
    });
    await nestJobs.runNotifications();

    const nestCaptured = nestSent[nestSent.length - 1];
    expect(nestCaptured.subject).toBe('Your Itemize subscription is active');
    expect(nestCaptured.text).toBe('Worker activate-nest is now on Studio.');
    expect(nestCaptured.html).toContain(
      'Worker activate-nest is now on <strong>Studio</strong>.',
    );
    expect(nestCaptured.idempotencyKey).toBe(
      `subscription-activation-${nestEvent}`,
    );
  });

  it('defers notifications without an owner recipient identically', async () => {
    const outcomes: NotificationRow[] = [];
    for (const runner of ['nest']) {
      const owner = await seedOrganization(`ownerless-${runner}`);
      await pool.query(
        `DELETE FROM organization_members WHERE organization_id = $1 AND role = 'owner'`,
        [owner.org.id],
      );
      const eventId = await seedNotificationEvent(`ownerless-${runner}`, {
        organizationId: owner.org.id,
      });
      const summary = await nestJobs.runNotifications();
      expect(summary).toEqual({ claimed: 1, sent: 0, retry: 1, deadLetter: 0 });
      outcomes.push(await notificationRow(eventId));
    }
    const [nest] = outcomes;
    expect(nest.notification_status).toBe('retry');
    expect(nest.notification_last_error).toBe(
      'Subscription notification has no owner recipient',
    );
    expect(nest.notification_attempt_count).toBe(1);
    expect(nest.notification_next_attempt_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters exhausted notifications identically', async () => {
    const outcomes: NotificationRow[] = [];
    for (const runner of ['nest']) {
      const owner = await seedOrganization(`dead-${runner}`);
      await pool.query(
        `DELETE FROM organization_members WHERE organization_id = $1 AND role = 'owner'`,
        [owner.org.id],
      );
      const eventId = await seedNotificationEvent(`dead-${runner}`, {
        organizationId: owner.org.id,
        attemptCount: 4,
      });
      const summary = await nestJobs.runNotifications();
      expect(summary).toEqual({ claimed: 1, sent: 0, retry: 0, deadLetter: 1 });
      outcomes.push(await notificationRow(eventId));
    }
    const [nest] = outcomes;
    expect(nest.notification_status).toBe('dead_letter');
    expect(nest.notification_next_attempt_at).toBeNull();
    expect(nest.notification_attempt_count).toBe(5);
  });

  it('reconciles unmatched events identically once the organization appears', async () => {
    const outcomes: Array<{
      event: ReconciliationRow;
      org: { plan: string; subscription_status: string; emails_limit: number };
    }> = [];
    for (const runner of ['nest']) {
      const owner = await seedOrganization(`rec-${runner}`);
      const customerId = `cus_rec_${runner}_${Date.now()}`;
      const subscriptionId = `sub_rec_${runner}_${Date.now()}`;
      await pool.query(
        'UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, owner.org.id],
      );
      const eventId = await seedReconciliationEvent(`rec-${runner}`, {
        customerId,
        subscriptionId,
      });
      const summary = await nestJobs.runReconciliation();
      expect(summary).toEqual({ claimed: 1, resolved: 1, retry: 0, deadLetter: 0 });
      const org = await pool.query<{
        plan: string;
        subscription_status: string;
        emails_limit: number;
      }>(
        'SELECT plan, subscription_status, emails_limit FROM organizations WHERE id = $1',
        [owner.org.id],
      );
      outcomes.push({ event: await reconciliationRow(eventId), org: org.rows[0] });
    }
    const [nest] = outcomes;
    expect(nest.org.plan).toBe('unlimited');
    expect(nest.org.subscription_status).toBe('active');
    expect(nest.event.reconciliation_status).toBe('resolved');
    expect(nest.event.reconciled_at).not.toBeNull();
  });

  it('defers reconciliation identically while the mapping stays unresolved', async () => {
    const outcomes: ReconciliationRow[] = [];
    for (const runner of ['nest']) {
      const eventId = await seedReconciliationEvent(`unres-${runner}`, {
        customerId: `cus_unres_${runner}_${Date.now()}`,
        subscriptionId: `sub_unres_${runner}_${Date.now()}`,
      });
      const summary = await nestJobs.runReconciliation();
      expect(summary).toEqual({ claimed: 1, resolved: 0, retry: 1, deadLetter: 0 });
      outcomes.push(await reconciliationRow(eventId));
    }
    const [nest] = outcomes;
    expect(nest.reconciliation_status).toBe('retry');
    expect(nest.reconciliation_last_error).toBe(
      'Stripe subscription mapping is not uniquely resolvable',
    );
  });
});
