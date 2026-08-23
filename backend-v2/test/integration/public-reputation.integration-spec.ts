import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Public reputation retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;
  let widgetKey: string;

  const tokens = {
    read: crypto.randomBytes(32).toString('hex'),
    nestSubmit: crypto.randomBytes(32).toString('hex'),
    legacySubmit: crypto.randomBytes(32).toString('hex'),
    completed: crypto.randomBytes(32).toString('hex'),
    unknown: crypto.randomBytes(32).toString('hex'),
  };

  const seedRequest = async (token: string, status = 'sent') => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO review_requests (
         organization_id, contact_email, contact_name, channel,
         preferred_platform, redirect_url, status, unique_token
       ) VALUES ($1, 'reviewer@test.itemize', 'Review Contact', 'email',
                 'google', 'https://reviews.example.com', $2, $3)
       RETURNING id`,
      [organizationId, status, token],
    );
    return Number(inserted.rows[0].id);
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for public reputation tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    const createReputationRouter = require('../../../backend/src/routes/reputation.routes');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `public-reputation-owner-${Date.now()}@test.itemize`,
      'Reputation Owner',
    );
    organizationId = owner.org.id;

    widgetKey = crypto.randomBytes(16).toString('hex');
    await pool.query(
      `INSERT INTO review_widgets (organization_id, widget_key, name, hide_no_text_reviews)
       VALUES ($1, $2, 'Homepage widget', TRUE)`,
      [organizationId, widgetKey],
    );
    await pool.query(
      `INSERT INTO reviews (
         organization_id, platform, rating, review_text, reviewer_name, status, source
       ) VALUES
         ($1, 'google', 5, 'Visible review', 'Happy Customer', 'new', 'manual'),
         ($1, 'google', 2, 'Below threshold', 'Grumpy Customer', 'new', 'manual'),
         ($1, 'google', 5, 'Hidden review', 'Hidden Customer', 'hidden', 'manual'),
         ($1, 'google', 5, NULL, 'Silent Customer', 'new', 'manual')`,
      [organizationId],
    );
    await seedRequest(tokens.read);
    await seedRequest(tokens.nestSubmit);
    await seedRequest(tokens.legacySubmit);
    await seedRequest(tokens.completed, 'completed');

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

    const noopLimit = (_req: Request, _res: Response, next: NextFunction) =>
      next();
    legacyApp = express();
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/reputation',
      createReputationRouter(pool, null, noopLimit),
    );
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  const bothGet = async (path: string) => {
    const [nest, legacy] = await Promise.all([
      request(app.getHttpServer()).get(path),
      request(legacyApp).get(path),
    ]);
    return { nest, legacy };
  };

  it('serves the widget projection identically and applies the review filters', async () => {
    const { nest, legacy } = await bothGet(
      `/api/reputation/public/widget/${widgetKey}`,
    );
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual(legacy.body);
    expect(nest.headers['cache-control']).toBe('no-store');
    expect(nest.body.reviews).toHaveLength(1);
    expect(nest.body.reviews[0].review_text).toBe('Visible review');
    expect(JSON.stringify(nest.body)).not.toContain('Hidden review');
    expect(nest.body.config).not.toHaveProperty('min_rating');
  });

  it('conceals malformed, unknown, and inactive widgets identically', async () => {
    for (const key of ['not-a-key', crypto.randomBytes(16).toString('hex')]) {
      const { nest, legacy } = await bothGet(
        `/api/reputation/public/widget/${key}`,
      );
      expect(nest.status).toBe(404);
      expect(legacy.status).toBe(404);
      expect(nest.body).toEqual(legacy.body);
    }
  });

  it('serves the review request projection identically and marks the click once', async () => {
    const { nest, legacy } = await bothGet(
      `/api/reputation/public/review/${tokens.read}`,
    );
    expect(nest.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(nest.body).toEqual(legacy.body);
    expect(nest.body).toEqual({
      organization_name: expect.any(String),
      contact_name: 'Review Contact',
      preferred_platform: 'google',
    });
    const row = await pool.query(
      `SELECT clicked, status, clicked_at
       FROM review_requests WHERE unique_token = $1`,
      [tokens.read],
    );
    expect(row.rows[0].clicked).toBe(true);
    expect(row.rows[0].status).toBe('clicked');
  });

  it('conceals malformed, unknown, and completed review requests identically', async () => {
    for (const token of ['not-a-token', tokens.unknown, tokens.completed]) {
      const { nest, legacy } = await bothGet(
        `/api/reputation/public/review/${token}`,
      );
      expect(nest.status).toBe(404);
      expect(legacy.status).toBe(404);
      expect(nest.body).toEqual(legacy.body);
    }
  });

  it('rejects invalid submissions identically', async () => {
    for (const body of [
      { rating: 0 },
      { rating: 5, review_text: 'x'.repeat(5001) },
      { rating: 5, platform: 'myspace' },
    ]) {
      const [nest, legacy] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/reputation/public/review/${tokens.nestSubmit}`)
          .send(body),
        request(legacyApp)
          .post(`/api/reputation/public/review/${tokens.legacySubmit}`)
          .send(body),
      ]);
      expect(nest.status).toBe(400);
      expect(legacy.status).toBe(400);
      expect(nest.body).toEqual(legacy.body);
    }
  });

  it('completes a request once with derived sentiment and denies replay identically', async () => {
    const nest = await request(app.getHttpServer())
      .post(`/api/reputation/public/review/${tokens.nestSubmit}`)
      .send({ rating: 5, review_text: 'Wonderful', platform: 'google' })
      .expect(200);
    expect(nest.body).toEqual({
      success: true,
      redirect_url: 'https://reviews.example.com',
    });

    const legacy = await request(legacyApp)
      .post(`/api/reputation/public/review/${tokens.legacySubmit}`)
      .send({ rating: 2 })
      .expect(200);
    expect(legacy.body).toEqual({ success: true, redirect_url: null });

    const rows = await pool.query(
      `SELECT r.rating, r.sentiment, r.source, r.platform, rr.status, rr.rating_given
       FROM review_requests rr
       JOIN reviews r ON r.id = rr.review_id
       WHERE rr.unique_token = ANY($1::text[])
       ORDER BY r.rating DESC`,
      [[tokens.nestSubmit, tokens.legacySubmit]],
    );
    expect(rows.rows).toEqual([
      expect.objectContaining({
        rating: 5,
        sentiment: 'positive',
        source: 'request',
        platform: 'google',
        status: 'completed',
        rating_given: 5,
      }),
      expect.objectContaining({
        rating: 2,
        sentiment: 'negative',
        status: 'completed',
      }),
    ]);

    const replays = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/reputation/public/review/${tokens.nestSubmit}`)
        .send({ rating: 4 }),
      request(legacyApp)
        .post(`/api/reputation/public/review/${tokens.nestSubmit}`)
        .send({ rating: 4 }),
    ]);
    expect(replays[0].status).toBe(404);
    expect(replays[1].status).toBe(404);
    expect(replays[0].body).toEqual(replays[1].body);
  });
});
