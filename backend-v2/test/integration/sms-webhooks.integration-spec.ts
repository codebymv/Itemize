import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Twilio SMS webhook retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let ownerId: number;
  let receivingNumber: string;
  const savedSkip = process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;

  const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

  const post = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    path: string,
    params: Record<string, string>,
  ) => request(server).post(path).type('form').send(params);

  const seedOutboundLog = async (sid: string) => {
    await pool.query(
      `INSERT INTO sms_logs (organization_id, to_phone, from_phone, message, direction, status, external_id)
       VALUES ($1, '+15550001111', $2, 'outbound parity', 'outbound', 'sent', $3)`,
      [organizationId, receivingNumber, sid],
    );
  };

  const seedContact = async (phone: string) => {
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, phone, created_by)
       VALUES ($1, 'Sms', $2, $3)
       RETURNING id`,
      [organizationId, phone, ownerId],
    );
    return Number(contact.rows[0].id);
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for SMS webhook tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = 'true';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `sms-webhook-parity-${Date.now()}@test.itemize`,
      'SMS Webhook Owner',
    );
    organizationId = owner.org.id;
    ownerId = owner.user.id;
    receivingNumber = `+1555${String(Date.now()).slice(-7)}`;
    await pool.query(
      `INSERT INTO sms_receiving_numbers (organization_id, phone_number, provider, is_active)
       VALUES ($1, $2, 'twilio', TRUE)`,
      [organizationId, receivingNumber],
    );

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
    if (savedSkip === undefined) delete process.env.SKIP_TWILIO_WEBHOOK_VALIDATION;
    else process.env.SKIP_TWILIO_WEBHOOK_VALIDATION = savedSkip;
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
    'applies and deduplicates a status transition through the %s runtime',
    async (runtime, server) => {
      const sid = `SMstatus${runtime}${Date.now()}`;
      await seedOutboundLog(sid);
      const params = { MessageSid: sid, MessageStatus: 'read' };

      const first = await post(server(), '/api/sms-templates/webhook/status', params);
      expect(first.status).toBe(200);
      expect(first.text).toBe('OK');
      const duplicate = await post(server(), '/api/sms-templates/webhook/status', params);
      expect(duplicate.status).toBe(200);
      expect(duplicate.text).toBe('Duplicate');

      const stored = await pool.query(
        `SELECT status, delivered_at FROM sms_logs WHERE external_id = $1 AND direction = 'outbound'`,
        [sid],
      );
      expect(stored.rows[0].status).toBe('delivered');
      expect(stored.rows[0].delivered_at).not.toBeNull();
      const claim = await pool.query(
        'SELECT processing_status FROM sms_webhook_events WHERE event_key = $1',
        [`status:${sid}:read`],
      );
      expect(claim.rows[0].processing_status).toBe('processed');
    },
  );

  it('deduplicates a legacy-claimed status event through NestJS', async () => {
    const sid = `SMcross${Date.now()}`;
    await seedOutboundLog(sid);
    const params = { MessageSid: sid, MessageStatus: 'failed', ErrorCode: '30003' };
    await post(app.getHttpServer(), '/api/sms-templates/webhook/status', params).expect(200);
    const replay = await post(
      app.getHttpServer(),
      '/api/sms-templates/webhook/status',
      params,
    );
    expect(replay.status).toBe(200);
    expect(replay.text).toBe('Duplicate');
  });

  it('rejects missing and unsupported status inputs identically', async () => {
    for (const params of [
      { MessageStatus: 'sent' },
      { MessageSid: 'SMx', MessageStatus: 'teleported' },
    ]) {
      const nest = await post(app.getHttpServer(), '/api/sms-templates/webhook/status', params as Record<string, string>);
      expect(nest.status).toBe(400);
    }
  });

  it('routes an inbound message identically and reuses the open conversation', async () => {
    const senderPhone = `+1666${String(Date.now()).slice(-7)}`;
    const contactId = await seedContact(senderPhone);

    const nestSid = `SMinN${Date.now()}`;
    const nest = await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
      MessageSid: nestSid,
      From: senderPhone,
      To: receivingNumber,
      Body: 'Hello from nest',
    });
    expect(nest.status).toBe(200);
    expect(nest.headers['content-type']).toContain('text/xml');
    expect(nest.text).toBe(TWIML);

    const legacySid = `SMinL${Date.now()}`;
    const legacy = await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
      MessageSid: legacySid,
      From: senderPhone,
      To: receivingNumber,
      Body: 'Hello from legacy',
    });

    const conversations = await pool.query(
      `SELECT id, unread_count, last_message_preview
       FROM conversations
       WHERE contact_id = $1 AND channel = 'sms'`,
      [contactId],
    );
    expect(conversations.rows).toHaveLength(1);
    expect(conversations.rows[0].unread_count).toBe(2);
    expect(conversations.rows[0].last_message_preview).toBe('Hello from legacy');

    const messages = await pool.query(
      `SELECT content FROM messages WHERE conversation_id = $1 ORDER BY id`,
      [conversations.rows[0].id],
    );
    expect(messages.rows.map((row) => row.content)).toEqual([
      'Hello from nest',
      'Hello from legacy',
    ]);
    const logs = await pool.query(
      `SELECT external_id, status FROM sms_logs
       WHERE direction = 'inbound' AND external_id = ANY($1::text[])
       ORDER BY id`,
      [[nestSid, legacySid]],
    );
    expect(logs.rows).toHaveLength(2);
    expect(logs.rows.every((row) => row.status === 'received')).toBe(true);

    const duplicate = await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
      MessageSid: nestSid,
      From: senderPhone,
      To: receivingNumber,
      Body: 'Replay',
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.text).toBe(TWIML);
    const replayMessages = await pool.query(
      'SELECT id FROM messages WHERE conversation_id = $1',
      [conversations.rows[0].id],
    );
    expect(replayMessages.rows).toHaveLength(2);
  });

  it('quarantines unmatched receivers and unmatched or ambiguous senders identically', async () => {
    const unknownReceiverSid = `SMnorecv${Date.now()}`;
    const nestNoRecv = await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
        MessageSid: unknownReceiverSid,
        From: '+15551230000',
        To: '+15559990000',
        Body: 'Nobody listens here',
      });
    expect(nestNoRecv.status).toBe(200);
    expect(nestNoRecv.text).toBe(TWIML);
    const noRecvClaim = await pool.query(
      'SELECT processing_status FROM sms_webhook_events WHERE event_key = $1',
      [`inbound:${unknownReceiverSid}`],
    );
    expect(noRecvClaim.rows[0].processing_status).toBe('unmatched_receiver');

    const unknownSenderSid = `SMnosender${Date.now()}`;
    await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
      MessageSid: unknownSenderSid,
      From: '+17770001111',
      To: receivingNumber,
      Body: 'Stranger',
    }).expect(200);
    const noSenderClaim = await pool.query(
      'SELECT processing_status, organization_id FROM sms_webhook_events WHERE event_key = $1',
      [`inbound:${unknownSenderSid}`],
    );
    expect(noSenderClaim.rows[0]).toMatchObject({
      processing_status: 'unmatched_sender',
      organization_id: organizationId,
    });

    const duplicatePhone = `+1888${String(Date.now()).slice(-7)}`;
    await seedContact(duplicatePhone);
    await seedContact(duplicatePhone);
    const ambiguousSid = `SMambig${Date.now()}`;
    await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', {
      MessageSid: ambiguousSid,
      From: duplicatePhone,
      To: receivingNumber,
      Body: 'Which one of you?',
    }).expect(200);
    const ambiguousClaim = await pool.query(
      'SELECT processing_status FROM sms_webhook_events WHERE event_key = $1',
      [`inbound:${ambiguousSid}`],
    );
    expect(ambiguousClaim.rows[0].processing_status).toBe('ambiguous_sender');
  });

  it('rejects incomplete inbound payloads identically', async () => {
    const params = { MessageSid: 'SMincomplete', From: '+15550001111' };
    const nest = await post(app.getHttpServer(), '/api/sms-templates/webhook/inbound', params);
    expect(nest.status).toBe(400);
    expect(nest.text).toBe('Missing required fields');
  });
});
