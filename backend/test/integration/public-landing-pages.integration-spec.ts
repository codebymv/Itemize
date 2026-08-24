import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';
import express, { Express, NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Public landing pages (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let organizationId: number;

  const suffix = `${Date.now()}-${process.pid}`;
  const slugs = {
    open: `parity-open-${suffix}`,
    hashedPassword: `parity-hashed-${suffix}`,
    plainPassword: `parity-plain-${suffix}`,
    expired: `parity-expired-${suffix}`,
    noAnalytics: `parity-quiet-${suffix}`,
    draft: `parity-draft-${suffix}`,
  };
  const pageIds: Record<string, number> = {};

  const seedPage = async (
    slug: string,
    settings: Record<string, unknown> | null,
    status = 'published',
  ) => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO pages (organization_id, name, slug, status, seo_title, settings)
       VALUES ($1, $2, $3, $4, 'SEO title', $5::jsonb)
       RETURNING id`,
      [organizationId, `Page ${slug}`, slug, status, JSON.stringify(settings ?? {})],
    );
    const id = Number(inserted.rows[0].id);
    await pool.query(
      `INSERT INTO page_sections (page_id, organization_id, section_type, name, content, settings, section_order)
       VALUES ($1, $2, 'hero', 'Hero', '{"headline":"Hi"}'::jsonb, '{}'::jsonb, 0)`,
      [id, organizationId],
    );
    return id;
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for public landing page tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    const bcrypt = require('bcryptjs');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    const owner = await dbHelper.seedUser(
      `public-pages-owner-${Date.now()}@test.itemize`,
      'Pages Owner',
    );
    organizationId = owner.org.id;

    pageIds.open = await seedPage(slugs.open, null);
    pageIds.hashedPassword = await seedPage(slugs.hashedPassword, {
      password: await bcrypt.hash('open-sesame', 4),
    });
    pageIds.plainPassword = await seedPage(slugs.plainPassword, {
      password: 'plain-secret',
    });
    pageIds.expired = await seedPage(slugs.expired, {
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    pageIds.noAnalytics = await seedPage(slugs.noAnalytics, {
      enableAnalytics: false,
    });
    pageIds.draft = await seedPage(slugs.draft, null, 'draft');

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
  }, 60000);

  afterAll(async () => {
    if (pool && organizationId) {
      await pool.query(
        'DELETE FROM page_analytics WHERE organization_id = $1',
        [organizationId],
      );
    }
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  const getPage = async (
    path: string,
    configure?: (req: request.Test) => request.Test,
  ) => {
    const req = request(app.getHttpServer()).get(path);
    return configure ? configure(req) : req;
  };

  it('serves a published page and records the visit', async () => {
    const nest = await getPage(
      `/api/pages/public/page/${slugs.open}?utm_source=news`,
      (req) =>
        req
          .set('user-agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/126')
          .set('Cookie', 'visitor_id=parity-visitor')
          .set('referer', 'https://ref.example.com'),
    );
    expect(nest.status).toBe(200);
    expect(nest.body).toMatchObject({
      id: pageIds.open,
      slug: slugs.open,
      seo_title: 'SEO title',
      sections: [expect.objectContaining({ section_type: 'hero' })],
    });
    expect(nest.body).not.toHaveProperty('settings');

    const visits = await pool.query(
      `SELECT visitor_id, utm_source, referrer, device_type, browser, os
       FROM page_analytics WHERE page_id = $1`,
      [pageIds.open],
    );
    expect(visits.rows).toHaveLength(1);
    for (const visit of visits.rows) {
      expect(visit).toMatchObject({
        visitor_id: 'parity-visitor',
        utm_source: 'news',
        referrer: 'https://ref.example.com',
        device_type: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
      });
    }
    const counted = await pool.query(
      'SELECT view_count FROM pages WHERE id = $1',
      [pageIds.open],
    );
    expect(Number(counted.rows[0].view_count)).toBe(1);
  });

  it('conceals unknown and unpublished pages', async () => {
    for (const slug of ['never-existed', slugs.draft]) {
      const nest = await getPage(`/api/pages/public/page/${slug}`);
      expect(nest.status).toBe(404);
    }
  });

  it('enforces hashed and legacy plaintext passwords', async () => {
    const missing = await getPage(
      `/api/pages/public/page/${slugs.hashedPassword}`,
    );
    expect(missing.status).toBe(401);
    
    const wrong = await getPage(
      `/api/pages/public/page/${slugs.hashedPassword}`,
      (req) => req.set('x-page-password', 'nope'),
    );
    expect(wrong.status).toBe(401);
    
    const viaHeader = await getPage(
      `/api/pages/public/page/${slugs.hashedPassword}`,
      (req) => req.set('x-page-password', 'open-sesame'),
    );
    expect(viaHeader.status).toBe(200);
    
    const viaQuery = await getPage(
      `/api/pages/public/page/${slugs.plainPassword}?password=plain-secret`,
    );
    expect(viaQuery.status).toBe(200);
      });

  it('reports an expired page as gone', async () => {
    const nest = await getPage(
      `/api/pages/public/page/${slugs.expired}`,
    );
    expect(nest.status).toBe(410);
  });

  it('skips analytics when the page disables them', async () => {
    const nest = await getPage(
      `/api/pages/public/page/${slugs.noAnalytics}`,
    );
    expect(nest.status).toBe(200);
    const visits = await pool.query(
      'SELECT id FROM page_analytics WHERE page_id = $1',
      [pageIds.noAnalytics],
    );
    expect(visits.rows).toHaveLength(0);
  });

  it('validates and applies the analytics beacon identically', async () => {
    const invalid = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/pages/public/page/${slugs.open}/analytics`)
        .send({ visitor_id: 'v' }),
      request(app.getHttpServer())
        .post(`/api/pages/public/page/${slugs.open}/analytics`)
        .send({ visitor_id: 'v' }),
    ]);
    expect(invalid[0].status).toBe(400);
    expect(invalid[1].status).toBe(400);
    expect(invalid[0].body).toEqual(invalid[1].body);

    const visitorId = `beacon-${crypto.randomBytes(4).toString('hex')}`;
    const sessionId = `session-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO page_analytics (page_id, organization_id, visitor_id, session_id, scroll_depth)
       VALUES ($1, $2, $3, $4, 40)`,
      [pageIds.open, organizationId, visitorId, sessionId],
    );

    const updated = await request(app.getHttpServer())
      .post(`/api/pages/public/page/${slugs.open}/analytics`)
      .send({
        visitor_id: visitorId,
        session_id: sessionId,
        time_on_page: 33,
        scroll_depth: 20,
        converted: true,
        conversion_type: 'signup',
      })
      .expect(200);
    expect(updated.body).toEqual({ success: true });

    const row = await pool.query(
      `SELECT time_on_page, scroll_depth, converted, conversion_type, left_at
       FROM page_analytics WHERE visitor_id = $1 AND session_id = $2`,
      [visitorId, sessionId],
    );
    expect(row.rows[0]).toMatchObject({
      time_on_page: 33,
      scroll_depth: 40,
      converted: true,
      conversion_type: 'signup',
    });
    expect(row.rows[0].left_at).not.toBeNull();

    const legacyUpdated = await request(app.getHttpServer())
      .post(`/api/pages/public/page/${slugs.open}/analytics`)
      .send({ visitor_id: visitorId, session_id: sessionId, scroll_depth: 90 })
      .expect(200);
    expect(legacyUpdated.body).toEqual({ success: true });
    const raised = await pool.query(
      `SELECT scroll_depth FROM page_analytics WHERE visitor_id = $1 AND session_id = $2`,
      [visitorId, sessionId],
    );
    expect(raised.rows[0].scroll_depth).toBe(90);
  });
});
