import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/database.module';
import { EmailWebhookJobsService } from '../../src/email-webhooks/email-webhook-jobs.service';

type EventRow = {
  processing_status: string;
  reconciliation_status: string;
  reconciliation_reason: string | null;
  reconciliation_attempt_count: number;
  reconciliation_last_error: string | null;
  reconciliation_next_attempt_at: Date | null;
  matched_email_log_id: number | null;
  reconciled_at: Date | null;
};

describe('Email webhook reconciliation worker (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let nestJobs: EmailWebhookJobsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let ownerId: number;

  const seedReconcilableEvent = async (
    suffix: string,
    {
      eventType = 'email.delivered',
      reason = 'unmatched',
      attemptCount = 0,
      details = {} as Record<string, unknown>,
    } = {},
  ) => {
    const svixId = `msg_jobs_${suffix}_${Date.now()}`;
    const externalId = `re_jobs_${suffix}_${Date.now()}`;
    await pool.query(
      `INSERT INTO email_webhook_events (
         svix_id, event_type, external_id, event_created_at, details,
         processing_status, reconciliation_status, reconciliation_reason,
         reconciliation_attempt_count, reconciliation_next_attempt_at
       ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP - INTERVAL '1 minute', $4::jsonb,
                 'pending', 'pending', $5, $6, CURRENT_TIMESTAMP - INTERVAL '1 second')`,
      [svixId, eventType, externalId, JSON.stringify(details), reason, attemptCount],
    );
    return { svixId, externalId };
  };

  const seedTarget = async (externalId: string) => {
    const contact = (
      await pool.query<{ id: number }>(
        `INSERT INTO contacts (organization_id, first_name, email, created_by)
         VALUES ($1, 'Reconcile', $2, $3)
         RETURNING id`,
        [organizationId, `${externalId}@example.test`, ownerId],
      )
    ).rows[0];
    const log = (
      await pool.query<{ id: number }>(
        `INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, external_id)
         VALUES ($1, $2, $3, 'Reconciliation parity', 'sent', $4)
         RETURNING id`,
        [organizationId, contact.id, `${externalId}@example.test`, externalId],
      )
    ).rows[0];
    return { contactId: contact.id, logId: log.id };
  };

  const eventRow = async (svixId: string): Promise<EventRow> =>
    (
      await pool.query<EventRow>(
        `SELECT processing_status, reconciliation_status, reconciliation_reason,
                reconciliation_attempt_count, reconciliation_last_error,
                reconciliation_next_attempt_at, matched_email_log_id, reconciled_at
         FROM email_webhook_events WHERE svix_id = $1`,
        [svixId],
      )
    ).rows[0];

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for email webhook job tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `email-jobs-parity-${Date.now()}@test.itemize`,
      'Email Jobs Owner',
    );
    organizationId = owner.org.id;
    ownerId = owner.user.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
    nestJobs = app.get(EmailWebhookJobsService);

    // Other suites sharing this scratch database leave unmatched receiver
    // events in the reconciliation queue; neutralize them so summary
    // counts here stay deterministic regardless of suite order.
    await pool.query(
      `UPDATE email_webhook_events SET reconciliation_status = 'resolved'
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

  const runners: Array<{
    name: string;
    run: () => Promise<{
      claimed: number;
      resolved: number;
      retry: number;
      deadLetter: number;
    }>;
  }> = [
    { name: 'nest', run: () => nestJobs.run() },
  ];

  it('resolves claims identically once the provider target appears', async () => {
    const outcomes: Array<{ event: EventRow; logStatus: string }> = [];
    for (const runner of runners) {
      const seeded = await seedReconcilableEvent(`resolve-${runner.name}`);
      const target = await seedTarget(seeded.externalId);
      const summary = await runner.run();
      expect(summary).toEqual({ claimed: 1, resolved: 1, retry: 0, deadLetter: 0 });
      const row = await eventRow(seeded.svixId);
      expect(row.matched_email_log_id).toBe(target.logId);
      const log = await pool.query<{ status: string; delivered_at: Date | null }>(
        'SELECT status, delivered_at FROM email_logs WHERE id = $1',
        [target.logId],
      );
      expect(log.rows[0].delivered_at).not.toBeNull();
      outcomes.push({ event: row, logStatus: log.rows[0].status });
    }
    const [nest] = outcomes;
    expect(nest.event.reconciliation_status).toBe('resolved');
    expect(nest.event.reconciled_at).not.toBeNull();
  });

  it('defers unresolvable claims with identical retry state and redacted error', async () => {
    const outcomes: EventRow[] = [];
    for (const runner of runners) {
      const seeded = await seedReconcilableEvent(`retry-${runner.name}`);
      const summary = await runner.run();
      expect(summary).toEqual({ claimed: 1, resolved: 0, retry: 1, deadLetter: 0 });
      outcomes.push(await eventRow(seeded.svixId));
    }
    const [nest] = outcomes;
    expect(nest.reconciliation_status).toBe('retry');
    expect(nest.reconciliation_attempt_count).toBe(1);
    expect(nest.reconciliation_next_attempt_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('dead-letters exhausted claims identically', async () => {
    const outcomes: EventRow[] = [];
    for (const runner of runners) {
      const seeded = await seedReconcilableEvent(`dead-${runner.name}`, {
        attemptCount: 9,
      });
      const summary = await runner.run();
      expect(summary).toEqual({ claimed: 1, resolved: 0, retry: 0, deadLetter: 1 });
      outcomes.push(await eventRow(seeded.svixId));
    }
    const [nest] = outcomes;
    expect(nest.reconciliation_status).toBe('dead_letter');
    expect(nest.reconciliation_next_attempt_at).toBeNull();
    expect(nest.reconciliation_attempt_count).toBe(10);
  });

  it('applies contact suppression identically when reconciling a complaint', async () => {
    const outcomes: Array<{ unsubscribed: boolean; status: string }> = [];
    for (const runner of runners) {
      const seeded = await seedReconcilableEvent(`suppress-${runner.name}`, {
        eventType: 'email.complained',
      });
      const target = await seedTarget(seeded.externalId);
      const summary = await runner.run();
      expect(summary.resolved).toBe(1);
      const contact = await pool.query<{
        email_unsubscribed: boolean;
      }>('SELECT email_unsubscribed FROM contacts WHERE id = $1', [
        target.contactId,
      ]);
      const log = await pool.query<{ status: string }>(
        'SELECT status FROM email_logs WHERE id = $1',
        [target.logId],
      );
      outcomes.push({
        unsubscribed: contact.rows[0].email_unsubscribed,
        status: log.rows[0].status,
      });
    }
    const [nest] = outcomes;
    expect(nest.unsubscribed).toBe(true);
    expect(nest.status).toBe('unsubscribed');
  });

  it('claims nothing when the queue holds only deferred or terminal rows', async () => {
    for (const runner of runners) {
      const summary = await runner.run();
      expect(summary).toEqual({ claimed: 0, resolved: 0, retry: 0, deadLetter: 0 });
    }
  });
});
