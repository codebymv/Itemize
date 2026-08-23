import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PublicLandingPagesController } from './public-landing-pages.controller';
import { PublicLandingPagesRepository } from './public-landing-pages.repository';
import {
  parseDeviceInfo,
  PublicLandingPagesService,
} from './public-landing-pages.service';

const pageRow = (settings: Record<string, unknown> | null = null) => ({
  id: 7,
  organization_id: 3,
  name: 'Launch',
  slug: 'launch',
  seo_title: 'Launch title',
  seo_description: null,
  seo_keywords: null,
  og_image: null,
  favicon_url: null,
  theme: 'light',
  custom_css: null,
  custom_js: null,
  custom_head: null,
  settings,
  organization_name: 'Acme',
});

describe('PublicLandingPagesController retained HTTP contract', () => {
  let app: INestApplication;
  const repository = {
    publishedPage: jest.fn(),
    pageSections: jest.fn(),
    recordVisit: jest.fn(),
    updateAnalytics: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicLandingPagesController],
      providers: [
        PublicLandingPagesService,
        { provide: PublicLandingPagesRepository, useValue: repository },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.pageSections.mockResolvedValue([]);
    repository.recordVisit.mockResolvedValue(undefined);
  });

  it('serves a published page and records the visit with device evidence', async () => {
    repository.publishedPage.mockResolvedValue(pageRow());
    repository.pageSections.mockResolvedValue([
      { id: 1, section_type: 'hero', name: null, content: {}, settings: {}, section_order: 0 },
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch?utm_source=news&utm_campaign=aug')
      .set('user-agent', 'Mozilla/5.0 (iPhone) Safari/605.1')
      .set('referer', 'https://ref.example.com')
      .set('Cookie', 'visitor_id=visitor-123')
      .expect(200);
    expect(response.body).toMatchObject({
      id: 7,
      slug: 'launch',
      organization_name: 'Acme',
      sections: [expect.objectContaining({ section_type: 'hero' })],
    });
    expect(response.body).not.toHaveProperty('settings');
    const [pageId, organizationId, visit] = repository.recordVisit.mock.calls[0];
    expect(pageId).toBe(7);
    expect(organizationId).toBe(3);
    expect(visit).toMatchObject({
      visitorId: 'visitor-123',
      referrer: 'https://ref.example.com',
      utmSource: 'news',
      utmCampaign: 'aug',
      utmMedium: null,
      deviceType: 'mobile',
      browser: 'Safari',
      os: 'iOS',
    });
    expect(visit.sessionId).toMatch(/^[a-f0-9]{16}$/);
  });

  it('generates a visitor id when no cookie is present', async () => {
    repository.publishedPage.mockResolvedValue(pageRow());
    await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(200);
    const [, , visit] = repository.recordVisit.mock.calls[0];
    expect(visit.visitorId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('skips analytics when the page disables them', async () => {
    repository.publishedPage.mockResolvedValue(
      pageRow({ enableAnalytics: false }),
    );
    await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(200);
    expect(repository.recordVisit).not.toHaveBeenCalled();
  });

  it('conceals unpublished pages as not found', async () => {
    repository.publishedPage.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(404);
    expect(response.body).toEqual({ error: 'Page not found' });
  });

  it('enforces the password capability with hashed and legacy values', async () => {
    const hashed = await bcrypt.hash('open-sesame', 4);
    repository.publishedPage.mockResolvedValue(pageRow({ password: hashed }));

    const missing = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(401);
    expect(missing.body).toEqual({
      error: 'Password required',
      password_protected: true,
    });

    const wrong = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .set('x-page-password', 'nope')
      .expect(401);
    expect(wrong.body).toEqual({
      error: 'Invalid password',
      password_protected: true,
    });
    expect(repository.recordVisit).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .set('x-page-password', 'open-sesame')
      .expect(200);

    repository.publishedPage.mockResolvedValue(
      pageRow({ password: 'plain-secret' }),
    );
    await request(app.getHttpServer())
      .get('/api/pages/public/page/launch?password=plain-secret')
      .expect(200);
  });

  it('reports an expired page as gone', async () => {
    repository.publishedPage.mockResolvedValue(
      pageRow({ expiresAt: '2020-01-01T00:00:00.000Z' }),
    );
    const response = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(410);
    expect(response.body).toEqual({ error: 'Page has expired' });
  });

  it('maps page read failures to the retained plain error shape', async () => {
    repository.publishedPage.mockRejectedValue(new Error('boom'));
    const response = await request(app.getHttpServer())
      .get('/api/pages/public/page/launch')
      .expect(500);
    expect(response.body).toEqual({ error: 'Failed to fetch page' });
  });

  it('requires visitor and session identifiers for the analytics beacon', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/pages/public/page/launch/analytics')
      .send({ visitor_id: 'v' })
      .expect(400);
    expect(response.body).toEqual({ error: 'Visitor and session IDs required' });
    expect(repository.updateAnalytics).not.toHaveBeenCalled();
  });

  it('updates analytics and returns the retained success shape', async () => {
    repository.updateAnalytics.mockResolvedValue(undefined);
    const response = await request(app.getHttpServer())
      .post('/api/pages/public/page/launch/analytics')
      .send({
        visitor_id: 'v-1',
        session_id: 's-1',
        time_on_page: 12,
        scroll_depth: 80,
        converted: true,
        conversion_type: 'signup',
      })
      .expect(200);
    expect(response.body).toEqual({ success: true });
    expect(repository.updateAnalytics).toHaveBeenCalledWith({
      visitorId: 'v-1',
      sessionId: 's-1',
      timeOnPage: 12,
      scrollDepth: 80,
      converted: true,
      conversionType: 'signup',
      conversionValue: null,
    });
  });

  it('maps analytics failures to the retained plain error shape', async () => {
    repository.updateAnalytics.mockRejectedValue(new Error('boom'));
    const response = await request(app.getHttpServer())
      .post('/api/pages/public/page/launch/analytics')
      .send({ visitor_id: 'v-1', session_id: 's-1' })
      .expect(500);
    expect(response.body).toEqual({ error: 'Failed to update analytics' });
  });
});

describe('parseDeviceInfo', () => {
  it('classifies common user agents like the retained implementation', () => {
    expect(parseDeviceInfo('Mozilla/5.0 (Windows NT 10.0) Chrome/126')).toEqual({
      deviceType: 'desktop',
      browser: 'Chrome',
      os: 'Windows',
    });
    expect(parseDeviceInfo('Mozilla/5.0 (iPad; CPU OS 17) Safari/605')).toEqual({
      deviceType: 'tablet',
      browser: 'Safari',
      os: 'iOS',
    });
    expect(parseDeviceInfo(null)).toEqual({
      deviceType: 'desktop',
      browser: 'unknown',
      os: 'unknown',
    });
  });
});
