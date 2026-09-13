import { EmailWebhookJobsService } from '../../src/email-webhooks/email-webhook-jobs.service';
import { InvoicesRepository } from '../../src/invoices/invoices.repository';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { Webhook } from 'svix';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { CampaignsRepository } from '../../src/campaigns/campaigns.repository';

const signingSecret = `whsec_${Buffer.from(
  'itemize-email-webhook-parity-secret',
).toString('base64')}`;

type EmailEventExtra = Record<string, unknown>;

const emailEvent = (
  type: string,
  emailId: string,
  createdAt: string,
  extra: EmailEventExtra = {},
) => ({
  type,
  created_at: createdAt,
  data: {
    email_id: emailId,
    created_at: createdAt,
    from: 'Itemize <noreply@itemize.test>',
    to: ['recipient@example.test'],
    subject: 'Provider event parity',
    ...extra,
  },
});

describe('Resend webhook receiver (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let ownerId: number;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  const signedRequest = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    deliveryId: string,
    event: unknown,
    { valid = true } = {},
  ) => {
    const payload = JSON.stringify(event);
    const timestamp = new Date();
    const signature = new Webhook(signingSecret).sign(
      deliveryId,
      timestamp,
      payload,
    );
    return request(server)
      .post('/api/email/webhook/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', deliveryId)
      .set('svix-timestamp', String(Math.floor(timestamp.getTime() / 1000)))
      .set('svix-signature', valid ? signature : 'v1,invalid')
      .send(payload);
  };

  const seedContactAndLog = async (externalId: string) => {
    const contact = (
      await pool.query<{ id: number }>(
        `INSERT INTO contacts (organization_id, first_name, email, created_by)
         VALUES ($1, 'Webhook', $2, $3)
         RETURNING id`,
        [organizationId, `${externalId}@example.test`, ownerId],
      )
    ).rows[0];
    const log = (
      await pool.query<{ id: number }>(
        `INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, external_id)
         VALUES ($1, $2, $3, 'Provider event parity', 'sent', $4)
         RETURNING id`,
        [organizationId, contact.id, `${externalId}@example.test`, externalId],
      )
    ).rows[0];
    return { contact, log };
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for email webhook tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.RESEND_WEBHOOK_SECRET = signingSecret;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `email-webhook-parity-${Date.now()}@test.itemize`,
      'Email Webhook Owner',
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
    configureApp(app);
    await app.init();

  }, 60000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
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

  it('reads campaign totals from unique recipient event history despite stale counters and repeated events', async () => {
    const externalId = `campaign-metrics-${Date.now()}`;
    const { contact } = await seedContactAndLog(externalId);
    const campaign = (await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id, name, subject, status, total_recipients, total_sent)
       VALUES ($1, 'Webhook metrics QA', 'QA', 'sent', 1, 1) RETURNING id`,
      [organizationId],
    )).rows[0];
    await pool.query(
      `INSERT INTO campaign_recipients
       (campaign_id, organization_id, contact_id, email, status, external_message_id)
       VALUES ($1, $2, $3, 'recipient@example.test', 'sent', $4)`,
      [campaign.id, organizationId, contact.id, externalId],
    );
    for (const [index, type] of ['email.delivered', 'email.delivered', 'email.opened', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained'].entries()) {
      const event = emailEvent(type, externalId, `2026-08-20T12:00:0${index}.000Z`,
        type === 'email.bounced' ? { bounce: { type: 'Permanent' } } : {});
      const response = await signedRequest(app.getHttpServer(), `${externalId}-${index}`, event);
      expect(response.status).toBe(200);
      expect(response.body.matched).toBe(true);
    }
    const repository = new CampaignsRepository(pool);
    const expected = {
      total_delivered: 1, total_opened: 1, total_clicked: 1, total_bounced: 1,
      total_unsubscribed: 1, total_complained: 1,
    };
    const detail = await repository.findById(organizationId, campaign.id);
    expect(detail?.row).toMatchObject(expected);
    expect(Number(detail?.row.open_rate)).toBe(100);
    expect(Number(detail?.row.click_rate)).toBe(100);
    expect(Number(detail?.row.bounce_rate)).toBe(100);
    const page = await repository.findPage({ organizationId, pageSize: 100, offset: 0 });
    expect(page.rows.find(row => row.id === campaign.id)).toMatchObject(expected);
    expect(await repository.findById(-1, campaign.id)).toBeNull();
    const stored = await pool.query('SELECT total_delivered FROM email_campaigns WHERE id=$1', [campaign.id]);
    expect(stored.rows[0].total_delivered).toBe(0);
  });

  it.each([
    ['nest', () => app.getHttpServer()],
  ] as const)(
    'verifies, applies, and deduplicates a delivered event through the %s runtime',
    async (runtime, server) => {
      const externalId = `delivered-${runtime}-${Date.now()}`;
      const { log } = await seedContactAndLog(externalId);
      const event = emailEvent(
        'email.delivered',
        externalId,
        '2026-08-20T12:00:00.000Z',
      );
      const deliveryId = `svix-delivered-${runtime}-${Date.now()}`;

      const first = await signedRequest(server(), deliveryId, event);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({
        received: true,
        duplicate: false,
        matched: true,
        pending: false,
      });
      const duplicate = await signedRequest(server(), deliveryId, event);
      expect(duplicate.status).toBe(200);
      expect(duplicate.body).toEqual({
        received: true,
        duplicate: true,
        matched: false,
      });

      const stored = await pool.query(
        'SELECT status, delivered_at FROM email_logs WHERE id = $1',
        [log.id],
      );
      expect(stored.rows[0].status).toBe('delivered');
      expect(stored.rows[0].delivered_at).not.toBeNull();
      const claim = await pool.query(
        'SELECT processing_status, matched_email_log_id FROM email_webhook_events WHERE svix_id = $1',
        [deliveryId],
      );
      expect(claim.rows[0]).toMatchObject({
        processing_status: 'processed',
        matched_email_log_id: log.id,
      });
    },
  );

  it('replays a claimed delivery id as a duplicate', async () => {
    const externalId = `crossdup-${Date.now()}`;
    await seedContactAndLog(externalId);
    const event = emailEvent(
      'email.delivered',
      externalId,
      '2026-08-20T12:00:00.000Z',
    );
    const deliveryId = `svix-crossdup-${Date.now()}`;
    await signedRequest(app.getHttpServer(), deliveryId, event).expect(200);
    const replay = await signedRequest(app.getHttpServer(), deliveryId, event);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({
      received: true,
      duplicate: true,
      matched: false,
    });
  });

  it('never regresses a newer status and applies permanent-bounce suppression', async () => {
    const externalId = `bounce-${Date.now()}`;
    const { contact, log } = await seedContactAndLog(externalId);

    const bounce = emailEvent(
      'email.bounced',
      externalId,
      '2026-08-21T10:00:00.000Z',
      { bounce: { type: 'Permanent', subType: 'General', message: 'Hard bounce' } },
    );
    await signedRequest(
      app.getHttpServer(),
      `svix-bounce-${Date.now()}`,
      bounce,
    ).expect(200);

    const stale = emailEvent(
      'email.delivered',
      externalId,
      '2026-08-20T09:00:00.000Z',
    );
    await signedRequest(
      app.getHttpServer(),
      `svix-stale-${Date.now()}`,
      stale,
    ).expect(200);

    const [storedLog, storedContact] = await Promise.all([
      pool.query('SELECT status, bounced_at FROM email_logs WHERE id = $1', [
        log.id,
      ]),
      pool.query(
        'SELECT email_bounced, email_bounce_type FROM contacts WHERE id = $1',
        [contact.id],
      ),
    ]);
    expect(storedLog.rows[0].status).toBe('bounced');
    expect(storedLog.rows[0].bounced_at).not.toBeNull();
    expect(storedContact.rows[0]).toMatchObject({
      email_bounced: true,
      email_bounce_type: 'Permanent',
    });
  });

  it('quarantines unmatched and cross-tenant ambiguous events', async () => {
    const unmatchedId = `svix-unmatched-${Date.now()}`;
    const unmatched = await signedRequest(
      app.getHttpServer(),
      unmatchedId,
      emailEvent('email.delivered', `ghost-${Date.now()}`, '2026-08-20T12:00:00.000Z'),
    );
    expect(unmatched.status).toBe(200);
    expect(unmatched.body).toEqual({
      received: true,
      duplicate: false,
      matched: false,
      pending: true,
      reason: 'unmatched',
    });

    const other = await dbHelper.seedUser(
      `email-webhook-other-${Date.now()}@test.itemize`,
      'Other Org Owner',
    );
    const sharedExternal = `ambiguous-${Date.now()}`;
    await seedContactAndLog(sharedExternal);
    await pool.query(
      `INSERT INTO email_logs (organization_id, to_email, subject, status, external_id)
       VALUES ($1, 'other@example.test', 'Cross tenant', 'sent', $2)`,
      [other.org.id, sharedExternal],
    );
    const nest = await signedRequest(
      app.getHttpServer(),
      `svix-ambiguous-nest-${Date.now()}`,
      emailEvent('email.delivered', sharedExternal, '2026-08-20T12:00:00.000Z'),
    );
    expect(nest.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      matched: false,
      pending: true,
      reason: 'ambiguous',
    });
  });

  it('ignores non-actionable event types', async () => {
    const externalId = `delayed-${Date.now()}`;
    await seedContactAndLog(externalId);
    const nest = await signedRequest(
      app.getHttpServer(),
      `svix-delayed-nest-${Date.now()}`,
      { ...emailEvent('email.unknown_type', externalId, '2026-08-20T12:00:00.000Z') },
    );
    expect(nest.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      ignored: true,
      matched: false,
    });
  });

  it('rejects tampered signatures and malformed events', async () => {
    const externalId = `invalid-${Date.now()}`;
    await seedContactAndLog(externalId);

    const nestBad = await signedRequest(
      app.getHttpServer(),
      `svix-badsig-nest-${Date.now()}`,
      emailEvent('email.delivered', externalId, '2026-08-20T12:00:00.000Z'),
      { valid: false },
    );
    expect(nestBad.status).toBe(400);
    expect(nestBad.body).toEqual({ error: 'Invalid webhook' });

    const missingId = { type: 'email.delivered', created_at: '2026-08-20T12:00:00.000Z', data: {} };
    const nestInvalid = await signedRequest(
      app.getHttpServer(),
      `svix-noid-nest-${Date.now()}`,
      missingId,
    );
    expect(nestInvalid.status).toBe(400);
    expect(nestInvalid.body).toEqual({ error: 'Invalid webhook event' });
  });

  it('fails closed when the signing secret is absent', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      const nest = await request(app.getHttpServer())
        .post('/api/email/webhook/resend')
        .set('svix-id', 'msg_nosecret')
        .send({ type: 'email.delivered' });
      expect(nest.status).toBe(503);
      expect(nest.body).toEqual({ error: 'Webhook verification unavailable' });
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = signingSecret;
    }
  });
  it.each(['invoice', 'signature'])('matches %s receipts, deduplicates events and preserves newer outcomes', async (source) => {
    const externalId = `receipt-${source}-${Date.now()}`;
    const id = source === 'invoice' ? 900001 : 900002;
    await pool.query(`INSERT INTO delivery_provider_receipts
      (organization_id,source,delivery_id,idempotency_key,provider_id,request_body,review_required,first_attempt_at)
      VALUES ($1,$2,$3,$4,$4,'encrypted-snapshot',true,'2026-08-01')`, [organizationId,source,id,externalId]);
    const svix = `receipt-event-${source}-${Date.now()}`;
    const event = emailEvent('email.delivered',externalId,'2026-08-20T12:00:00Z');
    const delivered = await signedRequest(app.getHttpServer(),svix,event).expect(200);
    expect(delivered.body.matched).toBe(true);
    expect((await signedRequest(app.getHttpServer(),svix,event).expect(200)).body.duplicate).toBe(true);
    await Promise.all([
      signedRequest(app.getHttpServer(),`${svix}-bounce`,emailEvent('email.bounced',externalId,'2026-08-20T13:00:00Z')).expect(200),
      signedRequest(app.getHttpServer(),`${svix}-old`,emailEvent('email.sent',externalId,'2026-08-20T11:00:00Z')).expect(200),
    ]);
    // A same-time lower-rank event cannot overwrite the bounce either.
    await signedRequest(app.getHttpServer(),`${svix}-tie`,emailEvent('email.delivered',externalId,'2026-08-20T13:00:00Z')).expect(200);
    const receipt = (await pool.query('SELECT * FROM delivery_provider_receipts WHERE provider_id=$1',[externalId])).rows[0];
    expect(receipt).toMatchObject({provider_status:'bounced',last_provider_event:'email.bounced',request_body:'encrypted-snapshot',review_required:true});
    expect(receipt.first_attempt_at.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(receipt.delivered_at.toISOString()).toBe('2026-08-20T12:00:00.000Z');
    expect((await pool.query('SELECT processing_status,matched_delivery_source,matched_delivery_id FROM email_webhook_events WHERE svix_id=$1',[svix])).rows[0])
      .toEqual({processing_status:'processed',matched_delivery_source:source,matched_delivery_id:String(id)});
  });

  it('quarantines a receipt whose provider ID also belongs to another tenant', async () => {
    const other = await dbHelper.seedUser(`receipt-other-${Date.now()}@test.itemize`,'Other receipt owner');
    const externalId = `receipt-ambiguous-${Date.now()}`;
    await seedContactAndLog(externalId);
    await pool.query(`INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,provider_id)
      VALUES ($1,'signature',900003,$2,$2)`,[other.org.id,externalId]);
    const response = await signedRequest(app.getHttpServer(),`svix-${externalId}`,emailEvent('email.delivered',externalId,'2026-08-20T12:00:00Z')).expect(200);
    expect(response.body.reason).toBe('ambiguous');
    expect((await pool.query('SELECT provider_status FROM delivery_provider_receipts WHERE provider_id=$1',[externalId])).rows[0].provider_status).toBeNull();
    expect((await pool.query('SELECT status FROM email_logs WHERE external_id=$1',[externalId])).rows[0].status).toBe('sent');
  });

  it('replays an event that arrived before its provider receipt was persisted', async () => {
    const externalId = `receipt-race-${Date.now()}`;
    const svix = `svix-${externalId}`;
    const response = await signedRequest(app.getHttpServer(),svix,emailEvent('email.delivered',externalId,'2026-08-20T12:00:00Z')).expect(200);
    expect(response.body.reason).toBe('unmatched');
    await pool.query(`INSERT INTO delivery_provider_receipts (organization_id,source,delivery_id,idempotency_key,provider_id)
      VALUES ($1,'signature',900004,$2,$2)`,[organizationId,externalId]);
    await app.get(EmailWebhookJobsService).run({batchSize:100});
    const stored=(await pool.query('SELECT processing_status,reconciliation_status FROM email_webhook_events WHERE svix_id=$1',[svix])).rows[0];
    expect(stored).toEqual({processing_status:'processed',reconciliation_status:'resolved'});
  });

  it('backfills legacy acceptance and requeues only resolvable backlog without changing paid invoices', async () => {
    const externalId=`legacy-receipt-${Date.now()}`;
    const invoice=(await pool.query(`INSERT INTO invoices (organization_id,invoice_number,due_date,status,total,amount_paid)
      VALUES ($1,$2,CURRENT_DATE,'paid',25,25) RETURNING id`,[organizationId,externalId])).rows[0];
    const delivery=(await pool.query(`INSERT INTO invoice_email_deliveries
      (organization_id,invoice_id,idempotency_key,recipient_email,subject,payload,status,provider_id)
      VALUES ($1,$2,$3,'qa@example.test','Legacy','{}','sent',$3) RETURNING id`,[organizationId,invoice.id,externalId])).rows[0];
    const svix=`svix-${externalId}`;
    await signedRequest(app.getHttpServer(),svix,emailEvent('email.delivered',externalId,'2026-08-20T12:00:00Z')).expect(200);
    await pool.query("UPDATE email_webhook_events SET reconciliation_status='dead_letter',reconciliation_attempt_count=12 WHERE svix_id=$1",[svix]);
    const unknown=`unknown-${Date.now()}`;
    await signedRequest(app.getHttpServer(),unknown,emailEvent('email.delivered',unknown,'2026-08-20T12:00:00Z')).expect(200);
    await pool.query("UPDATE email_webhook_events SET reconciliation_status='dead_letter' WHERE svix_id=$1",[unknown]);
    const {runTransactionalEmailEventMigration}=require('../../../db/src/db_transactional_email_event_migrations');
    await runTransactionalEmailEventMigration(pool);
    await runTransactionalEmailEventMigration(pool);
    expect((await pool.query('SELECT reconciliation_status,reconciliation_attempt_count FROM email_webhook_events WHERE svix_id=$1',[svix])).rows[0])
      .toEqual({reconciliation_status:'retry',reconciliation_attempt_count:12});
    expect((await pool.query('SELECT reconciliation_status FROM email_webhook_events WHERE svix_id=$1',[unknown])).rows[0].reconciliation_status).toBe('dead_letter');
    await app.get(EmailWebhookJobsService).run({batchSize:100});
    expect((await pool.query('SELECT processing_status,reconciliation_status FROM email_webhook_events WHERE svix_id=$1',[svix])).rows[0])
      .toEqual({processing_status:'processed',reconciliation_status:'resolved'});
    expect((await app.get(InvoicesRepository).latestEmailDelivery(organizationId,invoice.id))?.provider_status).toBe('delivered');
    expect((await pool.query('SELECT status,total,amount_paid FROM invoices WHERE id=$1',[invoice.id])).rows[0])
      .toEqual({status:'paid',total:'25.00',amount_paid:'25.00'});
    expect((await pool.query('SELECT status,attempt_count FROM invoice_email_deliveries WHERE id=$1',[delivery.id])).rows[0])
      .toEqual({status:'sent',attempt_count:0});
  });

});
