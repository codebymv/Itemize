import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { RealtimeOutboxService } from '../../src/realtime-outbox/realtime-outbox.service';
import { RealtimeHostService } from '../../src/realtime-host/realtime-host.service';
import { runRealtimeOutboxDelivery } from '../../src/realtime-host/realtime-outbox-delivery';

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

describe('NestJS realtime host retained Socket.IO contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let owner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let outsider: any;
  let baseUrl: string;
  let hostService: RealtimeHostService;
  let sharedNoteToken: string;
  let sharedNoteId: number;
  let chatSessionToken: string;
  const clients: ClientSocket[] = [];

  const connect = async (cookie?: string): Promise<ClientSocket> => {
    const socket = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: cookie ? { Cookie: cookie } : {},
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out connecting socket')),
        3000,
      );
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return socket;
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for realtime host tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.REALTIME_HOST_NESTJS_ENABLED = 'true';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `realtime-host-owner-${Date.now()}@test.itemize`,
      'Realtime Owner',
    );
    outsider = await dbHelper.seedUser(
      `realtime-host-outsider-${Date.now()}@test.itemize`,
      'Realtime Outsider',
    );

    sharedNoteToken = crypto.randomUUID();
    const note = await pool.query<{ id: number }>(
      `INSERT INTO notes (user_id, title, content, share_token, is_public, shared_at)
       VALUES ($1, 'Realtime host note', 'body', $2, TRUE, CURRENT_TIMESTAMP)
       RETURNING id`,
      [owner.user.id, sharedNoteToken],
    );
    sharedNoteId = Number(note.rows[0].id);

    const widget = await pool.query<{ id: number }>(
      `INSERT INTO chat_widgets (organization_id, name, widget_key)
       VALUES ($1, 'Host widget', $2)
       RETURNING id`,
      [owner.org.id, crypto.randomBytes(16).toString('hex')],
    );
    chatSessionToken = `cs_${crypto.randomBytes(24).toString('hex')}`;
    await pool.query(
      `INSERT INTO chat_sessions (organization_id, widget_id, session_token, status)
       VALUES ($1, $2, $3, 'active')`,
      [owner.org.id, widget.rows[0].id, chatSessionToken],
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
    hostService = app.get(RealtimeHostService);
    // Stop the polling worker: the specs drive delivery deterministically.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (hostService as any).worker?.stop();

    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 60000);

  afterAll(async () => {
    for (const socket of clients) socket.disconnect();
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

  it('admits public capability viewers and reports viewer counts', async () => {
    const client = await connect();
    const joined = once<{ noteTitle: string }>(client, 'joinedSharedNote');
    const counted = once<number>(client, 'viewerCount');
    client.emit('joinSharedNote', sharedNoteToken);
    expect(await joined).toEqual({ noteTitle: 'Realtime host note' });
    expect(await counted).toBe(1);

    const denied = once<{ code: string }>(client, 'realtimeError');
    client.emit('joinSharedNote', 'not-a-token');
    expect((await denied).code).toBe('INVALID_CAPABILITY');
    client.disconnect();
  });

  it('delivers a committed outbox event through this host with the retained shape', async () => {
    const client = await connect();
    const joined = once(client, 'joinedSharedNote');
    client.emit('joinSharedNote', sharedNoteToken);
    await joined;

    const occurredAt = new Date(Date.now() - 1000);
    const update = once<{ type: string; data: unknown; timestamp: string }>(
      client,
      'noteUpdated',
    );
    const outboxService = new RealtimeOutboxService();
    const queued = await outboxService.enqueue(
      pool as unknown as Parameters<RealtimeOutboxService['enqueue']>[0],
      {
      eventKey: `nest-host:${Date.now()}:${Math.random()}`,
      aggregateType: 'note',
      aggregateId: sharedNoteId,
      channel: 'shared_note',
      recipientKey: sharedNoteToken,
      eventName: 'noteUpdated',
      eventType: 'CONTENT_CHANGED',
      payload: { id: sharedNoteId, content: 'Nest host content' },
      occurredAt,
      },
    );

    const broadcast = hostService.broadcast();
    expect(broadcast).not.toBeNull();
    const summary = await runRealtimeOutboxDelivery(pool, broadcast!, {
      batchSize: 1,
      outboxId: Number(queued.event.id),
      workerId: 'nest-host-spec',
    });
    expect(summary).toMatchObject({ claimed: 1, sent: 1 });
    expect(await update).toEqual({
      type: 'CONTENT_CHANGED',
      data: { id: sharedNoteId, content: 'Nest host content' },
      timestamp: occurredAt.toISOString(),
    });
    client.disconnect();
  });

  it('enforces organization membership on authenticated room admission', async () => {
    const member = await connect(`itemize_auth=${owner.token}`);
    const joined = once<{ organizationId: number }>(member, 'joinedOrgChat');
    member.emit('joinOrgChat', { organizationId: owner.org.id });
    expect(await joined).toEqual({ organizationId: owner.org.id });

    const nonMember = await connect(`itemize_auth=${outsider.token}`);
    const rejected = once<{ code: string }>(nonMember, 'realtimeError');
    nonMember.emit('joinOrgChat', { organizationId: owner.org.id });
    expect((await rejected).code).toBe('FORBIDDEN');

    const anonymous = await connect();
    const unauthenticated = once<{ code: string }>(anonymous, 'realtimeError');
    anonymous.emit('joinOrgChat', { organizationId: owner.org.id });
    expect((await unauthenticated).code).toBe('UNAUTHENTICATED');
  });

  it('delivers user notifications only through an authenticated user room', async () => {
    const member = await connect(`itemize_auth=${owner.token}`);
    const joined = once<{ userId: number }>(member, 'joinedUserNotifications');
    member.emit('joinUserNotifications');
    expect(await joined).toEqual({ userId: Number(owner.user.id) });

    const anonymous = await connect();
    const rejected = once<{ code: string }>(anonymous, 'realtimeError');
    anonymous.emit('joinUserNotifications');
    expect((await rejected).code).toBe('UNAUTHENTICATED');

    const occurredAt = new Date(Date.now() - 1000);
    const notification = {
      organizationId: Number(owner.org.id),
      notification: {
        id: '42',
        eventType: 'estimate.accepted',
        title: 'Estimate accepted',
      },
    };
    const delivered = once<{
      organizationId: number;
      notification: { id: string; eventType: string; title: string };
      timestamp: string;
    }>(member, 'notificationCreated');
    const outboxService = new RealtimeOutboxService();
    const queued = await outboxService.enqueue(
      pool as unknown as Parameters<RealtimeOutboxService['enqueue']>[0],
      {
        eventKey: `notification-host:${Date.now()}:${Math.random()}`,
        aggregateType: 'notification',
        aggregateId: 42,
        channel: 'user_notification',
        recipientKey: String(owner.user.id),
        eventName: 'notificationCreated',
        eventType: 'estimate.accepted',
        payload: notification,
        occurredAt,
      },
    );
    const summary = await runRealtimeOutboxDelivery(
      pool,
      hostService.broadcast()!,
      {
        batchSize: 1,
        outboxId: Number(queued.event.id),
        workerId: 'notification-host-spec',
      },
    );
    expect(summary).toMatchObject({ claimed: 1, sent: 1 });
    expect(await delivered).toEqual({
      ...notification,
      timestamp: occurredAt.toISOString(),
    });
  });

  it('routes chat session typing in both directions with authorization', async () => {
    const visitor = await connect();
    const joinedSession = once<{ sessionId: number }>(visitor, 'joinedChatSession');
    visitor.emit('joinChatSession', chatSessionToken);
    await joinedSession;

    const agent = await connect(`itemize_auth=${owner.token}`);
    const joinedOrg = once(agent, 'joinedOrgChat');
    agent.emit('joinOrgChat', { organizationId: owner.org.id });
    await joinedOrg;

    const visitorSeen = once<{ isTyping: boolean }>(agent, 'visitorTyping');
    visitor.emit('visitorTyping', { sessionToken: chatSessionToken, isTyping: true });
    expect((await visitorSeen).isTyping).toBe(true);

    const agentSeen = once<{ isTyping: boolean }>(visitor, 'agentTyping');
    agent.emit('agentTyping', { sessionToken: chatSessionToken, isTyping: true });
    expect((await agentSeen).isTyping).toBe(true);

    const foreignAgent = await connect(`itemize_auth=${outsider.token}`);
    const forbidden = once<{ code: string }>(foreignAgent, 'realtimeError');
    foreignAgent.emit('agentTyping', { sessionToken: chatSessionToken, isTyping: true });
    expect((await forbidden).code).toBe('FORBIDDEN');
  });

  it('revokes shared capabilities and evicts every viewer', async () => {
    const revokedToken = crypto.randomUUID();
    await pool.query(
      `INSERT INTO notes (user_id, title, content, share_token, is_public, shared_at)
       VALUES ($1, 'Revocable note', 'body', $2, TRUE, CURRENT_TIMESTAMP)`,
      [owner.user.id, revokedToken],
    );
    const viewer = await connect();
    const joined = once(viewer, 'joinedSharedNote');
    viewer.emit('joinSharedNote', revokedToken);
    await joined;

    const revoked = once<{ kind: string; reason: string }>(
      viewer,
      'sharedContentRevoked',
    );
    const broadcast = hostService.broadcast();
    await broadcast!.revokeShared('note', revokedToken);
    expect(await revoked).toMatchObject({
      kind: 'note',
      reason: 'sharing_revoked',
    });

    let leaked = false;
    viewer.once('noteUpdated', () => {
      leaked = true;
    });
    broadcast!.noteUpdate(revokedToken, 'CONTENT_CHANGED', { after: true });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);
    viewer.disconnect();
  });
});
