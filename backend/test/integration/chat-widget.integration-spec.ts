import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import { runRealtimeOutboxDelivery } from '../../src/realtime-host/realtime-outbox-delivery';
import type { RealtimeBroadcast } from '../../src/realtime-host/realtime-host';

const {
  runChatWidgetGraphqlMigration,
} = require('../../../db/src/db_chat_widget_graphql_migrations');

describe('Authenticated Chat Widget GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let widgetId: number;
  let sessionId: number;
  let foreignSessionId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for chat widget tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://itemize.cloud';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });
    await runChatWidgetGraphqlMigration(pool);

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Chat Member', 'email', true),
              ($2, 'Chat Outsider', 'email', true)
       RETURNING id`,
      [
        `chat-member-${suffix}@test.itemize`,
        `chat-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Chat Primary', $1), ('Chat Other', $2)
       RETURNING id`,
      [`chat-primary-${suffix}`, `chat-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1,$3,'owner',NOW()), ($2,$4,'owner',NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id=CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id=ANY($5::int[])`,
      [
        organizationId,
        outsiderOrganizationId,
        memberId,
        outsiderId,
        [memberId, outsiderId],
      ],
    );
    const foreignWidget = await pool.query<{ id: number }>(
      `INSERT INTO chat_widgets (organization_id, widget_key, name)
       VALUES ($1,$2,'Foreign widget') RETURNING id`,
      [outsiderOrganizationId, `cw_${'b'.repeat(32)}`],
    );
    const foreignSession = await pool.query<{ id: number }>(
      `INSERT INTO chat_sessions (
         organization_id, widget_id, session_token, visitor_name
       ) VALUES ($1,$2,$3,'Foreign Visitor') RETURNING id`,
      [
        outsiderOrganizationId,
        Number(foreignWidget.rows[0].id),
        `cs_${'c'.repeat(48)}`,
      ],
    );
    foreignSessionId = Number(foreignSession.rows[0].id);

    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
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
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const graphql = (
    token: string,
    orgId: number,
    query: string,
    variables: Record<string, unknown> = {},
    csrf = false,
  ) => {
    const csrfToken = 'chat-widget-csrf';
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        csrf
          ? `itemize_auth=${token}; csrf-token=${csrfToken}`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', csrfToken);
    return call.send({ query, variables });
  };

  it('creates one tenant widget with bounded configuration and safe embed code', async () => {
    const empty = await graphql(
      memberToken,
      organizationId,
      'query { chatWidget { id } }',
    ).expect(200);
    expect(empty.body).toEqual({ data: { chatWidget: null } });

    const mutation = `mutation Create($input: ChatWidgetConfigInput!) {
      createChatWidget(input: $input) {
        id organizationId widgetKey primaryColor isActive requireEmail
        allowedDomains
      }
    }`;
    const withoutCsrf = await graphql(
      memberToken,
      organizationId,
      mutation,
      { input: { name: 'Support' } },
    ).expect(200);
    expect(withoutCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const created = await graphql(
      memberToken,
      organizationId,
      mutation,
      {
        input: {
          name: 'Support',
          primaryColor: '#1a2b3c',
          isActive: false,
          requireEmail: false,
          allowedDomains: ['Example.COM'],
        },
      },
      true,
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createChatWidget).toMatchObject({
      organizationId,
      primaryColor: '#1A2B3C',
      isActive: false,
      requireEmail: false,
      allowedDomains: ['example.com'],
    });
    widgetId = created.body.data.createChatWidget.id;

    const duplicate = await graphql(
      memberToken,
      organizationId,
      mutation,
      { input: { name: 'Duplicate' } },
      true,
    ).expect(200);
    expect(duplicate.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'CHAT_WIDGET_ALREADY_EXISTS',
    });

    const embed = await graphql(
      memberToken,
      organizationId,
      `query {
        chatWidgetEmbedCode { widgetKey embedCode }
      }`,
    ).expect(200);
    expect(embed.body.data.chatWidgetEmbedCode.embedCode).toContain(
      'https://itemize.cloud/widget.js',
    );
    expect(embed.body.data.chatWidgetEmbedCode.embedCode).toContain(
      created.body.data.createChatWidget.widgetKey,
    );
  });

  it('validates tenant assignees and preserves explicit nullable updates', async () => {
    const invalid = await graphql(
      memberToken,
      organizationId,
      `mutation Update($input: ChatWidgetConfigInput!) {
        updateChatWidget(input: $input) { id }
      }`,
      { input: { defaultAssignedTo: outsiderId } },
      true,
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
    });

    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation Update($input: ChatWidgetConfigInput!) {
        updateChatWidget(input: $input) {
          id isActive defaultAssignedTo businessHours
        }
      }`,
      {
        input: {
          isActive: true,
          defaultAssignedTo: memberId,
          businessHours: {
            monday: { start: '09:00', end: '17:00' },
            sunday: null,
          },
        },
      },
      true,
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateChatWidget).toMatchObject({
      id: widgetId,
      isActive: true,
      defaultAssignedTo: memberId,
    });
  });

  it('lists and reads only tenant sessions without exposing bearer capabilities', async () => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO chat_sessions (
         organization_id, widget_id, session_token, visitor_name,
         visitor_email, custom_data
       ) VALUES ($1,$2,$3,'Ada Lovelace','ada@example.test','{"plan":"pro"}')
       RETURNING id`,
      [organizationId, widgetId, `cs_${'a'.repeat(48)}`],
    );
    sessionId = Number(inserted.rows[0].id);
    await pool.query(
      `INSERT INTO chat_messages (
         session_id, organization_id, sender_type, content
       ) VALUES ($1,$2,'visitor','Hello')`,
      [sessionId, organizationId],
    );
    const list = await graphql(
      memberToken,
      organizationId,
      `query {
        chatSessions(status: "active") {
          sessions { id visitorName unreadCount lastMessage widgetName }
          total
        }
        chatSession(sessionId: ${sessionId}) {
          id visitorEmail messages { senderType content }
        }
      }`,
    ).expect(200);
    expect(list.body.errors).toBeUndefined();
    expect(list.body.data.chatSessions).toMatchObject({
      total: 1,
      sessions: [
        expect.objectContaining({
          id: sessionId,
          visitorName: 'Ada Lovelace',
          unreadCount: 1,
          lastMessage: 'Hello',
        }),
      ],
    });
    expect(list.body.data.chatSession.messages).toEqual([
      expect.objectContaining({ senderType: 'visitor', content: 'Hello' }),
    ]);

    const capabilityProbe = await graphql(
      memberToken,
      organizationId,
      `query { chatSession(sessionId: ${sessionId}) { sessionToken } }`,
    ).expect(400);
    expect(capabilityProbe.body.errors[0].message).toContain('Cannot query field');

    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query { chatSession(sessionId: ${sessionId}) { id } }`,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(foreignSessionId).toBeGreaterThan(0);
  });

  it('persists agent replies idempotently with one durable realtime handoff', async () => {
    const document = `mutation Send($input: SendAgentChatMessageInput!) {
      sendAgentChatMessage(sessionId: ${sessionId}, input: $input) {
        replayed message { id senderType content agentName }
      }
    }`;
    const first = await graphql(
      memberToken,
      organizationId,
      document,
      { input: { content: ' Reply ', idempotencyKey: 'chat-message-1' } },
      true,
    ).expect(200);
    const replay = await graphql(
      memberToken,
      organizationId,
      document,
      { input: { content: 'Reply', idempotencyKey: 'chat-message-1' } },
      true,
    ).expect(200);
    expect(first.body.data.sendAgentChatMessage).toMatchObject({
      replayed: false,
      message: {
        senderType: 'agent',
        content: 'Reply',
        agentName: 'Chat Member',
      },
    });
    expect(replay.body.data.sendAgentChatMessage).toMatchObject({
      replayed: true,
      message: { id: first.body.data.sendAgentChatMessage.message.id },
    });
    const persisted = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM chat_messages
          WHERE organization_id=$1 AND session_id=$2 AND sender_type='agent') AS messages,
         (SELECT COUNT(*)::int FROM realtime_event_outbox
          WHERE aggregate_type='chat_session' AND aggregate_id=$2) AS events,
         (SELECT id FROM realtime_event_outbox
          WHERE aggregate_type='chat_session' AND aggregate_id=$2
          ORDER BY id DESC LIMIT 1) AS outbox_id`,
      [organizationId, sessionId],
    );
    expect(persisted.rows[0]).toMatchObject({ messages: 1, events: 1 });
    const chatMessage = jest.fn().mockResolvedValue(true);
    await expect(
      runRealtimeOutboxDelivery(pool, { chatMessage } as unknown as RealtimeBroadcast, {
        batchSize: 1,
        outboxId: Number(persisted.rows[0].outbox_id),
        workerId: 'chat-widget-contract',
      }),
    ).resolves.toMatchObject({ claimed: 1, sent: 1 });
    expect(chatMessage).toHaveBeenCalledWith(
      `cs_${'a'.repeat(48)}`,
      expect.objectContaining({
        id: first.body.data.sendAgentChatMessage.message.id,
        content: 'Reply',
      }),
      expect.any(String),
    );

    const conflict = await graphql(
      memberToken,
      organizationId,
      document,
      { input: { content: 'Different', idempotencyKey: 'chat-message-1' } },
      true,
    ).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('serializes conversion and copies the tenant transcript once', async () => {
    const mutation = `mutation {
      convertChatSession(sessionId: ${sessionId}) {
        success contactId conversationId
      }
    }`;
    const converted = await graphql(
      memberToken,
      organizationId,
      mutation,
      {},
      true,
    ).expect(200);
    expect(converted.body.errors).toBeUndefined();
    expect(converted.body.data.convertChatSession.success).toBe(true);
    const state = await pool.query(
      `SELECT session.status, session.contact_id, session.conversation_id,
              (SELECT COUNT(*)::int FROM messages
               WHERE organization_id=$1
                 AND conversation_id=session.conversation_id) AS copied
       FROM chat_sessions session
       WHERE session.organization_id=$1 AND session.id=$2`,
      [organizationId, sessionId],
    );
    expect(state.rows[0]).toMatchObject({
      status: 'converted',
      copied: 2,
    });
    const repeated = await graphql(
      memberToken,
      organizationId,
      mutation,
      {},
      true,
    ).expect(200);
    expect(repeated.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'CHAT_SESSION_ALREADY_CONVERTED',
    });
  });
});
