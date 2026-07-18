import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Organization selector GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let emptyUserId: number;
  let memberToken: string;
  let outsiderToken: string;
  let emptyUserToken: string;
  let alphaId: number;
  let betaId: number;
  let outsiderOrganizationId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_DATABASE_URL is required for organization selector tests',
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
       VALUES ($1, 'Workspace Member', 'email', true),
              ($2, 'Workspace Outsider', 'email', true),
              ($3, 'Workspace Empty', 'email', true)
       RETURNING id`,
      [
        `workspace-member-${suffix}@test.itemize`,
        `workspace-outsider-${suffix}@test.itemize`,
        `workspace-empty-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId, emptyUserId] = users.rows.map((row) =>
      Number(row.id),
    );

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, settings)
       VALUES ('Alpha Workspace', $1, '{"marker":"alpha"}'::jsonb),
              ('Beta Workspace', $2, '{"marker":"beta"}'::jsonb),
              ('Outsider Workspace', $3, '{}'::jsonb)
       RETURNING id`,
      [
        `workspace-alpha-${suffix}`,
        `workspace-beta-${suffix}`,
        `workspace-outsider-${suffix}`,
      ],
    );
    [alphaId, betaId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );

    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES
         ($1, $4, 'owner', NOW()),
         ($2, $4, 'member', NOW()),
         ($3, $5, 'owner', NOW())`,
      [alphaId, betaId, outsiderOrganizationId, memberId, outsiderId],
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
        memberId,
        alphaId,
        outsiderId,
        outsiderOrganizationId,
        [memberId, outsiderId],
      ],
    );

    memberToken = await jwt.signAsync(
      { id: memberId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    emptyUserToken = await jwt.signAsync(
      { id: emptyUserId },
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

    const createOrganizationsRouter = require('../../../backend/src/routes/organizations.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/organizations',
      createOrganizationsRouter(pool, authenticateJWT),
    );
  });

  afterAll(async () => {
    if (pool && (memberId || outsiderId || emptyUserId)) {
      const userIds = [memberId, outsiderId, emptyUserId].filter(Boolean);
      await pool.query(
        `DELETE FROM organizations
         WHERE id IN (
           SELECT organization_id
           FROM organization_members
           WHERE user_id = ANY($1::int[])
         )`,
        [userIds],
      );
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        userIds,
      ]);
    }
    if (app) await app.close();
  });

  const query = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({ query: document, variables });

  const mutation = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'organization-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .send({ query: document, variables });
  };

  const fields =
    'id name slug settings logoUrl role isDefault createdAt updatedAt';

  it('lists only current memberships and identifies the persisted default', async () => {
    const member = await query(
      memberToken,
      `{ organizations { ${fields} } }`,
    ).expect(200);
    const outsider = await query(
      outsiderToken,
      `{ organizations { ${fields} } }`,
    ).expect(200);

    expect(member.body.errors).toBeUndefined();
    expect(member.body.data.organizations).toHaveLength(2);
    expect(member.body.data.organizations).toEqual([
      expect.objectContaining({
        id: alphaId,
        role: 'owner',
        isDefault: true,
        settings: { marker: 'alpha' },
      }),
      expect.objectContaining({
        id: betaId,
        role: 'member',
        isDefault: false,
        settings: { marker: 'beta' },
      }),
    ]);
    expect(outsider.body.data.organizations).toEqual([
      expect.objectContaining({
        id: outsiderOrganizationId,
        role: 'owner',
        isDefault: true,
      }),
    ]);
  });

  it('selects only a current membership and remains readable through REST', async () => {
    const selected = await mutation(
      memberToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { ${fields} }
      }`,
      { id: betaId },
    ).expect(200);
    expect(selected.body.errors).toBeUndefined();
    expect(selected.body.data.selectOrganization).toMatchObject({
      id: betaId,
      role: 'member',
      isDefault: true,
    });

    const legacy = await request(legacyApp)
      .get('/api/organizations')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    expect(
      legacy.body.data.find(
        (organization: { id: number }) => organization.id === betaId,
      ),
    ).toMatchObject({ is_default: true });

    const forbidden = await mutation(
      outsiderToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { id }
      }`,
      { id: alphaId },
    ).expect(200);
    expect(forbidden.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('requires CSRF for selection without altering the stored default', async () => {
    const denied = await query(
      memberToken,
      `mutation Select($id: Int!) {
        selectOrganization(id: $id) { id }
      }`,
      { id: alphaId },
    ).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const persisted = await pool.query<{ default_organization_id: number }>(
      'SELECT default_organization_id FROM users WHERE id = $1',
      [memberId],
    );
    expect(Number(persisted.rows[0].default_organization_id)).toBe(betaId);
  });

  it('serializes concurrent default creation into one personal workspace', async () => {
    const document = `mutation {
      ensureDefaultOrganization { ${fields} }
    }`;
    const [first, second] = await Promise.all([
      mutation(emptyUserToken, document).expect(200),
      mutation(emptyUserToken, document).expect(200),
    ]);

    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.ensureDefaultOrganization.id).toBe(
      second.body.data.ensureDefaultOrganization.id,
    );
    expect(first.body.data.ensureDefaultOrganization).toMatchObject({
      role: 'owner',
      isDefault: true,
      settings: { personal: true },
    });

    const persisted = await pool.query<{
      membership_count: string;
      organization_count: string;
      default_organization_id: number;
    }>(
      `SELECT
         COUNT(om.id)::text AS membership_count,
         COUNT(DISTINCT om.organization_id)::text AS organization_count,
         MAX(u.default_organization_id) AS default_organization_id
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
       WHERE u.id = $1`,
      [emptyUserId],
    );
    expect(persisted.rows[0]).toMatchObject({
      membership_count: '1',
      organization_count: '1',
    });
    expect(Number(persisted.rows[0].default_organization_id)).toBe(
      first.body.data.ensureDefaultOrganization.id,
    );
  });
});
