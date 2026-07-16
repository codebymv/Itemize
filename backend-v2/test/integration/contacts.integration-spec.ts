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
