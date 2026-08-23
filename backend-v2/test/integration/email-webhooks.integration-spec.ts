import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { Webhook } from 'svix';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

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

describe('Resend webhook retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
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
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    const createEmailWebhookRoutes = require('../../../backend/src/routes/email-webhooks.routes');
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

    legacyApp = express();
    legacyApp.use(
      express.json({
        verify: (req, _res, buffer) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(buffer);
        },
      }),
    );
    legacyApp.use('/api/email', createEmailWebhookRoutes(pool));
  }, 60000);

  afterAll(async () => {
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
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

  it('replays a legacy-claimed delivery id as a duplicate through NestJS', async () => {
    const externalId = `crossdup-${Date.now()}`;
    await seedContactAndLog(externalId);
    const event = emailEvent(
      'email.delivered',
      externalId,
      '2026-08-20T12:00:00.000Z',
    );
    const deliveryId = `svix-crossdup-${Date.now()}`;
    await signedRequest(legacyApp, deliveryId, event).expect(200);
    const replay = await signedRequest(app.getHttpServer(), deliveryId, event);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({
      received: true,
      duplicate: true,
      matched: false,
    });
  });

  it('never regresses a newer status and applies permanent-bounce suppression identically', async () => {
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
      legacyApp,
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

  it('quarantines unmatched and cross-tenant ambiguous events identically', async () => {
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
    const [nest, legacy] = await Promise.all([
      signedRequest(
        app.getHttpServer(),
        `svix-ambiguous-nest-${Date.now()}`,
        emailEvent('email.delivered', sharedExternal, '2026-08-20T12:00:00.000Z'),
      ),
      signedRequest(
        legacyApp,
        `svix-ambiguous-legacy-${Date.now()}`,
        emailEvent('email.opened', sharedExternal, '2026-08-20T13:00:00.000Z'),
      ),
    ]);
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      matched: false,
      pending: true,
      reason: 'ambiguous',
    });
    expect(legacy.body).toEqual(
      expect.objectContaining({ pending: true, reason: 'ambiguous' }),
    );
  });

  it('ignores non-actionable event types identically', async () => {
    const externalId = `delayed-${Date.now()}`;
    await seedContactAndLog(externalId);
    const [nest, legacy] = await Promise.all([
      signedRequest(
        app.getHttpServer(),
        `svix-delayed-nest-${Date.now()}`,
        { ...emailEvent('email.unknown_type', externalId, '2026-08-20T12:00:00.000Z') },
      ),
      signedRequest(
        legacyApp,
        `svix-delayed-legacy-${Date.now()}`,
        { ...emailEvent('email.unknown_type', externalId, '2026-08-20T12:00:00.000Z') },
      ),
    ]);
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual(legacy.body);
    expect(nest.body).toEqual({
      received: true,
      duplicate: false,
      ignored: true,
      matched: false,
    });
  });

  it('rejects tampered signatures and malformed events identically', async () => {
    const externalId = `invalid-${Date.now()}`;
    await seedContactAndLog(externalId);

    const [nestBad, legacyBad] = await Promise.all([
      signedRequest(
        app.getHttpServer(),
        `svix-badsig-nest-${Date.now()}`,
        emailEvent('email.delivered', externalId, '2026-08-20T12:00:00.000Z'),
        { valid: false },
      ),
      signedRequest(
        legacyApp,
        `svix-badsig-legacy-${Date.now()}`,
        emailEvent('email.delivered', externalId, '2026-08-20T12:00:00.000Z'),
        { valid: false },
      ),
    ]);
    expect(nestBad.status).toBe(400);
    expect(legacyBad.status).toBe(400);
    expect(nestBad.body).toEqual(legacyBad.body);
    expect(nestBad.body).toEqual({ error: 'Invalid webhook' });

    const missingId = { type: 'email.delivered', created_at: '2026-08-20T12:00:00.000Z', data: {} };
    const [nestInvalid, legacyInvalid] = await Promise.all([
      signedRequest(app.getHttpServer(), `svix-noid-nest-${Date.now()}`, missingId),
      signedRequest(legacyApp, `svix-noid-legacy-${Date.now()}`, missingId),
    ]);
    expect(nestInvalid.status).toBe(400);
    expect(legacyInvalid.status).toBe(400);
    expect(nestInvalid.body).toEqual(legacyInvalid.body);
    expect(nestInvalid.body).toEqual({ error: 'Invalid webhook event' });
  });

  it('fails closed identically when the signing secret is absent', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      const [nest, legacy] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/email/webhook/resend')
          .set('svix-id', 'msg_nosecret')
          .send({ type: 'email.delivered' }),
        request(legacyApp)
          .post('/api/email/webhook/resend')
          .set('svix-id', 'msg_nosecret')
          .send({ type: 'email.delivered' }),
      ]);
      expect(nest.status).toBe(503);
      expect(legacy.status).toBe(503);
      expect(nest.body).toEqual(legacy.body);
      expect(nest.body).toEqual({ error: 'Webhook verification unavailable' });
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = signingSecret;
    }
  });
});
