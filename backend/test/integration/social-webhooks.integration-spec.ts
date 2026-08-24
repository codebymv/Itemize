import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

const VERIFY_TOKEN = 'meta-verify-parity-token';
const APP_SECRET = 'meta-app-parity-secret';

const messagingPayload = (
  mid: string,
  { object = 'page', text = 'Hello there' }: { object?: string; text?: string } = {},
) => ({
  object,
  entry: [
    {
      id: '1234567890',
      messaging: [
        {
          sender: { id: '9876543210' },
          timestamp: 1755900000000,
          message: { mid, text },
        },
      ],
    },
  ],
});

describe('Meta social webhook retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  const savedVerify = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  const savedSecret = process.env.FACEBOOK_APP_SECRET;

  const signedReceive = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    payload: unknown,
    { tamper = false } = {},
  ) => {
    const raw = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', tamper ? 'wrong-secret' : APP_SECRET)
      .update(raw)
      .digest('hex');
    return request(server)
      .post('/api/social/webhook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${signature}`)
      .send(raw);
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for social webhook tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.FACEBOOK_APP_SECRET = APP_SECRET;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
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

  }, 60000);

  afterAll(async () => {
    if (savedVerify === undefined) delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    else process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = savedVerify;
    if (savedSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = savedSecret;
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

  it('answers the verification challenge identically across all branches', async () => {
    const cases: Array<[string, number, string | null]> = [
      [
        `hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-1`,
        200,
        'challenge-1',
      ],
      [
        'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-2',
        403,
        null,
      ],
      ['hub.mode=subscribe&hub.verify_token=tok', 400, null],
    ];
    for (const [query, status, challenge] of cases) {
      const nest = await request(app.getHttpServer()).get(`/api/social/webhook?${query}`);
      expect(nest.status).toBe(status);
      if (challenge) expect(nest.text).toBe(challenge);
    }

    delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    try {
      const nest = await request(app.getHttpServer()).get(
          '/api/social/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=x',
        );
      expect(nest.status).toBe(503);
    } finally {
      process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    }
  });

  it.each([
    ['nest', () => app.getHttpServer()],
  ] as const)(
    'claims signed messaging events durably through the %s runtime',
    async (runtime, server) => {
      const mid = `mid.parity.${runtime}.${Date.now()}`;
      const response = await signedReceive(server(), messagingPayload(mid));
      expect(response.status).toBe(200);
      expect(response.text).toBe('EVENT_RECEIVED');

      const claim = await pool.query(
        `SELECT event_type, channel_type, destination_id, sender_id,
                message_type, text_content, work_status
         FROM social_webhook_events WHERE event_key = $1`,
        [`facebook:${mid}`],
      );
      expect(claim.rows[0]).toMatchObject({
        event_type: 'messaging',
        channel_type: 'facebook',
        destination_id: '1234567890',
        sender_id: '9876543210',
        message_type: 'text',
        text_content: 'Hello there',
      });
      expect(['queued', 'completed']).toContain(claim.rows[0].work_status);
    },
  );

  it('replays a legacy-claimed message through NestJS without a second claim', async () => {
    const mid = `mid.cross.${Date.now()}`;
    await signedReceive(app.getHttpServer(), messagingPayload(mid)).expect(200);
    const replay = await signedReceive(
      app.getHttpServer(),
      messagingPayload(mid),
    );
    expect(replay.status).toBe(200);
    expect(replay.text).toBe('EVENT_RECEIVED');
    const claims = await pool.query(
      'SELECT event_key FROM social_webhook_events WHERE event_key = $1',
      [`facebook:${mid}`],
    );
    expect(claims.rows).toHaveLength(1);
  });

  it('rejects tampered signatures, unknown objects, and malformed events identically', async () => {
    const payload = messagingPayload(`mid.bad.${Date.now()}`);
    const nestBad = await signedReceive(app.getHttpServer(), payload, { tamper: true });
    expect(nestBad.status).toBe(401);

    const nestUnknown = await signedReceive(
        app.getHttpServer(),
        messagingPayload(`mid.obj.${Date.now()}`, { object: 'whatsapp' }),
      );
    expect(nestUnknown.status).toBe(404);

    const invalid = {
      object: 'page',
      entry: [
        {
          id: '1234567890',
          messaging: [
            {
              sender: { id: '9876543210' },
              timestamp: 'not-a-time',
              message: { mid: `mid.ts.${Date.now()}` },
            },
          ],
        },
      ],
    };
    const nestInvalid = await signedReceive(app.getHttpServer(), invalid);
    expect(nestInvalid.status).toBe(400);
  });

  it('fails closed identically when the app secret is absent', async () => {
    delete process.env.FACEBOOK_APP_SECRET;
    try {
      const payload = messagingPayload(`mid.nosecret.${Date.now()}`);
      const raw = JSON.stringify(payload);
      const nest = await request(app.getHttpServer())
          .post('/api/social/webhook')
          .set('Content-Type', 'application/json')
          .set('x-hub-signature-256', `sha256=${'ab'.repeat(32)}`)
          .send(raw);
      expect(nest.status).toBe(503);
    } finally {
      process.env.FACEBOOK_APP_SECRET = APP_SECRET;
    }
  });
});
