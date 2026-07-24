import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Conversations GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let ownerId: number;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let contactId: number;
  let secondContactId: number;
  let outsiderContactId: number;
  let ownerToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_DATABASE_URL is required for conversations integration tests',
      );
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Inbox Owner', 'email', true),
              ($2, 'Inbox Member', 'email', true),
              ($3, 'Inbox Outsider', 'email', true)
       RETURNING id`,
      [
        `inbox-owner-${suffix}@test.itemize`,
        `inbox-member-${suffix}@test.itemize`,
        `inbox-outsider-${suffix}@test.itemize`,
      ],
    );
    [ownerId, memberId, outsiderId] = users.rows.map((row) => Number(row.id));

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Inbox Workspace', $1), ('Outside Workspace', $2)
       RETURNING id`,
      [`inbox-${suffix}`, `inbox-outside-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES
         ($1, $3, 'owner', NOW()),
         ($1, $4, 'member', NOW()),
         ($2, $5, 'owner', NOW())`,
      [
        organizationId,
        outsiderOrganizationId,
        ownerId,
        memberId,
        outsiderId,
      ],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE
         WHEN id = $1 THEN $2
         WHEN id = $3 THEN $4
         ELSE default_organization_id
       END
       WHERE id = ANY($5::int[])`,
      [
        ownerId,
        organizationId,
        outsiderId,
        outsiderOrganizationId,
        [ownerId, outsiderId],
      ],
    );

    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, created_by
       ) VALUES
         ($1, 'Ada', 'Lovelace', $3, $5),
         ($1, 'Grace', 'Hopper', $4, $5),
         ($2, 'Outside', 'Contact', $6, $7)
       RETURNING id`,
      [
        organizationId,
        outsiderOrganizationId,
        `ada-${suffix}@test.itemize`,
        `grace-${suffix}@test.itemize`,
        ownerId,
        `outside-${suffix}@test.itemize`,
        outsiderId,
      ],
    );
    [contactId, secondContactId, outsiderContactId] = contacts.rows.map((row) =>
      Number(row.id),
    );

    ownerToken = await jwt.signAsync(
      { id: ownerId },
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
    if (pool && organizationId) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId],
      ]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [ownerId, memberId, outsiderId],
      ]);
    }
    if (app) await app.close();
  });

  const query = (
    document: string,
    variables: Record<string, unknown> = {},
    selectedOrganizationId = organizationId,
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${ownerToken}`)
      .set('x-organization-id', String(selectedOrganizationId))
      .send({ query: document, variables });

  const mutation = (
    document: string,
    variables: Record<string, unknown> = {},
    selectedOrganizationId = organizationId,
  ) => {
    const csrf = 'conversation-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${ownerToken}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(selectedOrganizationId))
      .send({ query: document, variables });
  };

  const conversationFields = `
    id organizationId contactId assignedTo assignedToName status snoozedUntil
    channel subject lastMessageAt lastMessagePreview unreadCount
    contactFirstName contactLastName contactEmail contactPhone createdAt updatedAt`;

  it('creates, lists, reads, updates, assigns, sends, and marks read', async () => {
    const created = await mutation(
      `mutation Create($input: CreateConversationInput!) {
        createConversation(input: $input) { ${conversationFields} }
      }`,
      {
        input: {
          contactId,
          subject: 'Project kickoff',
          initialMessage: 'Hello Ada',
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createConversation).toMatchObject({
      organizationId,
      contactId,
      assignedTo: ownerId,
      contactFirstName: 'Ada',
      subject: 'Project kickoff',
      status: 'open',
      lastMessagePreview: 'Hello Ada',
    });
    const conversationId = created.body.data.createConversation.id as number;

    const listed = await query(
      `query List($contactId: Int!) {
        conversations(contactId: $contactId, page: 1, limit: 10) {
          conversations { ${conversationFields} }
          page limit total totalPages
        }
      }`,
      { contactId },
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.conversations).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(listed.body.data.conversations.conversations[0].id).toBe(
      conversationId,
    );

    const assigned = await mutation(
      `mutation Assign($id: Int!, $assignedTo: Int) {
        assignConversation(id: $id, assignedTo: $assignedTo) {
          id assignedTo assignedToName
        }
      }`,
      { id: conversationId, assignedTo: memberId },
    ).expect(200);
    expect(assigned.body.data.assignConversation).toMatchObject({
      id: conversationId,
      assignedTo: memberId,
      assignedToName: 'Inbox Member',
    });

    const sent = await mutation(
      `mutation Send($id: Int!, $input: SendConversationMessageInput!) {
        sendConversationMessage(conversationId: $id, input: $input) {
          id conversationId organizationId senderType senderUserId
          channel content contentHtml metadata isRead createdAt
        }
      }`,
      {
        id: conversationId,
        input: {
          content: '  Follow up  ',
          contentHtml: '<p>Follow up</p>',
          metadata: { source: 'integration' },
        },
      },
    ).expect(200);
    expect(sent.body.errors).toBeUndefined();
    expect(sent.body.data.sendConversationMessage).toMatchObject({
      conversationId,
      organizationId,
      senderType: 'user',
      senderUserId: ownerId,
      content: 'Follow up',
      metadata: { source: 'integration' },
    });

    await pool.query(
      'UPDATE conversations SET unread_count = 2 WHERE id = $1',
      [conversationId],
    );
    await pool.query(
      'UPDATE messages SET is_read = FALSE WHERE conversation_id = $1',
      [conversationId],
    );
    const marked = await mutation(
      `mutation Read($id: Int!) {
        markConversationRead(id: $id) { id unreadCount }
      }`,
      { id: conversationId },
    ).expect(200);
    expect(marked.body.data.markConversationRead).toEqual({
      id: conversationId,
      unreadCount: 0,
    });

    const closed = await mutation(
      `mutation Update($id: Int!, $input: UpdateConversationInput!) {
        updateConversation(id: $id, input: $input) { id status snoozedUntil }
      }`,
      { id: conversationId, input: { status: 'closed' } },
    ).expect(200);
    expect(closed.body.data.updateConversation).toEqual({
      id: conversationId,
      status: 'closed',
      snoozedUntil: null,
    });

    const detail = await query(
      `query Detail($id: Int!) {
        conversation(id: $id) {
          ${conversationFields}
          messages { id content isRead senderUserName }
        }
      }`,
      { id: conversationId },
    ).expect(200);
    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.conversation.messages).toHaveLength(2);
    expect(
      detail.body.data.conversation.messages.every(
        (message: { isRead: boolean }) => message.isRead,
      ),
    ).toBe(true);
  });

  it('serializes concurrent creation into one open conversation', async () => {
    const operation = `mutation Create($input: CreateConversationInput!) {
      createConversation(input: $input) { id contactId status }
    }`;
    const [first, second] = await Promise.all([
      mutation(operation, {
        input: { contactId: secondContactId, initialMessage: 'First' },
      }),
      mutation(operation, {
        input: { contactId: secondContactId, initialMessage: 'Second' },
      }),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.createConversation.id).toBe(
      second.body.data.createConversation.id,
    );
    const count = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM conversations
       WHERE organization_id = $1 AND contact_id = $2 AND status = 'open'`,
      [organizationId, secondContactId],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it('rejects cross-tenant contacts and non-member assignees', async () => {
    const contact = await mutation(
      `mutation Create($input: CreateConversationInput!) {
        createConversation(input: $input) { id }
      }`,
      { input: { contactId: outsiderContactId } },
    ).expect(200);
    expect(contact.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const own = await mutation(
      `mutation Create($input: CreateConversationInput!) {
        createConversation(input: $input) { id }
      }`,
      { input: { contactId } },
    ).expect(200);
    const assignment = await mutation(
      `mutation Assign($id: Int!, $assignedTo: Int) {
        assignConversation(id: $id, assignedTo: $assignedTo) { id }
      }`,
      { id: own.body.data.createConversation.id, assignedTo: outsiderId },
    ).expect(200);
    expect(assignment.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
    });
  });

  it('does not mark messages from a foreign conversation as read', async () => {
    const foreignConversation = await pool.query<{ id: number }>(
      `INSERT INTO conversations (
         organization_id, contact_id, status, unread_count
       ) VALUES ($1, $2, 'open', 1)
       RETURNING id`,
      [outsiderOrganizationId, outsiderContactId],
    );
    const foreignId = Number(foreignConversation.rows[0].id);
    const foreignMessage = await pool.query<{ id: number }>(
      `INSERT INTO messages (
         conversation_id, organization_id, sender_type, sender_contact_id,
         channel, content, is_read
       ) VALUES ($1, $2, 'contact', $3, 'internal', 'private', false)
       RETURNING id`,
      [foreignId, outsiderOrganizationId, outsiderContactId],
    );

    const denied = await mutation(
      `mutation Read($id: Int!) {
        markConversationRead(id: $id) { id }
      }`,
      { id: foreignId },
    ).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const unchanged = await pool.query<{ is_read: boolean }>(
      'SELECT is_read FROM messages WHERE id = $1',
      [foreignMessage.rows[0].id],
    );
    expect(unchanged.rows[0].is_read).toBe(false);
  });
});
