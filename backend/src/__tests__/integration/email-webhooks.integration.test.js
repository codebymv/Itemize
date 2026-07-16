const express = require('express');
const request = require('supertest');
const { Webhook } = require('svix');

const TestDbHelper = require('./test-db-helper');
const createEmailWebhookRoutes = require('../../routes/email-webhooks.routes');
const { runEmailWebhookReconciliationJobs } = require('../../jobs/email-webhook-jobs');

const signingSecret = `whsec_${Buffer.from('itemize-email-webhook-integration-secret').toString('base64')}`;

function createApp(pool) {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
  }));
  app.use('/api/email', createEmailWebhookRoutes(pool));
  return app;
}

function signedRequest(app, deliveryId, event, { valid = true } = {}) {
  const payload = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(signingSecret).sign(deliveryId, timestamp, payload);
  return request(app)
    .post('/api/email/webhook/resend')
    .set('Content-Type', 'application/json')
    .set('svix-id', deliveryId)
    .set('svix-timestamp', String(Math.floor(timestamp.getTime() / 1000)))
    .set('svix-signature', valid ? signature : 'v1,invalid')
    .send(payload);
}

function emailEvent(type, emailId, createdAt, extra = {}) {
  return {
    type,
    created_at: createdAt,
    data: {
      email_id: emailId,
      created_at: createdAt,
      from: 'Itemize <noreply@itemize.test>',
      to: ['recipient@example.test'],
      subject: 'Provider event test',
      ...extra,
    },
  };
}

describe('Resend email webhook PostgreSQL contract', () => {
  let dbHelper;
  let app;
  let user;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.RESEND_WEBHOOK_SECRET = signingSecret;
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    app = createApp(dbHelper.pool);
    user = await dbHelper.seedUser(`email-webhook-${Date.now()}@test.itemize`, 'Email Webhook User');
  }, 30000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    await dbHelper.teardown();
  }, 30000);

  async function createContactAndLog(externalId) {
    const contact = (await dbHelper.pool.query(`
      INSERT INTO contacts (organization_id, first_name, email, created_by)
      VALUES ($1, 'Webhook', $2, $3)
      RETURNING id
    `, [user.org.id, `${externalId}@example.test`, user.user.id])).rows[0];
    const log = (await dbHelper.pool.query(`
      INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, external_id)
      VALUES ($1, $2, $3, 'Provider event test', 'sent', $4)
      RETURNING id
    `, [user.org.id, contact.id, `${externalId}@example.test`, externalId])).rows[0];
    return { contact, log };
  }

  test('verifies, applies, and deduplicates a delivered event', async () => {
    const externalId = `delivered-${Date.now()}`;
    const { log } = await createContactAndLog(externalId);
    const event = emailEvent('email.delivered', externalId, '2026-07-15T12:00:00.000Z');
    const deliveryId = `svix-delivered-${Date.now()}`;

    const first = await signedRequest(app, deliveryId, event);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ received: true, duplicate: false, matched: true });
    const duplicate = await signedRequest(app, deliveryId, event);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);

    const [storedLog, claims] = await Promise.all([
      dbHelper.pool.query('SELECT status, delivered_at FROM email_logs WHERE id = $1', [log.id]),
      dbHelper.pool.query('SELECT * FROM email_webhook_events WHERE svix_id = $1', [deliveryId]),
    ]);
    expect(storedLog.rows[0].status).toBe('delivered');
    expect(storedLog.rows[0].delivered_at).not.toBeNull();
    expect(claims.rows).toHaveLength(1);
  });

  test('uses provider occurrence time so late delivery cannot regress a click', async () => {
    const externalId = `ordering-${Date.now()}`;
    const { log } = await createContactAndLog(externalId);
    await signedRequest(app, `svix-click-${Date.now()}`, emailEvent(
      'email.clicked', externalId, '2026-07-15T12:05:00.000Z',
      { click: { link: 'https://itemize.test/offer' } }
    ));
    await signedRequest(app, `svix-late-delivery-${Date.now()}`, emailEvent(
      'email.delivered', externalId, '2026-07-15T12:01:00.000Z'
    ));
    await signedRequest(app, `svix-equal-delivery-${Date.now()}`, emailEvent(
      'email.delivered', externalId, '2026-07-15T12:05:00.000Z'
    ));

    const stored = await dbHelper.pool.query(
      'SELECT status, delivered_at, clicked_at, provider_status_at FROM email_logs WHERE id = $1',
      [log.id]
    );
    expect(stored.rows[0].status).toBe('clicked');
    expect(stored.rows[0].delivered_at).not.toBeNull();
    expect(stored.rows[0].clicked_at).not.toBeNull();
    expect(stored.rows[0].provider_status_at.toISOString()).toBe('2026-07-15T12:05:00.000Z');
  });

  test('permanent bounces suppress only the matched contact', async () => {
    const externalId = `bounce-${Date.now()}`;
    const { contact, log } = await createContactAndLog(externalId);
    const response = await signedRequest(app, `svix-bounce-${Date.now()}`, emailEvent(
      'email.bounced', externalId, '2026-07-15T12:10:00.000Z',
      { bounce: { type: 'Permanent', subType: 'General', message: 'Mailbox unavailable' } }
    ));
    expect(response.status).toBe(200);

    const [storedLog, storedContact] = await Promise.all([
      dbHelper.pool.query('SELECT status, bounced_at FROM email_logs WHERE id = $1', [log.id]),
      dbHelper.pool.query('SELECT email_bounced, email_bounce_type, email_bounced_at FROM contacts WHERE id = $1', [contact.id]),
    ]);
    expect(storedLog.rows[0].status).toBe('bounced');
    expect(storedContact.rows[0]).toMatchObject({ email_bounced: true, email_bounce_type: 'Permanent' });
    expect(storedContact.rows[0].email_bounced_at).not.toBeNull();
  });

  test('updates campaign engagement and complaint suppression', async () => {
    const externalId = `campaign-${Date.now()}`;
    const contact = (await dbHelper.pool.query(`
      INSERT INTO contacts (organization_id, first_name, email, created_by)
      VALUES ($1, 'Campaign', $2, $3) RETURNING id
    `, [user.org.id, `${externalId}@example.test`, user.user.id])).rows[0];
    const campaign = (await dbHelper.pool.query(`
      INSERT INTO email_campaigns (organization_id, name, subject, status, created_by)
      VALUES ($1, 'Webhook campaign', 'Subject', 'sent', $2) RETURNING id
    `, [user.org.id, user.user.id])).rows[0];
    const recipient = (await dbHelper.pool.query(`
      INSERT INTO campaign_recipients
        (campaign_id, contact_id, organization_id, email, status, external_message_id)
      VALUES ($1, $2, $3, $4, 'sent', $5) RETURNING id
    `, [campaign.id, contact.id, user.org.id, `${externalId}@example.test`, externalId])).rows[0];

    await signedRequest(app, `svix-open-${Date.now()}`, emailEvent(
      'email.opened', externalId, '2026-07-15T12:20:00.000Z'
    ));
    await signedRequest(app, `svix-complaint-${Date.now()}`, emailEvent(
      'email.complained', externalId, '2026-07-15T12:21:00.000Z'
    ));

    const [storedRecipient, storedContact] = await Promise.all([
      dbHelper.pool.query('SELECT status, open_count, opened_at, unsubscribed_at FROM campaign_recipients WHERE id = $1', [recipient.id]),
      dbHelper.pool.query('SELECT email_unsubscribed, email_unsubscribed_at FROM contacts WHERE id = $1', [contact.id]),
    ]);
    expect(storedRecipient.rows[0]).toMatchObject({ status: 'complained', open_count: 1 });
    expect(storedRecipient.rows[0].unsubscribed_at).not.toBeNull();
    expect(storedContact.rows[0].email_unsubscribed).toBe(true);
  });

  test('stores unmatched valid events for reconciliation and rejects invalid signatures', async () => {
    const externalId = `unmatched-${Date.now()}`;
    const validId = `svix-unmatched-${Date.now()}`;
    const valid = await signedRequest(app, validId, emailEvent(
      'email.delivered', externalId, '2026-07-15T12:30:00.000Z'
    ));
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ matched: false, pending: true });
    const pending = await dbHelper.pool.query(
      `SELECT processing_status, reconciliation_status, reconciliation_reason
       FROM email_webhook_events WHERE svix_id = $1`,
      [validId]
    );
    expect(pending.rows[0]).toMatchObject({
      processing_status: 'pending',
      reconciliation_status: 'pending',
      reconciliation_reason: 'unmatched',
    });

    const invalid = await signedRequest(app, `svix-invalid-${Date.now()}`, emailEvent(
      'email.delivered', externalId, '2026-07-15T12:31:00.000Z'
    ), { valid: false });
    expect(invalid.status).toBe(400);
  });

  test('concurrent workers replay an unmatched event once after its send log appears', async () => {
    const suffix = Date.now();
    const externalId = `reconcile-unmatched-${suffix}`;
    const deliveryId = `svix-reconcile-unmatched-${suffix}`;
    expect((await signedRequest(app, deliveryId, emailEvent(
      'email.delivered', externalId, '2026-07-15T12:40:00.000Z'
    ))).status).toBe(200);
    const { log } = await createContactAndLog(externalId);
    await dbHelper.pool.query(`
      UPDATE email_webhook_events
      SET reconciliation_status = 'dead_letter'
      WHERE svix_id <> $1 AND reconciliation_status IN ('pending', 'retry')
    `, [deliveryId]);

    const results = await Promise.all([
      runEmailWebhookReconciliationJobs(dbHelper.pool, { batchSize: 1 }),
      runEmailWebhookReconciliationJobs(dbHelper.pool, { batchSize: 1 }),
    ]);
    expect(results.reduce((total, result) => total + result.resolved, 0)).toBe(1);
    const [storedLog, claim] = await Promise.all([
      dbHelper.pool.query('SELECT status, delivered_at FROM email_logs WHERE id = $1', [log.id]),
      dbHelper.pool.query(`
        SELECT processing_status, reconciliation_status,
               reconciliation_attempt_count, reconciled_at
        FROM email_webhook_events WHERE svix_id = $1
      `, [deliveryId]),
    ]);
    expect(storedLog.rows[0].status).toBe('delivered');
    expect(storedLog.rows[0].delivered_at).not.toBeNull();
    expect(claim.rows[0]).toMatchObject({
      processing_status: 'processed',
      reconciliation_status: 'resolved',
      reconciliation_attempt_count: 1,
    });
    expect(claim.rows[0].reconciled_at).not.toBeNull();
  });

  test('cross-tenant provider-ID ambiguity retries without mutating either tenant', async () => {
    const suffix = Date.now();
    const externalId = `reconcile-ambiguous-${suffix}`;
    const deliveryId = `svix-reconcile-ambiguous-${suffix}`;
    const first = await createContactAndLog(externalId);
    const outsider = await dbHelper.seedUser(
      `email-webhook-outsider-${suffix}@test.itemize`,
      'Email Webhook Outsider'
    );
    const outsiderContact = (await dbHelper.pool.query(`
      INSERT INTO contacts (organization_id, first_name, email, created_by)
      VALUES ($1, 'Outsider', $2, $3) RETURNING id
    `, [outsider.org.id, `${externalId}-outsider@example.test`, outsider.user.id])).rows[0];
    const outsiderLog = (await dbHelper.pool.query(`
      INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, external_id)
      VALUES ($1, $2, $3, 'Provider event test', 'sent', $4) RETURNING id
    `, [
      outsider.org.id,
      outsiderContact.id,
      `${externalId}-outsider@example.test`,
      externalId,
    ])).rows[0];

    const response = await signedRequest(app, deliveryId, emailEvent(
      'email.opened', externalId, '2026-07-15T12:45:00.000Z'
    ));
    expect(response.body).toMatchObject({ matched: false, pending: true, reason: 'ambiguous' });
    let logs = await dbHelper.pool.query(
      'SELECT status FROM email_logs WHERE id = ANY($1::integer[]) ORDER BY id',
      [[first.log.id, outsiderLog.id]]
    );
    expect(logs.rows.map(row => row.status)).toEqual(['sent', 'sent']);
    await dbHelper.pool.query(`
      UPDATE email_webhook_events
      SET reconciliation_status = 'dead_letter'
      WHERE svix_id <> $1 AND reconciliation_status IN ('pending', 'retry')
    `, [deliveryId]);

    const deferred = await runEmailWebhookReconciliationJobs(dbHelper.pool, {
      baseDelayMs: 1, batchSize: 1, maxAttempts: 3,
    });
    expect(deferred).toMatchObject({ claimed: 1, retry: 1, resolved: 0 });
    await dbHelper.pool.query(
      'UPDATE email_logs SET external_id = $1 WHERE id = $2',
      [`${externalId}-other`, outsiderLog.id]
    );
    await dbHelper.pool.query(`
      UPDATE email_webhook_events
      SET reconciliation_next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE svix_id = $1
    `, [deliveryId]);

    const resolved = await runEmailWebhookReconciliationJobs(dbHelper.pool, {
      batchSize: 1, maxAttempts: 3,
    });
    expect(resolved).toMatchObject({ claimed: 1, retry: 0, resolved: 1 });
    logs = await dbHelper.pool.query(
      'SELECT status FROM email_logs WHERE id = ANY($1::integer[]) ORDER BY id',
      [[first.log.id, outsiderLog.id]]
    );
    expect(logs.rows.map(row => row.status)).toEqual(['opened', 'sent']);
    const claim = await dbHelper.pool.query(`
      SELECT reconciliation_status, reconciliation_attempt_count, reconciliation_last_error
      FROM email_webhook_events WHERE svix_id = $1
    `, [deliveryId]);
    expect(claim.rows[0]).toMatchObject({
      reconciliation_status: 'resolved',
      reconciliation_attempt_count: 2,
      reconciliation_last_error: null,
    });
  });
});
