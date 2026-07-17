import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
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

describe('Contacts REST/GraphQL PostgreSQL parity', () => {
  let graphqlApp: INestApplication;
  let legacyApp: Express;
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
    graphqlApp = moduleRef.createNestApplication({ logger: false });
    configureApp(graphqlApp);
    await graphqlApp.init();

    const createContactsRouter = require('../../../backend/src/routes/contacts.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const { errorHandler } = require('../../../backend/src/middleware/errorHandler');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/contacts', createContactsRouter(pool, authenticateJWT));
    legacyApp.use(errorHandler);
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

  it('matches legacy list membership, order, and page counts', async () => {
    const legacy = await request(legacyApp)
      .get('/api/contacts?page=1&limit=2&sort_by=created_at&sort_order=desc')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
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
    expect(target.body.data.contacts.nodes.map((contact: { id: number }) => contact.id))
      .toEqual(legacy.body.contacts.map((contact: { id: number }) => contact.id));
    expect(target.body.data.contacts.pageInfo).toMatchObject({
      page: legacy.body.pagination.page,
      pageSize: legacy.body.pagination.limit,
      total: legacy.body.pagination.total,
      totalPages: legacy.body.pagination.totalPages,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(target.body.data.contacts.nodes).toEqual([
      expect.objectContaining({ firstName: 'Gamma', organizationId }),
      expect.objectContaining({ firstName: 'Beta', organizationId }),
    ]);
  });

  it('matches legacy search, status, tag, and assignee filtering', async () => {
    const legacy = await request(legacyApp)
      .get('/api/contacts')
      .query({
        search: 'alpha',
        status: 'active',
        tags: 'vip',
        assigned_to: memberId,
      })
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
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
        id: legacy.body.contacts[0].id,
        firstName: legacy.body.contacts[0].first_name,
        status: legacy.body.contacts[0].status.toUpperCase(),
        tags: legacy.body.contacts[0].tags,
        assignedToId: legacy.body.contacts[0].assigned_to,
      },
    ]);
  });

  it('matches legacy detail data for an organization-owned contact', async () => {
    const contactId = fixtures[0].id;
    const legacy = await request(legacyApp)
      .get(`/api/contacts/${contactId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
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
      id: legacy.body.id,
      organizationId: legacy.body.organization_id,
      firstName: legacy.body.first_name,
      lastName: legacy.body.last_name,
      email: legacy.body.email,
      status: legacy.body.status.toUpperCase(),
      tags: legacy.body.tags,
      assignedToId: legacy.body.assigned_to,
      assignedToName: legacy.body.assigned_to_name,
      assignedToEmail: legacy.body.assigned_to_email,
      createdById: legacy.body.created_by,
      createdByName: legacy.body.created_by_name,
    });
  });

  it('preserves cross-tenant resource privacy as NOT_FOUND', async () => {
    const contactId = fixtures[0].id;
    const legacy = await request(legacyApp)
      .get(`/api/contacts/${contactId}`)
      .set('Cookie', `itemize_auth=${outsiderToken}`)
      .set('x-organization-id', String(outsiderOrganizationId))
      .expect(404);
    const target = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Contact($id: Int!) { contact(id: $id) { id } }',
      { id: contactId },
    ).expect(200);

    expect(legacy.body.error).toBe('Contact not found');
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
      `mutation CreateContact($input: CreateContactInput!) {
        createContact(input: $input) { id }
      }`,
      { input: { email } },
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
    const mutation = `mutation CreateContact($input: CreateContactInput!) {
      createContact(input: $input) { id email }
    }`;
    const suffix = `${Date.now()}-${process.pid}`;
    const responses = await Promise.all([
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { email: `limit-first-${suffix}@test.itemize` },
      }),
      graphqlMutation(memberToken, organizationId, mutation, {
        input: { email: `limit-second-${suffix}@test.itemize` },
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
      `mutation CreateContact($input: CreateContactInput!) {
        createContact(input: $input) {
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

  it('matches legacy activity filtering and keeps foreign contacts private', async () => {
    const contactId = fixtures[2].id;
    const legacy = await request(legacyApp)
      .get(`/api/contacts/${contactId}/activities`)
      .query({ type: 'note', limit: 1, offset: 0 })
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
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
        id: legacy.body[0].id,
        contactId,
        userId: memberId,
        type: 'NOTE',
        title: legacy.body[0].title,
        content: legacy.body[0].content,
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

  it('matches bounded related content and keeps foreign contacts private', async () => {
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

    const legacy = await request(legacyApp)
      .get(`/api/contacts/${contactId}/content`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
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
        total: legacy.body[collection].length,
        hasMore: false,
      });
      expect(target.body.data.contactContent[collection].nodes).toEqual(
        legacy.body[collection].map((item: {
          id: number;
          title: string;
          category: string;
          created_at: string;
        }) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          createdAt: new Date(item.created_at).toISOString(),
        })),
      );
    }

    const privateResult = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Content($contactId: Int!) { contactContent(contactId: $contactId) { lists { total } } }',
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
});
