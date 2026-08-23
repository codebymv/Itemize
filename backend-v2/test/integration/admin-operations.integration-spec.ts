import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Admin operations GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let adminId: number;
  let userId: number;
  let secondUserId: number;
  let adminOrganizationId: number;
  let userOrganizationId: number;
  let adminToken: string;
  let userToken: string;
  const jwt = new JwtService();
  const suffix = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for admin operations tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified,role)
       VALUES ($1,'Cutover Admin','email',true,'ADMIN'),
              ($2,'Cutover Pro User','email',true,'USER'),
              ($3,'Cutover Free User','email',true,'USER') RETURNING id`,
      [`cutover-admin-${suffix}@test.itemize`, `cutover-pro-${suffix}@test.itemize`, `cutover-free-${suffix}@test.itemize`],
    );
    [adminId, userId, secondUserId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug) VALUES ('Admin Cutover',$1),('Pro Cutover',$2) RETURNING id`,
      [`admin-cutover-${suffix}`, `pro-cutover-${suffix}`],
    );
    [adminOrganizationId, userOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `UPDATE users SET default_organization_id=CASE id
         WHEN $3::int THEN $1::int WHEN $4::int THEN $2::int ELSE default_organization_id END
       WHERE id=ANY($5::int[])`,
      [adminOrganizationId, userOrganizationId, adminId, userId, [adminId, userId]],
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $3, 'owner'), ($2, $4, 'owner')`,
      [adminOrganizationId, userOrganizationId, adminId, userId],
    );
    await pool.query(
      `INSERT INTO subscriptions (organization_id,plan_id,status,created_at,updated_at)
       SELECT $1,id,'active',NOW(),NOW() FROM subscription_plans WHERE name='pro' AND is_active=true LIMIT 1`,
      [userOrganizationId],
    );
    adminToken = await jwt.signAsync({ id: adminId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    userToken = await jwt.signAsync({ id: userId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(pool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (pool && (adminOrganizationId || userOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [[adminOrganizationId, userOrganizationId].filter(Boolean)]);
    }
    if (pool && (adminId || userId || secondUserId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[adminId, userId, secondUserId].filter(Boolean)]);
    }
    if (app) await app.close();
  });

  const graphql = (query: string, variables: Record<string, unknown> = {}, token = adminToken, csrf = false) => {
    const call = request(app.getHttpServer()).post('/graphql')
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=admin-csrf` : `itemize_auth=${token}`);
    if (csrf) call.set('x-csrf-token', 'admin-csrf');
    return call.send({ query, variables });
  };

  it('denies anonymous and non-admin callers without requiring organization context', async () => {
    const anonymous = await request(app.getHttpServer()).post('/graphql')
      .send({ query: '{ adminUserCount { count } }' }).expect(200);
    expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const member = await graphql('{ adminUserCount { count } }', {}, userToken).expect(200);
    expect(member.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('returns authoritative counts, statistics, stable search, and plan-filtered IDs', async () => {
    const expected = await pool.query<{ users: number; contacts: number; invoices: number }>(
      `SELECT (SELECT COUNT(*) FROM users)::int users,
              (SELECT COUNT(*) FROM contacts)::int contacts,
              (SELECT COUNT(*) FROM invoices)::int invoices`,
    );
    const counts = await graphql('{ adminUserCount { count } adminSystemStats { users contacts invoices } }').expect(200);
    expect(counts.body.errors).toBeUndefined();
    expect(counts.body.data.adminUserCount.count).toBe(expected.rows[0].users);
    expect(counts.body.data.adminSystemStats).toEqual(expected.rows[0]);

    const search = await graphql(
      `query Users($input:AdminUserSearchInput){adminUsers(input:$input){
        users{id email name role plan createdAt} total hasMore}}`,
      { input: { query: `cutover-`, plan: 'pro', page: 0, limit: 1 } },
    ).expect(200);
    expect(search.body.errors).toBeUndefined();
    expect(search.body.data.adminUsers).toMatchObject({
      users: [expect.objectContaining({ id: userId, plan: 'pro', role: 'USER' })], total: 1, hasMore: false,
    });
    const ids = await graphql(
      'query Ids($input:AdminUserIdsInput){adminUserIds(input:$input){ids}}',
      { input: { query: 'cutover-', plan: 'pro' } },
    ).expect(200);
    expect(ids.body.data.adminUserIds.ids).toEqual([userId]);
  });

  it('returns a read-only provider and background-job health snapshot', async () => {
    const result = await graphql(`{
      adminOperationsSnapshot {
        asOf status activeJobs retryingJobs actionRequiredJobs
        providers { id name status detail required }
        queues {
          id name status available queued processing retrying actionRequired active oldestPendingAt
        }
      }
    }`).expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.adminOperationsSnapshot).toMatchObject({
      providers: expect.arrayContaining([
        expect.objectContaining({ id: 'database', status: 'operational', required: true }),
      ]),
      queues: expect.arrayContaining([
        expect.objectContaining({ id: 'messages' }),
        expect.objectContaining({ id: 'stripe-reconciliation' }),
      ]),
    });
  });

  it('preserves requested batch order, deduplicates IDs, and validates bounds', async () => {
    const batch = await graphql(
      'query Batch($ids:[Int!]!){adminUsersByIds(ids:$ids){id email role plan}}',
      { ids: [secondUserId, userId, secondUserId] },
    ).expect(200);
    expect(batch.body.data.adminUsersByIds.map((user: { id: number }) => user.id)).toEqual([secondUserId, userId]);
    const invalid = await graphql(
      'query Batch($ids:[Int!]!){adminUsersByIds(ids:$ids){id}}', { ids: [0] },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', field: 'ids' });
  });

  it('requires CSRF and atomically updates every plan authority', async () => {
    const mutation = 'mutation Plan($plan:String!){updateAdminOwnPlan(plan:$plan){message plan}}';
    const blocked = await graphql(mutation, { plan: 'starter' }).expect(200);
    expect(blocked.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const updated = await graphql(mutation, { plan: 'starter' }, adminToken, true).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateAdminOwnPlan).toEqual({ message: 'Plan updated to starter', plan: 'starter' });
    const stored = await pool.query<{
      subscription_plan: string;
      organization_plan: string;
      entitlement_plan: string;
      subscription_status: string;
      contacts_limit: number;
    }>(
      `SELECT sp.name subscription_plan, op.name organization_plan,
              o.plan entitlement_plan, o.subscription_status, o.contacts_limit
       FROM organizations o JOIN subscriptions s ON s.organization_id=o.id
       JOIN subscription_plans sp ON sp.id=s.plan_id
       JOIN subscription_plans op ON op.id=o.current_plan_id WHERE o.id=$1`, [adminOrganizationId],
    );
    expect(stored.rows[0]).toEqual({
      subscription_plan: 'starter',
      organization_plan: 'starter',
      entitlement_plan: 'starter',
      subscription_status: 'active',
      contacts_limit: 5000,
    });
    const billing = await graphql(
      '{ billingStatus { plan subscriptionStatus contactsLimit } }',
    ).expect(200);
    expect(billing.body.errors).toBeUndefined();
    expect(billing.body.data.billingStatus).toEqual({
      plan: 'starter', subscriptionStatus: 'active', contactsLimit: 5000,
    });
    const rejected = await graphql(mutation, { plan: 'enterprise' }, adminToken, true).expect(200);
    expect(rejected.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const unchanged = await pool.query<{ plan: string }>(
      `SELECT sp.name plan FROM subscriptions s JOIN subscription_plans sp ON sp.id=s.plan_id
       WHERE s.organization_id=$1`, [adminOrganizationId],
    );
    expect(unchanged.rows[0].plan).toBe('starter');

    const freed = await graphql(mutation, { plan: 'free' }, adminToken, true).expect(200);
    expect(freed.body.errors).toBeUndefined();
    expect(freed.body.data.updateAdminOwnPlan).toEqual({
      message: 'Plan updated to free', plan: 'free',
    });
    const freeBilling = await graphql(
      '{ billingStatus { plan subscriptionStatus contactsLimit } }',
    ).expect(200);
    expect(freeBilling.body.data.billingStatus).toEqual({
      plan: 'free', subscriptionStatus: 'none', contactsLimit: 0,
    });
    const freeStored = await pool.query<{
      current_plan_id: number | null;
      subscription_row_status: string;
      override_events: number;
    }>(
      `SELECT o.current_plan_id, s.status subscription_row_status,
              (SELECT COUNT(*)::int FROM subscription_events event
               WHERE event.organization_id = o.id
                 AND event.event_type = 'admin_plan_override') override_events
       FROM organizations o
       JOIN subscriptions s ON s.organization_id = o.id
       WHERE o.id = $1`,
      [adminOrganizationId],
    );
    expect(freeStored.rows[0]).toEqual({
      current_plan_id: null,
      subscription_row_status: 'canceled',
      override_events: 2,
    });
  });
});
