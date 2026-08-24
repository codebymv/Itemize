import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express } from 'express';
import { Pool } from 'pg';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

function once<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeout,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Chat widget public retained HTTP parity (NestJS host runtime vs legacy origin)', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let owner: any;
  let baseUrl: string;
  let widgetKey: string;
  let strictWidgetKey: string;
  let hoursWidgetKey: string;
  const clients: ClientSocket[] = [];

  const connectAgent = async (): Promise<ClientSocket> => {
    const socket = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `itemize_auth=${owner.token}` },
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    const joined = once(socket, 'joinedOrgChat');
    socket.emit('joinOrgChat', { organizationId: owner.org.id });
    await joined;
    return socket;
  };

  // chat_widgets enforces one widget per organization, so each variant
  // widget lives in its own seeded organization.
  const seedWidget = async (
    organizationId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<string> => {
    const key = 'cw_' + crypto.randomBytes(16).toString('hex');
    const columns = ['organization_id', 'name', 'widget_key'];
    const values: unknown[] = [organizationId, 'Parity widget', key];
    for (const [column, value] of Object.entries(overrides)) {
      columns.push(column);
      values.push(value);
    }
    await pool.query(
      `INSERT INTO chat_widgets (${columns.join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      values,
    );
    return key;
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for chat widget tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.REALTIME_HOST_NESTJS_ENABLED = 'true';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    const createChatWidgetPublicRoutes = require('../../../backend/src/routes/chat-widget/public.routes');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `chat-widget-parity-${Date.now()}@test.itemize`,
      'Chat Widget Owner',
    );
    const strictOwner = await dbHelper.seedUser(
      `chat-widget-strict-${Date.now()}@test.itemize`,
      'Strict Widget Owner',
    );
    const hoursOwner = await dbHelper.seedUser(
      `chat-widget-hours-${Date.now()}@test.itemize`,
      'Hours Widget Owner',
    );

    // require_email/require_name default TRUE in the schema; the plain
    // widget is made permissive so the strict widget isolates validation.
    widgetKey = await seedWidget(owner.org.id, {
      require_email: false,
      require_name: false,
    });
    strictWidgetKey = await seedWidget(strictOwner.org.id, {
      require_email: true,
      require_name: true,
    });
    hoursWidgetKey = await seedWidget(hoursOwner.org.id, {
      business_hours: JSON.stringify(
        Object.fromEntries(
          ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(
            (day) => [day, { start: '00:00', end: '23:59' }],
          ),
        ),
      ),
    });

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
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    legacyApp = express();
    legacyApp.use(express.json());
    const noopRateLimit = (
      _req: unknown,
      _res: unknown,
      nextFn: () => void,
    ) => nextFn();
    legacyApp.use(
      '/api/chat-widget',
      createChatWidgetPublicRoutes(pool, noopRateLimit, null, null),
    );
  }, 60000);

  afterAll(async () => {
    for (const socket of clients) socket.disconnect();
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

  const bothGet = async (path: string) => {
    const [nest, legacy] = await Promise.all([
      request(baseUrl).get(path),
      request(legacyApp).get(path),
    ]);
    return { nest, legacy };
  };

  it('serves widget configuration identically, including repaired business hours', async () => {
    const plain = await bothGet(`/api/chat-widget/public/config/${widgetKey}`);
    expect(plain.nest.status).toBe(200);
    expect(plain.legacy.status).toBe(200);
    expect(plain.nest.body).toEqual(plain.legacy.body);
    expect(plain.nest.body.is_online).toBe(true);

    const hours = await bothGet(`/api/chat-widget/public/config/${hoursWidgetKey}`);
    expect(hours.nest.status).toBe(200);
    expect(hours.legacy.status).toBe(200);
    expect(hours.nest.body).toEqual(hours.legacy.body);
    expect(hours.nest.body.is_online).toBe(true);

    const unknown = await bothGet('/api/chat-widget/public/config/cw_missing');
    expect(unknown.nest.status).toBe(404);
    expect(unknown.legacy.status).toBe(404);
    expect(unknown.nest.body).toEqual(unknown.legacy.body);
  });

  it('starts, resumes across runtimes, and validates sessions identically', async () => {
    const missingKey = await Promise.all([
      request(baseUrl).post('/api/chat-widget/public/session').send({}),
      request(legacyApp).post('/api/chat-widget/public/session').send({}),
    ]);
    expect(missingKey[0].status).toBe(400);
    expect(missingKey[0].body).toEqual(missingKey[1].body);

    const requiredEmail = await Promise.all([
      request(baseUrl)
        .post('/api/chat-widget/public/session')
        .send({ widget_key: strictWidgetKey, visitor_name: 'Sam' }),
      request(legacyApp)
        .post('/api/chat-widget/public/session')
        .send({ widget_key: strictWidgetKey, visitor_name: 'Sam' }),
    ]);
    expect(requiredEmail[0].status).toBe(400);
    expect(requiredEmail[0].body).toEqual(requiredEmail[1].body);
    expect(requiredEmail[0].body).toEqual({ error: 'Email is required' });

    const agent = await connectAgent();
    const announced = once<{ visitor_email: string }>(agent, 'newChatSession');
    const email = `visitor-${Date.now()}@example.test`;
    const created = await request(baseUrl)
      .post('/api/chat-widget/public/session')
      .send({ widget_key: widgetKey, visitor_email: email, visitor_name: 'Vis' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ resumed: false });
    expect(created.body.session_token).toMatch(/^cs_[0-9a-f]{48}$/);
    expect((await announced).visitor_email).toBe(email);

    const resumedThroughLegacy = await request(legacyApp)
      .post('/api/chat-widget/public/session')
      .send({ widget_key: widgetKey, visitor_email: email });
    expect(resumedThroughLegacy.status).toBe(200);
    expect(resumedThroughLegacy.body).toEqual({
      session_token: created.body.session_token,
      session_id: created.body.session_id,
      resumed: true,
    });
    agent.disconnect();
  });

  it('sends visitor messages with agent notification and lists them identically', async () => {
    const session = await request(baseUrl)
      .post('/api/chat-widget/public/session')
      .send({ widget_key: widgetKey, visitor_email: `msg-${Date.now()}@t.test` });
    const sessionToken = session.body.session_token;

    const invalid = await Promise.all([
      request(baseUrl).post('/api/chat-widget/public/messages').send({ session_token: sessionToken, content: '   ' }),
      request(legacyApp).post('/api/chat-widget/public/messages').send({ session_token: sessionToken, content: '   ' }),
    ]);
    expect(invalid[0].status).toBe(400);
    expect(invalid[0].body).toEqual(invalid[1].body);

    const agent = await connectAgent();
    const notified = once<{ message: { content: string } }>(agent, 'newChatMessage');
    const sent = await request(baseUrl)
      .post('/api/chat-widget/public/messages')
      .send({ session_token: sessionToken, content: '  Hello agents  ' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ sender_type: 'visitor', content: 'Hello agents' });
    expect((await notified).message.content).toBe('Hello agents');

    const listed = await Promise.all([
      request(baseUrl).get(`/api/chat-widget/public/messages/${sessionToken}`),
      request(legacyApp).get(`/api/chat-widget/public/messages/${sessionToken}`),
    ]);
    expect(listed[0].status).toBe(200);
    expect(listed[0].body).toEqual(listed[1].body);
    expect(listed[0].body).toHaveLength(1);

    const unknown = await bothGet(
      `/api/chat-widget/public/messages/cs_${'0'.repeat(48)}`,
    );
    expect(unknown.nest.status).toBe(404);
    expect(unknown.nest.body).toEqual(unknown.legacy.body);
    agent.disconnect();
  });

  it('routes typing indicators to the agent room and validates identically', async () => {
    const session = await request(baseUrl)
      .post('/api/chat-widget/public/session')
      .send({ widget_key: widgetKey, visitor_email: `typing-${Date.now()}@t.test` });
    const sessionToken = session.body.session_token;

    const agent = await connectAgent();
    const seen = once<{ is_typing: boolean }>(agent, 'visitorTyping');
    const typed = await request(baseUrl)
      .post('/api/chat-widget/public/typing')
      .send({ session_token: sessionToken });
    expect(typed.status).toBe(200);
    expect(typed.body).toEqual({ success: true });
    expect((await seen).is_typing).toBe(true);

    const missing = await Promise.all([
      request(baseUrl).post('/api/chat-widget/public/typing').send({}),
      request(legacyApp).post('/api/chat-widget/public/typing').send({}),
    ]);
    expect(missing[0].status).toBe(400);
    expect(missing[0].body).toEqual(missing[1].body);
    agent.disconnect();
  });

  it('ends sessions with agent notification, visitor eviction, and identical replay denial', async () => {
    const session = await request(baseUrl)
      .post('/api/chat-widget/public/session')
      .send({ widget_key: widgetKey, visitor_email: `end-${Date.now()}@t.test` });
    const sessionToken = session.body.session_token;

    const visitor = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(visitor);
    await new Promise<void>((resolve) => visitor.on('connect', () => resolve()));
    const joined = once(visitor, 'joinedChatSession');
    visitor.emit('joinChatSession', sessionToken);
    await joined;

    const agent = await connectAgent();
    const agentNotified = once(agent, 'chatSessionEnded');
    const visitorEnded = once<{ reason: string }>(visitor, 'chatSessionEnded');

    const ended = await request(baseUrl)
      .post('/api/chat-widget/public/end-session')
      .send({ session_token: sessionToken });
    expect(ended.status).toBe(200);
    expect(ended.body).toEqual({ success: true });
    await agentNotified;
    expect((await visitorEnded).reason).toBe('session_ended');

    const replay = await Promise.all([
      request(baseUrl).post('/api/chat-widget/public/end-session').send({ session_token: sessionToken }),
      request(legacyApp).post('/api/chat-widget/public/end-session').send({ session_token: sessionToken }),
    ]);
    expect(replay[0].status).toBe(404);
    expect(replay[0].body).toEqual(replay[1].body);
    agent.disconnect();
    visitor.disconnect();
  });
});
