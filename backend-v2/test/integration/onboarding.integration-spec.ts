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

describe('Onboarding REST/GraphQL PostgreSQL parity', () => {
  let graphqlApp: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
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

    const createOnboardingRouter = require('../../../backend/src/routes/onboarding.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/onboarding',
      createOnboardingRouter(pool, authenticateJWT),
    );
  });

  afterAll(async () => {
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

  it('matches empty progress and explicit unseen feature semantics', async () => {
    const legacy = await request(legacyApp)
      .get('/api/onboarding/progress')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .expect(200);
    const target = await query(
      memberToken,
      `{ onboardingProgress { ${progressFields} }
         onboardingFeatureProgress(featureKey: "dashboard") {
           ${progressFields}
         } }`,
    ).expect(200);

    expect(legacy.body.data).toEqual({});
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
