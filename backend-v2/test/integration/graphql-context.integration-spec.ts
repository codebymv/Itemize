import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('GraphQL request context against PostgreSQL', () => {
  let app: INestApplication;
  let pool: Pool;
  let organizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for GraphQL integration tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const member = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'GraphQL Member', 'email', true)
       RETURNING id`,
      [`graphql-member-${suffix}@test.itemize`],
    );
    const outsider = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'GraphQL Outsider', 'email', true)
       RETURNING id`,
      [`graphql-outsider-${suffix}@test.itemize`],
    );
    memberId = member.rows[0].id;
    outsiderId = outsider.rows[0].id;

    const organization = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('GraphQL Integration', $1)
       RETURNING id`,
      [`graphql-integration-${suffix}`],
    );
    organizationId = organization.rows[0].id;
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'member', NOW())`,
      [organizationId, memberId],
    );
    await pool.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, memberId],
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
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (pool) {
      if (organizationId) {
        await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
      }
      if (memberId || outsiderId) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
          [memberId, outsiderId].filter(Boolean),
        ]);
      }
    }
    if (app) await app.close();
  });

  const executeContextQuery = (token: string, organization?: string) => {
    let operation = request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({
        query:
          '{ viewerContext { userId organizationId organizationRole } }',
      });
    if (organization !== undefined) {
      operation = operation.set('x-organization-id', organization);
    }
    return operation;
  };

  it('resolves the authenticated user default membership', async () => {
    const response = await executeContextQuery(memberToken).expect(200);
    expect(response.body.data.viewerContext).toEqual({
      userId: memberId,
      organizationId,
      organizationRole: 'member',
    });
  });

  it('re-reads role changes instead of trusting the access token', async () => {
    await pool.query(
      `UPDATE organization_members SET role = 'viewer'
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, memberId],
    );
    const response = await executeContextQuery(
      memberToken,
      String(organizationId),
    ).expect(200);
    expect(response.body.data.viewerContext.organizationRole).toBe('viewer');
  });

  it('denies a non-member without revealing organization existence', async () => {
    const response = await executeContextQuery(
      outsiderToken,
      String(organizationId),
    ).expect(200);
    expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('denies a formerly valid context immediately after membership removal', async () => {
    await pool.query(
      `DELETE FROM organization_members
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, memberId],
    );
    const response = await executeContextQuery(
      memberToken,
      String(organizationId),
    ).expect(200);
    expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
});
