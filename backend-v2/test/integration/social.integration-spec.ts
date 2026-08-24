import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import {
  SOCIAL_MESSAGE_PROVIDER,
  SocialMessageProvider,
} from '../../src/social/social-message.provider';
import { SocialService } from '../../src/social/social.service';

const {
  runSocialMessageDeliveryMigration,
} = require('../../../db/src/db_social_delivery_migrations');

describe('Authenticated Social GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let service: SocialService;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let channelId: number;
  let conversationId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();
  const provider: jest.Mocked<SocialMessageProvider> = { send: jest.fn() };

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for social tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.SOCIAL_MESSAGE_DELIVERY_SCHEDULER_ENABLED = 'false';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });
    await runSocialMessageDeliveryMigration(pool);

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Social Member', 'email', true),
              ($2, 'Social Outsider', 'email', true)
       RETURNING id`,
      [
        `social-member-${suffix}@test.itemize`,
        `social-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Social Primary', $1), ('Social Other', $2)
       RETURNING id`,
      [`social-primary-${suffix}`, `social-other-${suffix}`],
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
    const channels = await pool.query<{ id: number }>(
      `INSERT INTO social_channels (
         organization_id, channel_type, external_id, name, page_id,
         page_access_token, user_access_token, is_connected, created_by
       ) VALUES
         ($1,'facebook',$3,'Primary page','page-primary','page-secret','user-secret',TRUE,$5),
         ($2,'facebook',$4,'Foreign page','page-foreign','foreign-secret','foreign-user',TRUE,$6)
       RETURNING id`,
      [
        organizationId,
        outsiderOrganizationId,
        `primary-${suffix}`,
        `foreign-${suffix}`,
        memberId,
        outsiderId,
      ],
    );
    channelId = Number(channels.rows[0].id);
    const conversations = await pool.query<{ id: number }>(
      `INSERT INTO social_conversations (
         organization_id, channel_id, participant_id, participant_name,
         unread_count, message_count, last_message_text, last_message_at
       ) VALUES
         ($1,$3,'participant-primary','Ada',2,1,'Hello',NOW()),
         ($2,$4,'participant-foreign','Mallory',1,0,'Private',NOW())
       RETURNING id`,
      [
        organizationId,
        outsiderOrganizationId,
        channelId,
        Number(channels.rows[1].id),
      ],
    );
    conversationId = Number(conversations.rows[0].id);
    await pool.query(
      `INSERT INTO social_messages (
         organization_id, conversation_id, channel_id, external_message_id,
         message_type, text_content, direction, status, message_timestamp
       ) VALUES ($1,$2,$3,'incoming-1','text','Hello','inbound','delivered',NOW())`,
      [organizationId, conversationId, channelId],
    );

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
      .overrideProvider(SOCIAL_MESSAGE_PROVIDER)
      .useValue(provider)
      .compile();
    service = moduleRef.get(SocialService);
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
    const csrfToken = 'social-csrf';
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

  it('lists only tenant-owned channels and never exposes credential fields', async () => {
    const result = await graphql(
      memberToken,
      organizationId,
      `query {
        socialChannels {
          id organizationId channelType name pageId isConnected createdByName
        }
        socialConversations {
          conversations { id participantName channelName unreadCount }
          page limit total totalPages
        }
      }`,
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.socialChannels).toEqual([
      expect.objectContaining({
        id: channelId,
        organizationId,
        channelType: 'facebook',
        name: 'Primary page',
      }),
    ]);
    expect(JSON.stringify(result.body.data)).not.toContain('page-secret');
    expect(result.body.data.socialConversations).toMatchObject({
      conversations: [
        expect.objectContaining({ id: conversationId, participantName: 'Ada' }),
      ],
      total: 1,
    });

    const credentialProbe = await graphql(
      memberToken,
      organizationId,
      'query { socialChannels { pageAccessToken userAccessToken } }',
    ).expect(400);
    expect(credentialProbe.body.errors[0].message).toContain('Cannot query field');
  });

  it('uses an explicit CSRF-protected open mutation and conceals foreign tenants', async () => {
    const withoutCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation { openSocialConversation(conversationId: ${conversationId}) {
        id unreadCount
      } }`,
    ).expect(200);
    expect(withoutCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const opened = await graphql(
      memberToken,
      organizationId,
      `mutation { openSocialConversation(conversationId: ${conversationId}) {
        id unreadCount messages { id textContent direction }
      } }`,
      {},
      true,
    ).expect(200);
    expect(opened.body.errors).toBeUndefined();
    expect(opened.body.data.openSocialConversation).toMatchObject({
      id: conversationId,
      unreadCount: 0,
      messages: [expect.objectContaining({ textContent: 'Hello' })],
    });
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query { socialConversation(conversationId: ${conversationId}) { id } }`,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('validates tenant references while preserving omitted update fields', async () => {
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, created_by)
       VALUES ($1,'Owned',$3), ($2,'Foreign',$4) RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    const foreignContactId = Number(contacts.rows[1].id);
    const rejected = await graphql(
      memberToken,
      organizationId,
      `mutation Update($input: UpdateSocialConversationInput!) {
        updateSocialConversation(
          conversationId: ${conversationId}
          input: $input
        ) { id }
      }`,
      { input: { contactId: foreignContactId } },
      true,
    ).expect(200);
    expect(rejected.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_CONTACT',
    });

    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation Update($input: UpdateSocialConversationInput!) {
        updateSocialConversation(
          conversationId: ${conversationId}
          input: $input
        ) { id status assignedTo tags }
      }`,
      { input: { status: 'pending', tags: ['priority'] } },
      true,
    ).expect(200);
    expect(updated.body.data.updateSocialConversation).toEqual({
      id: conversationId,
      status: 'pending',
      assignedTo: null,
      tags: ['priority'],
    });
  });

  it('queues idempotently and records provider acceptance exactly once', async () => {
    provider.send.mockResolvedValue({
      kind: 'accepted',
      providerId: `meta-message-${conversationId}`,
    });
    const document = `mutation Send($input: SendSocialMessageInput!) {
      sendSocialMessage(conversationId: ${conversationId}, input: $input) {
        id status replayed message { id status textContent }
      }
    }`;
    const first = await graphql(
      memberToken,
      organizationId,
      document,
      { input: { text: ' Reply ', idempotencyKey: 'social-request-1' } },
      true,
    ).expect(200);
    const replay = await graphql(
      memberToken,
      organizationId,
      document,
      { input: { text: 'Reply', idempotencyKey: 'social-request-1' } },
      true,
    ).expect(200);
    expect(first.body.data.sendSocialMessage).toMatchObject({
      status: 'queued',
      replayed: false,
      message: { status: 'pending', textContent: 'Reply' },
    });
    expect(replay.body.data.sendSocialMessage).toMatchObject({
      id: first.body.data.sendSocialMessage.id,
      replayed: true,
      message: { id: first.body.data.sendSocialMessage.message.id },
    });
    await expect(service.runDue()).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      rejected: 0,
      reconciliationRequired: 0,
    });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'page-secret',
        participantId: 'participant-primary',
        text: 'Reply',
      }),
    );
    const persisted = await pool.query(
      `SELECT message.status, message.external_message_id,
              conversation.message_count, conversation.last_message_text
       FROM social_messages message
       JOIN social_conversations conversation ON conversation.id=message.conversation_id
       WHERE message.id=$1`,
      [first.body.data.sendSocialMessage.message.id],
    );
    expect(persisted.rows[0]).toMatchObject({
      status: 'sent',
      external_message_id: `meta-message-${conversationId}`,
      message_count: 2,
      last_message_text: 'Reply',
    });
  });

  it('uses the requested analytics window and rejects unbounded periods', async () => {
    const result = await graphql(
      memberToken,
      organizationId,
      `query {
        socialAnalytics(period: 7) {
          period channels { channelType messageCount inboundCount outboundCount }
          messagesOverTime { inbound outbound }
          statusDistribution { status count }
        }
      }`,
    ).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.socialAnalytics).toMatchObject({
      period: 7,
      channels: [
        {
          channelType: 'facebook',
          messageCount: 2,
          inboundCount: 1,
          outboundCount: 1,
        },
      ],
    });
    const invalid = await graphql(
      memberToken,
      organizationId,
      'query { socialAnalytics(period: 1000) { period } }',
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_SOCIAL_ANALYTICS_PERIOD',
    });
  });
});
