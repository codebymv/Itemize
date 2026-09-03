import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

type Fixture = {
  id: number;
  firstName: string;
  status: string;
  tags: string[];
};

describe('Contacts GraphQL PostgreSQL contract', () => {
  let graphqlApp: NestExpressApplication;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let fixtures: Fixture[];
  let corruptContactId: number;
  let mutationContactId: number;
  let foreignContactId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for contact integration tests');
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
       VALUES ($1, 'Contact Member', 'email', true),
              ($2, 'Contact Outsider', 'email', true)
       RETURNING id`,
      [
        `contact-graphql-member-${suffix}@test.itemize`,
        `contact-graphql-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((user) => user.id);

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Contact GraphQL', $1), ('Contact GraphQL Outsider', $2)
       RETURNING id`,
      [`contact-graphql-${suffix}`, `contact-graphql-outsider-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map(
      (organization) => organization.id,
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'member', NOW()), ($3, $4, 'owner', NOW())`,
      [organizationId, memberId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $1::int THEN $2::int
         WHEN $3::int THEN $4::int
       END
       WHERE id = ANY($5::int[])`,
      [memberId, organizationId, outsiderId, outsiderOrganizationId, [memberId, outsiderId]],
    );

    const contacts = await pool.query<{
      id: number;
      first_name: string;
      status: string;
      tags: string[];
    }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, phone, company,
         source, status, tags, assigned_to, created_by, created_at, updated_at
       ) VALUES
         ($1, 'Alpha', 'Able', 'alpha@test.itemize', '5551000001', 'North',
          'manual', 'active', ARRAY['vip'], $2, $2, NOW() - INTERVAL '3 minutes', NOW()),
         ($1, 'Beta', 'Baker', 'beta@test.itemize', '5551000002', 'South',
          'import', 'inactive', ARRAY['vip', 'newsletter'], $2, $2, NOW() - INTERVAL '2 minutes', NOW()),
         ($1, 'Gamma', 'Gale', 'gamma@test.itemize', '5551000003', 'East',
          'api', 'active', ARRAY['other'], NULL, $2, NOW() - INTERVAL '1 minute', NOW()),
         ($3, 'Foreign', 'Contact', 'foreign@test.itemize', NULL, 'West',
          'manual', 'active', ARRAY['vip'], $4, $4, NOW(), NOW())
       RETURNING id, first_name, status, tags`,
      [organizationId, memberId, outsiderOrganizationId, outsiderId],
    );
    fixtures = contacts.rows.slice(0, 3).map((contact) => ({
      id: contact.id,
      firstName: contact.first_name,
      status: contact.status,
      tags: contact.tags,
    }));
    foreignContactId = contacts.rows[3].id;
    const corruptContact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, email, source, status, tags,
         assigned_to, created_by, created_at, updated_at
       ) VALUES (
         $1, 'Corrupt Reference', 'corrupt-reference@test.itemize', 'manual',
         'archived', ARRAY[]::text[], $2, $2,
         NOW() - INTERVAL '4 minutes', NOW()
       ) RETURNING id`,
      [organizationId, outsiderId],
    );
    corruptContactId = corruptContact.rows[0].id;

    memberToken = await jwt.signAsync(
      { id: memberId, name: 'Contact Member' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Contact Outsider' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    graphqlApp = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(graphqlApp);
    await graphqlApp.init();

  });

  afterAll(async () => {
    if (pool) {
      if (organizationId || outsiderOrganizationId) {
        await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
          [organizationId, outsiderOrganizationId].filter(Boolean),
        ]);
      }
      if (memberId || outsiderId) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
          [memberId, outsiderId].filter(Boolean),
        ]);
      }
    }
    if (graphqlApp) await graphqlApp.close();
  });

  const graphql = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query, variables });

  const graphqlMutation = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'contact-mutation-csrf';
    return request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query, variables });
  };

  it('returns deterministic list membership, order, and page counts', async () => {
    const target = await graphql(
      memberToken,
      organizationId,
      `query Contacts($page: PageInput, $sort: ContactSortInput) {
        contacts(page: $page, sort: $sort) {
          nodes { id firstName status tags organizationId }
          pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
        }
      }`,
      {
        page: { page: 1, pageSize: 2 },
        sort: { field: 'CREATED_AT', direction: 'DESC' },
      },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.contacts.pageInfo).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(target.body.data.contacts.nodes).toEqual([
      expect.objectContaining({ firstName: 'Gamma', organizationId }),
      expect.objectContaining({ firstName: 'Beta', organizationId }),
    ]);
  });

  it('applies search, status, tag, and assignee filtering', async () => {
    const target = await graphql(
      memberToken,
      organizationId,
      `query Contacts($filter: ContactFilterInput) {
        contacts(filter: $filter) { nodes { id firstName status tags assignedToId } }
      }`,
      {
        filter: {
          search: 'alpha',
          status: 'ACTIVE',
          tags: ['vip'],
          assignedToId: memberId,
        },
      },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.contacts.nodes).toEqual([
      {
        id: fixtures[0].id,
        firstName: 'Alpha',
        status: 'ACTIVE',
        tags: ['vip'],
        assignedToId: memberId,
      },
    ]);
  });

  it('returns detail data for an organization-owned contact', async () => {
    const contactId = fixtures[0].id;
    const target = await graphql(
      memberToken,
      organizationId,
      `query Contact($id: Int!) {
        contact(id: $id) {
          id organizationId firstName lastName email phone company jobTitle
          address source status customFields tags assignedToId assignedToName
          assignedToEmail createdById createdByName createdAt updatedAt
        }
      }`,
      { id: contactId },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.contact).toMatchObject({
      id: contactId,
      organizationId,
      firstName: 'Alpha',
      lastName: 'Able',
      email: 'alpha@test.itemize',
      status: 'ACTIVE',
      tags: ['vip'],
      assignedToId: memberId,
      assignedToName: 'Contact Member',
      createdById: memberId,
      createdByName: 'Contact Member',
    });
  });

  it('preserves cross-tenant resource privacy as NOT_FOUND', async () => {
    const contactId = fixtures[0].id;
    const target = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Contact($id: Int!) { contact(id: $id) { id } }',
      { id: contactId },
    ).expect(200);

    expect(target.body.data.contact).toBeNull();
    expect(target.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('does not project user data through corrupt cross-tenant references', async () => {
    const target = await graphql(
      memberToken,
      organizationId,
      `query Contact($id: Int!) {
        contact(id: $id) {
          id assignedToId assignedToName assignedToEmail createdById createdByName
        }
      }`,
      { id: corruptContactId },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.contact).toEqual({
      id: corruptContactId,
      assignedToId: null,
      assignedToName: null,
      assignedToEmail: null,
      createdById: null,
      createdByName: null,
    });
  });

  it('rejects contact mutations without matching CSRF proof', async () => {
    const email = `csrf-rejected-${Date.now()}@test.itemize`;
    const target = await graphql(
      memberToken,
      organizationId,
      `mutation CreateContact($input: CreateContactInput!, $idempotencyKey: String!) {
        createContact(input: $input, idempotencyKey: $idempotencyKey) { id }
      }`,
      { input: { email }, idempotencyKey: `contact-csrf-${Date.now()}` },
    ).expect(200);

    expect(target.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'CSRF_COOKIE_MISSING',
    });
    const persisted = await pool.query(
      'SELECT id FROM contacts WHERE organization_id = $1 AND email = $2',
      [organizationId, email],
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('serializes concurrent GraphQL creates at the organization contact limit', async () => {
    const count = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1',
      [organizationId],
    );
    await pool.query(
      'UPDATE organizations SET contacts_limit = $1 WHERE id = $2',
      [count.rows[0].total + 1, organizationId],
    );
    const mutation = `mutation CreateContact($input: CreateContactInput!, $idempotencyKey: String!) {
      createContact(input: $input, idempotencyKey: $idempotencyKey) { id email }
    }`;
    const suffix = `${Date.now()}-${process.pid}`;
    const responses = await Promise.all([
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { email: `limit-first-${suffix}@test.itemize` },
        idempotencyKey: `contact-limit-first-${suffix}`,
      }),
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { email: `limit-second-${suffix}@test.itemize` },
        idempotencyKey: `contact-limit-second-${suffix}`,
      }),
    ]);
    const createdIds = responses
      .map((response) => response.body.data?.createContact?.id as number | undefined)
      .filter((id): id is number => Number.isSafeInteger(id));
    await pool.query('UPDATE organizations SET contacts_limit = NULL WHERE id = $1', [organizationId]);
    if (createdIds.length > 0) {
      await pool.query('DELETE FROM contacts WHERE organization_id = $1 AND id = ANY($2::int[])', [
        organizationId,
        createdIds,
      ]);
    }

    expect(createdIds).toHaveLength(1);
    const rejected = responses.find((response) => response.body.errors?.length);
    expect(rejected?.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
      current: count.rows[0].total + 1,
      limit: count.rows[0].total + 1,
    });
  });

  it('creates a contact atomically with tenant assignment, workflow, and activity evidence', async () => {
    const target = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation CreateContact($input: CreateContactInput!, $idempotencyKey: String!) {
        createContact(input: $input, idempotencyKey: $idempotencyKey) {
          id organizationId firstName email source status tags assignedToId createdById
        }
      }`,
      {
        input: {
          firstName: '  Mutation  ',
          email: 'MUTATION@TEST.ITEMIZE',
          source: 'API',
          tags: ['graphql', 'graphql'],
          assignedToId: memberId,
        },
        idempotencyKey: `contact-atomic-${Date.now()}-${process.pid}`,
      },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.createContact).toMatchObject({
      organizationId,
      firstName: 'Mutation',
      email: 'mutation@test.itemize',
      source: 'API',
      status: 'ACTIVE',
      tags: ['graphql'],
      assignedToId: memberId,
      createdById: memberId,
    });
    mutationContactId = target.body.data.createContact.id;

    const evidence = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM workflow_triggers
          WHERE organization_id = $1 AND contact_id = $2
            AND trigger_type = 'contact_added' AND status = 'queued') AS triggers,
         (SELECT COUNT(*)::int FROM contact_activities
          WHERE contact_id = $2 AND type = 'system' AND title = 'Contact Created') AS activities`,
      [organizationId, mutationContactId],
    );
    expect(evidence.rows[0]).toEqual({ triggers: 1, activities: 1 });
  });

  it('durably replays contact creation and fails closed after conflicting reuse or deletion', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const email = `contact-replay-${suffix}@test.itemize`;
    const idempotencyKey = `contact-replay-${suffix}`;
    const document = `mutation CreateContact(
      $input: CreateContactInput!,
      $idempotencyKey: String!
    ) {
      createContact(input: $input, idempotencyKey: $idempotencyKey) { id email }
    }`;
    const variables = {
      input: { firstName: 'Replay', email },
      idempotencyKey,
    };

    const first = await graphqlMutation(
      memberToken, organizationId, document, variables,
    ).expect(200);
    const replay = await graphqlMutation(
      memberToken, organizationId, document, variables,
    ).expect(200);
    expect(first.body.errors).toBeUndefined();
    expect(replay.body.errors).toBeUndefined();
    expect(replay.body.data.createContact.id).toBe(first.body.data.createContact.id);
    const contactId = Number(first.body.data.createContact.id);

    const evidence = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM contacts
          WHERE organization_id = $1 AND email = $2) AS contacts,
         (SELECT COUNT(*)::int FROM workflow_triggers
          WHERE organization_id = $1 AND contact_id = $3
            AND trigger_type = 'contact_added') AS triggers,
         (SELECT COUNT(*)::int FROM contact_activities
          WHERE contact_id = $3 AND title = 'Contact Created') AS activities`,
      [organizationId, email, contactId],
    );
    expect(evidence.rows[0]).toEqual({ contacts: 1, triggers: 1, activities: 1 });

    const conflict = await graphqlMutation(
      memberToken,
      organizationId,
      document,
      { ...variables, input: { ...variables.input, firstName: 'Changed' } },
    ).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'IDEMPOTENCY_KEY_REUSED',
    });

    await pool.query(
      'DELETE FROM contacts WHERE organization_id = $1 AND id = $2',
      [organizationId, contactId],
    );
    const unavailable = await graphqlMutation(
      memberToken, organizationId, document, variables,
    ).expect(200);
    expect(unavailable.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'IDEMPOTENCY_RESULT_UNAVAILABLE',
    });
  });

  it('preserves duplicate contacts while canonicalizing GraphQL email writes', async () => {
    const email = `graphql-duplicate-${Date.now()}-${process.pid}@test.itemize`;
    const mutation = `mutation CreateContact($input: CreateContactInput!, $idempotencyKey: String!) {
      createContact(input: $input, idempotencyKey: $idempotencyKey) { id email }
    }`;
    const [first, duplicate] = await Promise.all([
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { firstName: 'Duplicate First', email: `  ${email.toUpperCase()}  ` },
        idempotencyKey: `contact-duplicate-first-${Date.now()}-${process.pid}`,
      }),
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { firstName: 'Duplicate Second', email },
        idempotencyKey: `contact-duplicate-second-${Date.now()}-${process.pid}`,
      }),
    ]);

    expect(first.body.errors).toBeUndefined();
    expect(duplicate.body.errors).toBeUndefined();
    expect(first.body.data.createContact.email).toBe(email);
    expect(duplicate.body.data.createContact.email).toBe(email);
    expect(first.body.data.createContact.id).not.toBe(duplicate.body.data.createContact.id);

    const persisted = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM contacts
       WHERE organization_id = $1 AND email = $2`,
      [organizationId, email],
    );
    expect(persisted.rows[0].count).toBe(2);
  });

  it('updates only supplied fields, clears explicit nulls, and queues one committed change', async () => {
    const mutation = `mutation UpdateContact($id: Int!, $input: UpdateContactInput!) {
      updateContact(id: $id, input: $input) {
        id firstName email company status assignedToId
      }
    }`;
    const variables = {
      id: mutationContactId,
      input: {
        email: null,
        company: 'GraphQL Updated',
        status: 'INACTIVE',
        assignedToId: null,
      },
    };
    const changed = await graphqlMutation(
      memberToken,
      organizationId,
      mutation,
      variables,
    ).expect(200);
    const unchanged = await graphqlMutation(
      memberToken,
      organizationId,
      mutation,
      variables,
    ).expect(200);

    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.updateContact).toMatchObject({
      id: mutationContactId,
      firstName: 'Mutation',
      email: null,
      company: 'GraphQL Updated',
      status: 'INACTIVE',
      assignedToId: null,
    });
    expect(unchanged.body.errors).toBeUndefined();

    const events = await pool.query(
      `SELECT trigger_type, payload
       FROM workflow_triggers
       WHERE organization_id = $1 AND contact_id = $2
         AND trigger_type = 'contact_updated'`,
      [organizationId, mutationContactId],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].payload.changed_fields).toEqual(expect.arrayContaining([
      'email', 'company', 'status', 'assigned_to',
    ]));
    const statusActivities = await pool.query(
      `SELECT content FROM contact_activities
       WHERE contact_id = $1 AND type = 'status_change'`,
      [mutationContactId],
    );
    expect(statusActivities.rows).toEqual([
      { content: { from: 'active', to: 'inactive' } },
    ]);
  });

  it('rejects cross-tenant assignment and hides foreign mutations as NOT_FOUND', async () => {
    const invalidAssignee = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation UpdateContact($id: Int!, $input: UpdateContactInput!) {
        updateContact(id: $id, input: $input) { id }
      }`,
      { id: mutationContactId, input: { assignedToId: outsiderId } },
    ).expect(200);
    expect(invalidAssignee.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
      field: 'assignedToId',
    });

    const foreignUpdate = await graphqlMutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation UpdateContact($id: Int!, $input: UpdateContactInput!) {
        updateContact(id: $id, input: $input) { id }
      }`,
      { id: mutationContactId, input: { company: 'Foreign write' } },
    ).expect(200);
    const foreignDelete = await graphqlMutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation DeleteContact($id: Int!) { deleteContact(id: $id) { deletedId } }`,
      { id: mutationContactId },
    ).expect(200);
    expect(foreignUpdate.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('bulk updates deduplicated tenant rows and emits side effects only for actual changes', async () => {
    const mutation = `mutation BulkUpdateContacts($input: BulkUpdateContactsInput!) {
      bulkUpdateContacts(input: $input) {
        requestedIds matchedIds changedIds rejectedIds
      }
    }`;
    const variables = {
      input: {
        contactIds: [fixtures[0].id, fixtures[0].id, fixtures[1].id, foreignContactId],
        updates: { status: 'ARCHIVED', tags: ['bulk-tested'], tagsMode: 'ADD' },
      },
    };
    const changed = await graphqlMutation(
      memberToken,
      organizationId,
      mutation,
      variables,
    ).expect(200);
    const unchanged = await graphqlMutation(
      memberToken,
      organizationId,
      mutation,
      variables,
    ).expect(200);

    expect(changed.body.errors).toBeUndefined();
    expect(changed.body.data.bulkUpdateContacts).toEqual({
      requestedIds: [fixtures[0].id, fixtures[1].id, foreignContactId],
      matchedIds: [fixtures[0].id, fixtures[1].id],
      changedIds: [fixtures[0].id, fixtures[1].id],
      rejectedIds: [foreignContactId],
    });
    expect(unchanged.body.data.bulkUpdateContacts).toEqual({
      requestedIds: [fixtures[0].id, fixtures[1].id, foreignContactId],
      matchedIds: [fixtures[0].id, fixtures[1].id],
      changedIds: [],
      rejectedIds: [foreignContactId],
    });

    const contacts = await pool.query<{ id: number; status: string; tags: string[] }>(
      `SELECT id, status, tags FROM contacts
       WHERE id = ANY($1::int[]) ORDER BY id`,
      [[fixtures[0].id, fixtures[1].id, foreignContactId]],
    );
    expect(contacts.rows.slice(0, 2)).toEqual([
      expect.objectContaining({ status: 'archived', tags: expect.arrayContaining(['bulk-tested']) }),
      expect.objectContaining({ status: 'archived', tags: expect.arrayContaining(['bulk-tested']) }),
    ]);
    expect(contacts.rows.find((row) => row.id === foreignContactId)).toMatchObject({
      status: 'active',
      tags: ['vip'],
    });
    const evidence = await pool.query<{ trigger_type: string; total: number }>(
      `SELECT trigger_type, COUNT(*)::int AS total
       FROM workflow_triggers
       WHERE organization_id = $1 AND contact_id = ANY($2::int[])
         AND trigger_type IN ('contact_updated', 'tag_added')
       GROUP BY trigger_type`,
      [organizationId, [fixtures[0].id, fixtures[1].id]],
    );
    expect(evidence.rows).toEqual(expect.arrayContaining([
      { trigger_type: 'contact_updated', total: 2 },
      { trigger_type: 'tag_added', total: 2 },
    ]));
    const activities = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM contact_activities
       WHERE contact_id = ANY($1::int[]) AND type = 'status_change'`,
      [[fixtures[0].id, fixtures[1].id]],
    );
    expect(activities.rows[0].total).toBe(2);
  });

  it('rejects invalid bulk assignment atomically and enforces the request bound', async () => {
    const invalidAssignment = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation BulkUpdateContacts($input: BulkUpdateContactsInput!) {
        bulkUpdateContacts(input: $input) { changedIds }
      }`,
      {
        input: {
          contactIds: [fixtures[0].id],
          updates: { status: 'ACTIVE', assignedToId: outsiderId },
        },
      },
    ).expect(200);
    expect(invalidAssignment.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
    });
    const persisted = await pool.query<{ status: string }>(
      'SELECT status FROM contacts WHERE organization_id = $1 AND id = $2',
      [organizationId, fixtures[0].id],
    );
    expect(persisted.rows[0].status).toBe('archived');

    const oversized = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation BulkDeleteContacts($contactIds: [Int!]!) {
        bulkDeleteContacts(contactIds: $contactIds) { changedIds }
      }`,
      { contactIds: Array.from({ length: 101 }, (_, index) => index + 1) },
    ).expect(200);
    expect(oversized.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'BULK_LIMIT_EXCEEDED',
      limit: 100,
    });
  });

  it('bulk deletes only matched tenant rows with exact partial results', async () => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, source, status, created_by)
       VALUES ($1, 'Bulk Delete One', 'manual', 'active', $2),
              ($1, 'Bulk Delete Two', 'manual', 'active', $2)
       RETURNING id`,
      [organizationId, memberId],
    );
    const ids = inserted.rows.map((row) => row.id);
    await pool.query(
      `INSERT INTO contact_activities (contact_id, user_id, type, title, content)
       VALUES ($1, $3, 'system', 'Delete Evidence', '{}'::jsonb),
              ($2, $3, 'system', 'Delete Evidence', '{}'::jsonb)`,
      [ids[0], ids[1], memberId],
    );
    const target = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation BulkDeleteContacts($contactIds: [Int!]!) {
        bulkDeleteContacts(contactIds: $contactIds) {
          requestedIds matchedIds changedIds rejectedIds
        }
      }`,
      { contactIds: [ids[0], ids[0], foreignContactId, ids[1]] },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.bulkDeleteContacts).toEqual({
      requestedIds: [ids[0], foreignContactId, ids[1]],
      matchedIds: ids,
      changedIds: ids,
      rejectedIds: [foreignContactId],
    });
    const residue = await pool.query<{ contacts: number; activities: number; foreign: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM contacts WHERE id = ANY($1::int[])) AS contacts,
         (SELECT COUNT(*)::int FROM contact_activities WHERE contact_id = ANY($1::int[])) AS activities,
         (SELECT COUNT(*)::int FROM contacts WHERE id = $2) AS foreign`,
      [ids, foreignContactId],
    );
    expect(residue.rows[0]).toEqual({ contacts: 0, activities: 0, foreign: 1 });
  });

  it('creates a structured activity atomically for an owned contact', async () => {
    const contactId = fixtures[2].id;
    const target = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation AddContactActivity(
        $contactId: Int!,
        $input: CreateContactActivityInput!
      ) {
        addContactActivity(contactId: $contactId, input: $input) {
          id contactId userId userName userEmail type title
          content metadata createdAt
        }
      }`,
      {
        contactId,
        input: {
          type: 'NOTE',
          title: '  GraphQL activity  ',
          content: { body: 'Call tomorrow' },
          metadata: { source: 'integration' },
        },
      },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.addContactActivity).toMatchObject({
      contactId,
      userId: memberId,
      userName: 'Contact Member',
      type: 'NOTE',
      title: 'GraphQL activity',
      content: { body: 'Call tomorrow' },
      metadata: { source: 'integration' },
    });
    const persisted = await pool.query(
      `SELECT contact_id, user_id, type, title, content, metadata
       FROM contact_activities WHERE id = $1`,
      [target.body.data.addContactActivity.id],
    );
    expect(persisted.rows[0]).toEqual({
      contact_id: contactId,
      user_id: memberId,
      type: 'note',
      title: 'GraphQL activity',
      content: { body: 'Call tomorrow' },
      metadata: { source: 'integration' },
    });
  });

  it('filters activities and keeps foreign contacts private', async () => {
    const contactId = fixtures[2].id;
    const target = await graphql(
      memberToken,
      organizationId,
      `query ContactActivities(
        $contactId: Int!,
        $filter: ContactActivityFilterInput,
        $page: PageInput
      ) {
        contactActivities(contactId: $contactId, filter: $filter, page: $page) {
          nodes { id contactId userId type title content metadata }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      {
        contactId,
        filter: { type: 'NOTE' },
        page: { page: 1, pageSize: 1 },
      },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.contactActivities.nodes).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        contactId,
        userId: memberId,
        type: 'NOTE',
        title: 'GraphQL activity',
        content: { body: 'Call tomorrow' },
      }),
    ]);
    expect(target.body.data.contactActivities.pageInfo).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });

    const privateResult = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Activity($contactId: Int!) { contactActivities(contactId: $contactId) { nodes { id } } }',
      { contactId },
    ).expect(200);
    expect(privateResult.body.data).toBeNull();
    expect(privateResult.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('returns bounded related content and keeps foreign contacts private', async () => {
    const contactId = fixtures[1].id;
    await Promise.all([
      pool.query(
        `INSERT INTO lists (user_id, title, category, items, contact_id, created_at)
         VALUES ($1, 'Linked list', 'General', '[]'::jsonb, $2, NOW())`,
        [memberId, contactId],
      ),
      pool.query(
        `INSERT INTO notes (user_id, title, category, content, contact_id, created_at)
         VALUES ($1, 'Linked note', 'General', 'Body', $2, NOW())`,
        [memberId, contactId],
      ),
      pool.query(
        `INSERT INTO whiteboards (user_id, title, category, canvas_data, contact_id, created_at)
         VALUES ($1, 'Linked board', 'General', '{}'::jsonb, $2, NOW())`,
        [memberId, contactId],
      ),
    ]);

    const target = await graphql(
      memberToken,
      organizationId,
      `query ContactContent($contactId: Int!) {
        contactContent(contactId: $contactId) {
          lists { nodes { id title category createdAt } total hasMore }
          notes { nodes { id title category createdAt } total hasMore }
          whiteboards { nodes { id title category createdAt } total hasMore }
        }
      }`,
      { contactId },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    for (const collection of ['lists', 'notes', 'whiteboards'] as const) {
      expect(target.body.data.contactContent[collection]).toMatchObject({
        total: 1,
        hasMore: false,
      });
      expect(target.body.data.contactContent[collection].nodes).toEqual([
        expect.objectContaining({
          id: expect.any(Number),
          category: 'General',
          createdAt: expect.any(String),
        }),
      ]);
    }
    expect(target.body.data.contactContent.lists.nodes[0].title).toBe('Linked list');
    expect(target.body.data.contactContent.notes.nodes[0].title).toBe('Linked note');
    expect(target.body.data.contactContent.whiteboards.nodes[0].title).toBe('Linked board');

    const privateResult = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Content($contactId: Int!) { contactContent(contactId: $contactId) { lists { total } } }',
      { contactId },
    ).expect(200);
    expect(privateResult.body.data).toBeNull();
    expect(privateResult.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('composes a bounded profile with explicit section health and tenant privacy', async () => {
    const contactId = fixtures[2].id;
    const invoice = await pool.query<{ id: number }>(
      `INSERT INTO invoices (
         organization_id, invoice_number, contact_id, due_date, total, amount_due, status
       ) VALUES ($1, $2, $3, CURRENT_DATE + 14, 125.50, 125.50, 'sent')
       RETURNING id`,
      [organizationId, `PROFILE-${contactId}`, contactId],
    );
    const document = await pool.query<{ id: number }>(
      `INSERT INTO signature_documents (
         organization_id, title, status, created_by, sent_at
       ) VALUES ($1, 'Profile agreement', 'sent', $2, NOW())
       RETURNING id`,
      [organizationId, memberId],
    );
    const conversation = await pool.query<{ id: number }>(
      `INSERT INTO conversations (organization_id, contact_id, subject)
       VALUES ($1, $2, 'Profile thread')
       RETURNING id`,
      [organizationId, contactId],
    );
    const calendar = await pool.query<{ id: number }>(
      `INSERT INTO calendars (
         organization_id, name, slug, created_by
       ) VALUES ($1, 'Profile calendar', $2, $3)
       RETURNING id`,
      [organizationId, `profile-${contactId}`, memberId],
    );

    await Promise.all([
      pool.query(
        `INSERT INTO payments (
           organization_id, invoice_id, contact_id, amount, payment_method,
           status, paid_at
         ) VALUES ($1, $2, $3, 25.50, 'card', 'succeeded', NOW())`,
        [organizationId, invoice.rows[0].id, contactId],
      ),
      pool.query(
        `INSERT INTO signature_recipients (
           document_id, organization_id, contact_id, email, status, sent_at
         ) VALUES ($1, $2, $3, 'gamma@test.itemize', 'sent', NOW())`,
        [document.rows[0].id, organizationId, contactId],
      ),
      pool.query(
        `INSERT INTO contact_activities (
           contact_id, user_id, type, title, content, metadata
         ) VALUES ($1, $2, 'note', 'Profile activity', '{"body":"Profile"}', '{}')`,
        [contactId, memberId],
      ),
      pool.query(
        `INSERT INTO notes (
           user_id, title, category, content, contact_id, organization_id
         ) VALUES ($1, 'Profile note', 'General', 'Profile body', $2, $3)`,
        [memberId, contactId, organizationId],
      ),
      pool.query(
        `INSERT INTO lists (
           user_id, title, category, items, contact_id, organization_id
         ) VALUES ($1, 'Profile list', 'General', '[]'::jsonb, $2, $3)`,
        [memberId, contactId, organizationId],
      ),
      pool.query(
        `INSERT INTO messages (
           conversation_id, organization_id, sender_type, sender_user_id,
           channel, content
         ) VALUES ($1, $2, 'user', $3, 'email', 'Profile message')`,
        [conversation.rows[0].id, organizationId, memberId],
      ),
      pool.query(
        `INSERT INTO tasks (
           organization_id, contact_id, created_by, title, description,
           priority, status, due_date
         ) VALUES (
           $1, $2, $3, 'Profile task', 'Profile task body',
           'high', 'pending', NOW() + INTERVAL '1 day'
         )`,
        [organizationId, contactId, memberId],
      ),
      pool.query(
        `INSERT INTO bookings (
           organization_id, calendar_id, contact_id, title, start_time,
           end_time, timezone, status, source
         ) VALUES (
           $1, $2, $3, 'Profile booking', NOW() + INTERVAL '2 days',
           NOW() + INTERVAL '2 days 30 minutes', 'UTC', 'confirmed', 'manual'
         )`,
        [organizationId, calendar.rows[0].id, contactId],
      ),
    ]);

    const target = await graphql(
      memberToken,
      organizationId,
      `query ContactProfile($contactId: Int!) {
        contactProfile(contactId: $contactId) {
          contact { id email }
          invoices {
            status total hasMore
            nodes { id number status total createdAt dueDate }
          }
          signatures {
            status total hasMore
            nodes { id title status sentAt signedAt createdAt }
          }
          payments {
            status total hasMore
            nodes { id invoiceId invoiceNumber amount date }
          }
          activities {
            status total hasMore
            nodes { id contactId userId type title content metadata createdAt }
          }
          notes {
            status total hasMore
            nodes { id title content createdAt }
          }
          lists {
            status total hasMore
            nodes { id title category createdAt }
          }
          communications {
            status total hasMore
            nodes { id type direction subject content date }
          }
          tasks {
            status total hasMore
            nodes {
              id title description status priority dueDate completedAt createdAt
            }
          }
          bookings {
            status total hasMore
            nodes { id title calendarId startTime endTime status source }
          }
        }
      }`,
      { contactId },
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    const profile = target.body.data.contactProfile;
    expect(profile.contact).toEqual({
      id: contactId,
      email: 'gamma@test.itemize',
    });
    for (const section of [
      'invoices',
      'signatures',
      'payments',
      'activities',
      'notes',
      'lists',
      'communications',
      'tasks',
      'bookings',
    ]) {
      expect(profile[section]).toMatchObject({
        status: 'AVAILABLE',
        hasMore: false,
      });
      expect(profile[section].total).toBe(profile[section].nodes.length);
    }
    expect(profile.invoices.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: `PROFILE-${contactId}`, total: 125.5 }),
      ]),
    );
    expect(profile.signatures.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Profile agreement', status: 'sent' }),
      ]),
    );
    expect(profile.payments.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invoiceId: invoice.rows[0].id,
          invoiceNumber: `PROFILE-${contactId}`,
          amount: 25.5,
        }),
      ]),
    );
    expect(profile.activities.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Profile activity', type: 'NOTE' }),
      ]),
    );
    expect(profile.notes.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Profile note', content: 'Profile body' }),
      ]),
    );
    expect(profile.lists.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Profile list', category: 'General' }),
      ]),
    );
    expect(profile.communications.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: 'Profile thread',
          content: 'Profile message',
          direction: 'outbound',
        }),
      ]),
    );
    expect(profile.tasks.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Profile task', priority: 'high' }),
      ]),
    );
    expect(profile.bookings.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Profile booking',
          calendarId: calendar.rows[0].id,
        }),
      ]),
    );

    const privateResult = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query ContactProfilePrivate($contactId: Int!) {
        contactProfile(contactId: $contactId) { contact { id } }
      }`,
      { contactId },
    ).expect(200);
    expect(privateResult.body.data).toBeNull();
    expect(privateResult.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('deletes an organization-owned contact and returns an exact confirmation', async () => {
    const target = await graphqlMutation(
      memberToken,
      organizationId,
      `mutation DeleteContact($id: Int!) { deleteContact(id: $id) { deletedId } }`,
      { id: mutationContactId },
    ).expect(200);
    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.deleteContact).toEqual({ deletedId: mutationContactId });
    const persisted = await pool.query('SELECT id FROM contacts WHERE id = $1', [mutationContactId]);
    expect(persisted.rowCount).toBe(0);
  });

  it('rejects invalid identifiers before querying contact data', async () => {
    const target = await graphql(
      memberToken,
      organizationId,
      'query Contact($id: Int!) { contact(id: $id) { id } }',
      { id: 0 },
    ).expect(200);
    expect(target.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_CONTACT_ID',
      field: 'id',
    });
  });

  describe('NestJS retained contact-transfer HTTP boundary', () => {
    const csrf = 'contact-transfer-integration-csrf';
    const transferRequest = (
      method: 'get' | 'post',
      path: string,
      token = memberToken,
      selectedOrganizationId = organizationId,
    ) => {
      const pending = request(graphqlApp.getHttpServer())
        [method](path)
        .set('Cookie', [
          `itemize_auth=${token}`,
          `csrf-token=${csrf}`,
        ])
        .set('x-csrf-token', csrf)
        .set('x-organization-id', String(selectedOrganizationId));
      if (method === 'post') {
        pending.set('idempotency-key', randomUUID());
      }
      return pending;
    };

    it('requires authentication, verified membership, and CSRF', async () => {
      await request(graphqlApp.getHttpServer())
        .get('/api/contacts/export/csv')
        .set('x-organization-id', String(organizationId))
        .expect(401);

      const foreign = await transferRequest(
        'get',
        '/api/contacts/export/csv',
        memberToken,
        outsiderOrganizationId,
      ).expect(403);
      expect(foreign.body.code).toBe('FORBIDDEN');

      const missingCsrf = await request(graphqlApp.getHttpServer())
        .post('/api/contacts/import/csv')
        .set('Cookie', `itemize_auth=${memberToken}`)
        .set('x-organization-id', String(organizationId))
        .send({
          contacts: [{ first_name: 'Missing CSRF' }],
          skipDuplicates: true,
        })
        .expect(403);
      expect(missingCsrf.body).toMatchObject({
        code: 'FORBIDDEN',
        reason: 'CSRF_COOKIE_MISSING',
      });

      const missingIdempotencyKey = await request(graphqlApp.getHttpServer())
        .post('/api/contacts/import/csv')
        .set('Cookie', [
          `itemize_auth=${memberToken}`,
          `csrf-token=${csrf}`,
        ])
        .set('x-csrf-token', csrf)
        .set('x-organization-id', String(organizationId))
        .send({
          contacts: [{ first_name: 'Missing idempotency key' }],
          skipDuplicates: true,
        })
        .expect(400);
      expect(missingIdempotencyKey.body).toMatchObject({
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    });

    it('exports only the verified tenant with safe CSV cells and filters', async () => {
      const suffix = `${Date.now()}-${process.pid}`;
      await pool.query(
        `INSERT INTO contacts (
           organization_id, first_name, email, company, status, tags, created_by
         ) VALUES
           ($1, '=1+1', $2, 'Acme, "HQ"', 'active', ARRAY['csv-safe'], $3),
           ($4, '@foreign', $5, 'Foreign', 'active', ARRAY['csv-safe'], $6)`,
        [
          organizationId,
          `csv-export-${suffix}@test.itemize`,
          memberId,
          outsiderOrganizationId,
          `csv-export-foreign-${suffix}@test.itemize`,
          outsiderId,
        ],
      );

      const response = await transferRequest(
        'get',
        '/api/contacts/export/csv?status=active&tags=csv-safe',
      ).expect(200);
      expect(response.headers).toMatchObject({
        'cache-control': 'private, no-store',
        'content-type': 'text/csv; charset=utf-8',
        'x-content-type-options': 'nosniff',
      });
      expect(response.text).toContain(`"'=1+1"`);
      expect(response.text).toContain(`"Acme, ""HQ"""`);
      expect(response.text).not.toContain(`csv-export-foreign-${suffix}`);
    });

    it('reports invalid rows, skips canonical duplicates, and commits effects atomically', async () => {
      const suffix = `${Date.now()}-${process.pid}`;
      const canonicalEmail = `csv-import-${suffix}@test.itemize`;
      const idempotencyKey = randomUUID();
      const importBody = {
        contacts: [
          {
            first_name: 'Imported First',
            email: ` ${canonicalEmail.toUpperCase()} `,
            tags: 'vip; newsletter;vip',
          },
          {
            first_name: 'Duplicate Variant',
            email: canonicalEmail,
          },
          { first_name: 'Imported Without Email' },
          { first_name: '', email: '   ' },
          { first_name: 'Unknown Column', unexpected: 'value' },
        ],
        skipDuplicates: true,
      };
      const response = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .set('idempotency-key', idempotencyKey)
        .send(importBody)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        imported: 2,
        skipped: 1,
        replayed: false,
        errorCount: 2,
        errorsTruncated: false,
      });
      expect(response.body.errors).toEqual([
        expect.objectContaining({ row: 4 }),
        expect.objectContaining({ row: 5, error: 'Unknown columns: unexpected' }),
      ]);

      const replay = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .set('idempotency-key', idempotencyKey)
        .send(importBody)
        .expect(201);
      expect(replay.body).toMatchObject({
        imported: 2,
        skipped: 1,
        replayed: true,
        errorCount: 2,
      });
      expect(replay.body.errors).toEqual(response.body.errors);

      const conflict = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .set('idempotency-key', idempotencyKey)
        .send({
          contacts: [{ first_name: 'Different import' }],
          skipDuplicates: true,
        })
        .expect(409);
      expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

      const persisted = await pool.query<{
        id: number;
        email: string | null;
        tags: string[];
      }>(
        `SELECT id, email, tags
         FROM contacts
         WHERE organization_id = $1
           AND first_name IN ('Imported First', 'Imported Without Email')
         ORDER BY first_name`,
        [organizationId],
      );
      expect(persisted.rows).toHaveLength(2);
      expect(persisted.rows.find((row) => row.email === canonicalEmail)?.tags)
        .toEqual(['vip', 'newsletter']);

      const effects = await pool.query<{
        triggers: number;
        activities: number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int
            FROM workflow_triggers
            WHERE contact_id = ANY($1::int[])
              AND trigger_type = 'contact_added') AS triggers,
           (SELECT COUNT(*)::int
            FROM contact_activities
            WHERE contact_id = ANY($1::int[])
              AND title = 'Contact Created') AS activities`,
        [persisted.rows.map((row) => row.id)],
      );
      expect(effects.rows[0]).toEqual({ triggers: 2, activities: 2 });

      const receipts = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM contact_import_receipts
         WHERE organization_id = $1
           AND requested_by_user_id = $2
           AND idempotency_key = $3
           AND imported = 2
           AND skipped = 1
           AND completed_at IS NOT NULL`,
        [organizationId, memberId, idempotencyKey],
      );
      expect(receipts.rows[0].total).toBe(1);
    });

    it('preserves duplicates when requested and serializes same-email imports when skipping', async () => {
      const suffix = `${Date.now()}-${process.pid}`;
      const preservedEmail = `csv-preserved-${suffix}@test.itemize`;
      const preserved = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .send({
          contacts: [
            { first_name: 'Preserved One', email: preservedEmail },
            { first_name: 'Preserved Two', email: preservedEmail.toUpperCase() },
          ],
          skipDuplicates: false,
        })
        .expect(201);
      expect(preserved.body).toMatchObject({ imported: 2, skipped: 0 });

      const serializedEmail = `csv-serialized-${suffix}@test.itemize`;
      const [first, second] = await Promise.all([
        transferRequest('post', '/api/contacts/import/csv').send({
          contacts: [{ first_name: 'Serialized One', email: serializedEmail }],
          skipDuplicates: true,
        }),
        transferRequest('post', '/api/contacts/import/csv').send({
          contacts: [{ first_name: 'Serialized Two', email: serializedEmail }],
          skipDuplicates: true,
        }),
      ]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect([first.body.imported, second.body.imported].sort()).toEqual([0, 1]);
      expect([first.body.skipped, second.body.skipped].sort()).toEqual([0, 1]);

      const counts = await pool.query<{ email: string; total: number }>(
        `SELECT email, COUNT(*)::int AS total
         FROM contacts
         WHERE organization_id = $1
           AND email = ANY($2::text[])
         GROUP BY email
         ORDER BY email`,
        [organizationId, [preservedEmail, serializedEmail]],
      );
      expect(counts.rows).toEqual([
        { email: preservedEmail, total: 2 },
        { email: serializedEmail, total: 1 },
      ]);
    });

    it('rejects an import that would exceed the tenant plan without partial writes', async () => {
      const suffix = `${Date.now()}-${process.pid}`;
      const count = await pool.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM contacts WHERE organization_id = $1',
        [organizationId],
      );
      await pool.query(
        'UPDATE organizations SET contacts_limit = $1 WHERE id = $2',
        [count.rows[0].total + 1, organizationId],
      );
      try {
        const response = await transferRequest(
          'post',
          '/api/contacts/import/csv',
        )
          .send({
            contacts: [
              {
                first_name: 'Plan First',
                email: `csv-plan-first-${suffix}@test.itemize`,
              },
              {
                first_name: 'Plan Second',
                email: `csv-plan-second-${suffix}@test.itemize`,
              },
            ],
            skipDuplicates: false,
          })
          .expect(403);
        expect(response.body).toMatchObject({
          code: 'PLAN_LIMIT_REACHED',
          current: count.rows[0].total,
          limit: count.rows[0].total + 1,
          attempted: 2,
        });
        const residue = await pool.query<{ total: number }>(
          `SELECT COUNT(*)::int AS total
           FROM contacts
           WHERE organization_id = $1 AND first_name LIKE 'Plan %'`,
          [organizationId],
        );
        expect(residue.rows[0].total).toBe(0);
      } finally {
        await pool.query(
          'UPDATE organizations SET contacts_limit = NULL WHERE id = $1',
          [organizationId],
        );
      }
    });

    it('enforces row, body, and bounded error-report limits before writes', async () => {
      const tooManyRows = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .send({
          contacts: Array.from({ length: 10_001 }, () => ({})),
          skipDuplicates: true,
        })
        .expect(400);
      expect(tooManyRows.body).toMatchObject({ code: 'INVALID_IMPORT' });

      const boundedErrors = await transferRequest(
        'post',
        '/api/contacts/import/csv',
      )
        .send({
          contacts: Array.from({ length: 101 }, () => ({})),
          skipDuplicates: true,
        })
        .expect(201);
      expect(boundedErrors.body).toMatchObject({
        imported: 0,
        errorCount: 101,
        errorsTruncated: true,
      });
      expect(boundedErrors.body.errors).toHaveLength(100);

      await transferRequest('post', '/api/contacts/import/csv')
        .send({
          contacts: [{ first_name: 'x'.repeat(1_100_000) }],
          skipDuplicates: true,
        })
        .expect(413);
    });
  });
});
