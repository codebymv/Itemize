import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Onboarding GraphQL PostgreSQL contract', () => {
  let graphqlApp: NestExpressApplication;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for onboarding tests');
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
       VALUES ($1, 'Onboarding Member', 'email', true),
              ($2, 'Onboarding Outsider', 'email', true)
       RETURNING id`,
      [
        `onboarding-member-${suffix}@test.itemize`,
        `onboarding-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organization = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, plan, subscription_status)
       VALUES ('Onboarding Workspace', $1, 'free', 'none')
       RETURNING id`,
      [`onboarding-${suffix}`],
    );
    organizationId = Number(organization.rows[0].id);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
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
    graphqlApp = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(graphqlApp);
    await graphqlApp.init();

  });

  afterAll(async () => {
    if (pool && organizationId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (graphqlApp) await graphqlApp.close();
  });

  const query = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set(token === memberToken ? 'x-organization-id' : 'x-test-user-scope',
        token === memberToken ? String(organizationId) : 'true')
      .send({ query: document, variables });

  const mutation = (
    token: string,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'onboarding-csrf';
    return request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .send({ query: document, variables });
  };

  const progressFields =
    'featureKey seen timestamp version dismissed stepCompleted';

  it('guides Free and Solo accounts through their distinct first-value paths', async () => {
    const fields = 'id completed completedAt href';
    const free = await query(
      memberToken,
      `{ getStartedProgress {
        completedCount totalCount steps { ${fields} }
      } }`,
    ).expect(200);
    expect(free.body.errors).toBeUndefined();
    expect(free.body.data.getStartedProgress).toEqual({
      completedCount: 0,
      totalCount: 1,
      steps: [{ id: 'first_list', completed: false, completedAt: null, href: '/canvas' }],
    });

    await pool.query(
      `UPDATE organizations
       SET plan = 'starter', subscription_status = 'trialing',
           trial_ends_at = NOW() + INTERVAL '14 days'
       WHERE id = $1`,
      [organizationId],
    );
    await pool.query(
      `INSERT INTO get_started_milestones (
         organization_id, name, user_id, source, dedupe_key
       ) VALUES ($1, 'first_contact', $2, 'create_contact', $3)`,
      [organizationId, memberId, `${organizationId}:first_contact:first`],
    );
    const estimate = await pool.query<{ id: number }>(
      `INSERT INTO estimates (
         organization_id, estimate_number, valid_until, created_by
       ) VALUES ($1, 'EST-ONBOARDING', CURRENT_DATE + 7, $2)
       RETURNING id`,
      [organizationId, memberId],
    );
    const estimateId = Number(estimate.rows[0].id);

    const readyToSend = await query(
      memberToken,
      `{ getStartedProgress {
        completedCount totalCount steps { ${fields} }
      } }`,
    ).expect(200);
    expect(readyToSend.body.errors).toBeUndefined();
    expect(readyToSend.body.data.getStartedProgress).toMatchObject({
      completedCount: 2,
      totalCount: 3,
      steps: [
        { id: 'first_contact', completed: true, href: '/contacts' },
        { id: 'first_artifact', completed: true, href: '/estimates/new' },
        { id: 'first_send', completed: false, href: '/estimates' },
      ],
    });

    await pool.query(
      `INSERT INTO activation_events (
         organization_id, user_id, event_name, artifact_type, artifact_id,
         source, dedupe_key
       ) VALUES ($1, $2, 'artifact_sent', 'estimate', $3,
         'estimate_email_delivered', $4)`,
      [
        organizationId,
        memberId,
        estimateId,
        `${organizationId}:artifact_sent:estimate:${estimateId}`,
      ],
    );
    const activated = await query(
      memberToken,
      `{ getStartedProgress { completedCount totalCount steps { ${fields} } } }`,
    ).expect(200);
    expect(activated.body.errors).toBeUndefined();
    expect(activated.body.data.getStartedProgress).toMatchObject({
      completedCount: 3,
      totalCount: 3,
      steps: [{ completed: true }, { completed: true }, { completed: true }],
    });
  });

  it('returns empty progress and explicit unseen feature semantics', async () => {
    const target = await query(
      memberToken,
      `{ onboardingProgress { ${progressFields} }
         onboardingFeatureProgress(featureKey: "dashboard") {
           ${progressFields}
         } }`,
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    expect(target.body.data.onboardingProgress).toEqual([]);
    expect(target.body.data.onboardingFeatureProgress).toEqual({
      featureKey: 'dashboard',
      seen: false,
      timestamp: null,
      version: null,
      dismissed: false,
      stepCompleted: null,
    });
  });

  it('persists seen, step, dismissal, and reset with durable events', async () => {
    const seen = await mutation(
      memberToken,
      `mutation Seen($input: MarkOnboardingSeenInput!) {
        markOnboardingSeen(input: $input) { ${progressFields} }
      }`,
      { input: { featureKey: 'dashboard', version: '2.0' } },
    ).expect(200);
    expect(seen.body.errors).toBeUndefined();
    expect(seen.body.data.markOnboardingSeen[0]).toMatchObject({
      featureKey: 'dashboard',
      seen: true,
      version: '2.0',
      dismissed: false,
    });

    const completed = await mutation(
      memberToken,
      `mutation Step($featureKey: String!, $step: Int!) {
        completeOnboardingStep(featureKey: $featureKey, step: $step) {
          ${progressFields}
        }
      }`,
      { featureKey: 'dashboard', step: 2 },
    ).expect(200);
    expect(completed.body.data.completeOnboardingStep[0].stepCompleted).toBe(2);

    const dismissed = await mutation(
      memberToken,
      `mutation Dismiss($featureKey: String!) {
        dismissOnboarding(featureKey: $featureKey) { ${progressFields} }
      }`,
      { featureKey: 'dashboard' },
    ).expect(200);
    expect(dismissed.body.data.dismissOnboarding[0]).toMatchObject({
      seen: true,
      dismissed: true,
      stepCompleted: 2,
    });

    const evidence = await pool.query<{ event_type: string }>(
      `SELECT event_type
       FROM onboarding_events
       WHERE user_id = $1
       ORDER BY id`,
      [memberId],
    );
    expect(evidence.rows.map((row) => row.event_type)).toEqual([
      'viewed',
      'step_completed',
      'dismissed',
    ]);

    const reset = await mutation(
      memberToken,
      `mutation Reset($featureKey: String) {
        resetOnboarding(featureKey: $featureKey) { featureKey }
      }`,
      { featureKey: 'dashboard' },
    ).expect(200);
    expect(reset.body.data.resetOnboarding).toEqual([]);
  });

  it('serializes concurrent feature updates without losing either feature', async () => {
    const mark = (featureKey: string) =>
      mutation(
        memberToken,
        `mutation Seen($input: MarkOnboardingSeenInput!) {
          markOnboardingSeen(input: $input) { featureKey seen }
        }`,
        { input: { featureKey } },
      );
    const results = await Promise.all([mark('canvas'), mark('pages')]);
    expect(results.every((result) => !result.body.errors)).toBe(true);

    const progress = await query(
      memberToken,
      '{ onboardingProgress { featureKey seen } }',
    ).expect(200);
    expect(progress.body.data.onboardingProgress).toEqual([
      { featureKey: 'canvas', seen: true },
      { featureKey: 'pages', seen: true },
    ]);
  });

  it('is user-scoped and enforces validation and CSRF', async () => {
    const outsider = await query(
      outsiderToken,
      '{ onboardingProgress { featureKey } }',
    ).expect(200);
    expect(outsider.body.data.onboardingProgress).toEqual([]);

    const invalid = await mutation(
      memberToken,
      `mutation {
        markOnboardingSeen(input: { featureKey: "__proto__" }) { featureKey }
      }`,
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'featureKey',
    });

    const noCsrf = await query(
      memberToken,
      `mutation {
        dismissOnboarding(featureKey: "canvas") { featureKey }
      }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });
});
