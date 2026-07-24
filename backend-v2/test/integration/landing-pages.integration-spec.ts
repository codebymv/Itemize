import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Authenticated landing-pages REST/GraphQL PostgreSQL parity', () => {
  let graphqlApp: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let pageId: number;
  let firstSectionId: number;
  let secondSectionId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for landing-page tests');
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
       VALUES ($1, 'Landing Page Member', 'email', true),
              ($2, 'Landing Page Outsider', 'email', true)
       RETURNING id`,
      [
        `page-member-${suffix}@test.itemize`,
        `page-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, landing_pages_limit)
       VALUES ('Landing Page Org', $1, 20), ('Landing Page Outsider', $2, 20)
       RETURNING id`,
      [`pages-${suffix}`, `pages-outsider-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW()), ($3, $4, 'owner', NOW())`,
      [organizationId, memberId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $1::int THEN $2::int
         WHEN $3::int THEN $4::int
       END
       WHERE id = ANY($5::int[])`,
      [
        memberId,
        organizationId,
        outsiderId,
        outsiderOrganizationId,
        [memberId, outsiderId],
      ],
    );
    const page = await pool.query<{ id: number }>(
      `INSERT INTO pages (
         organization_id, name, description, slug, theme, settings, created_by
       ) VALUES (
         $1, 'Launch', 'Primary launch page', 'launch',
         '{"primaryColor":"#112233"}'::jsonb,
         '{"enableAnalytics":true}'::jsonb, $2
       ) RETURNING id`,
      [organizationId, memberId],
    );
    pageId = Number(page.rows[0].id);
    const sections = await pool.query<{ id: number }>(
      `INSERT INTO page_sections (
         page_id, organization_id, section_type, name, content, settings,
         section_order
       ) VALUES
         ($1, $2, 'hero', 'Hero', '{"heading":"Hello"}'::jsonb,
          '{"visible":true}'::jsonb, 0),
         ($1, $2, 'text', 'Body', '{"body":"Welcome"}'::jsonb,
          '{"visible":true}'::jsonb, 1)
       RETURNING id`,
      [pageId, organizationId],
    );
    [firstSectionId, secondSectionId] = sections.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO page_analytics (
         page_id, organization_id, visitor_id, session_id, device_type,
         referrer, utm_source, time_on_page, scroll_depth, converted, viewed_at
       ) VALUES
         ($1, $2, 'visitor-a', 'session-a', 'desktop', NULL, 'newsletter',
          20, 75, true, NOW()),
         ($1, $2, 'visitor-b', 'session-b', 'mobile', 'https://example.com',
          NULL, 10, 25, false, NOW())`,
      [pageId, organizationId],
    );

    memberToken = await jwt.signAsync(
      { id: memberId, name: 'Landing Page Member' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Landing Page Outsider' },
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

    const createPagesRouter = require('../../../backend/src/routes/pages.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/pages',
      createPagesRouter(
        pool,
        authenticateJWT,
        (_req: unknown, _res: unknown, next: () => void) => next(),
      ),
    );
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
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query: document, variables });

  const mutation = (
    token: string,
    organization: number,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'landing-pages-csrf';
    return request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query: document, variables });
  };

  const sectionFields =
    'id pageId organizationId sectionType name content settings sectionOrder';
  const pageFields = `
    id organizationId name description slug status theme settings viewCount
    uniqueVisitors createdBy createdByName sectionCount
    sections { ${sectionFields} }
  `;

  it('matches REST list/detail projections and keeps foreign pages private', async () => {
    const legacyList = await request(legacyApp)
      .get('/api/pages')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const target = await graphql(
      memberToken,
      organizationId,
      `query {
        landingPages(filter: { status: "draft", search: "Launch" }) {
          nodes { ${pageFields} }
          pageInfo { page pageSize total totalPages }
        }
        landingPage(id: ${pageId}) { ${pageFields} }
      }`,
    ).expect(200);
    expect(target.body.errors).toBeUndefined();
    const legacyPages = legacyList.body.data?.pages ?? legacyList.body.pages;
    const legacyPage = legacyPages.find(
      (page: { id: number }) => page.id === pageId,
    );
    expect(target.body.data.landingPages).toMatchObject({
      pageInfo: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      nodes: [
        expect.objectContaining({
          id: legacyPage.id,
          organizationId: legacyPage.organization_id,
          name: legacyPage.name,
          slug: legacyPage.slug,
          sectionCount: 2,
        }),
      ],
    });
    expect(target.body.data.landingPage).toMatchObject({
      id: pageId,
      description: 'Primary launch page',
      sections: [
        expect.objectContaining({ id: firstSectionId, sectionOrder: 0 }),
        expect.objectContaining({ id: secondSectionId, sectionOrder: 1 }),
      ],
    });

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query { landingPage(id: ${pageId}) { id } }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('creates unique generated slugs, rejects explicit conflicts, and requires CSRF', async () => {
    const created = await mutation(
      memberToken,
      organizationId,
      `mutation Create($input: CreateLandingPageInput!) {
        createLandingPage(input: $input) { ${pageFields} }
      }`,
      {
        input: {
          name: '  Launch  ',
          sections: [
            {
              sectionType: 'cta',
              name: 'Call to action',
              content: { heading: 'Join' },
            },
          ],
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createLandingPage).toMatchObject({
      name: 'Launch',
      slug: 'launch-1',
      status: 'draft',
      sections: [
        expect.objectContaining({ sectionType: 'cta', sectionOrder: 0 }),
      ],
    });

    const conflict = await mutation(
      memberToken,
      organizationId,
      `mutation {
        createLandingPage(input: { name: "Conflict", slug: "launch" }) { id }
      }`,
    ).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      field: 'slug',
    });

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation { deleteLandingPage(id: ${created.body.data.createLandingPage.id}) {
        deletedId
      } }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('replaces, adds, updates, reorders, and deletes sections atomically', async () => {
    const replaced = await mutation(
      memberToken,
      organizationId,
      `mutation Replace($pageId: Int!, $sections: [LandingPageSectionInput!]!) {
        replaceLandingPageSections(pageId: $pageId, sections: $sections) {
          sections { ${sectionFields} }
        }
      }`,
      {
        pageId,
        sections: [
          { sectionType: 'hero', content: { heading: 'New hero' } },
          { sectionType: 'text', content: { body: 'New body' } },
        ],
      },
    ).expect(200);
    expect(replaced.body.errors).toBeUndefined();
    const replacementIds = replaced.body.data.replaceLandingPageSections.sections.map(
      (section: { id: number }) => section.id,
    );

    const added = await mutation(
      memberToken,
      organizationId,
      `mutation {
        addLandingPageSection(
          pageId: ${pageId},
          input: { sectionType: "cta", name: "CTA", position: 1 }
        ) { ${sectionFields} }
      }`,
    ).expect(200);
    expect(added.body.data.addLandingPageSection).toMatchObject({
      name: 'CTA',
      sectionOrder: 1,
    });
    const addedId = added.body.data.addLandingPageSection.id;

    const updated = await mutation(
      memberToken,
      organizationId,
      `mutation {
        updateLandingPageSection(
          pageId: ${pageId}, sectionId: ${addedId},
          input: { name: "Updated CTA", content: { heading: "Act now" } }
        ) { name content }
      }`,
    ).expect(200);
    expect(updated.body.data.updateLandingPageSection).toEqual({
      name: 'Updated CTA',
      content: { heading: 'Act now' },
    });

    const orderedIds = [replacementIds[1], addedId, replacementIds[0]];
    const reordered = await mutation(
      memberToken,
      organizationId,
      `mutation Reorder($pageId: Int!, $sectionIds: [Int!]!) {
        reorderLandingPageSections(pageId: $pageId, sectionIds: $sectionIds) {
          sections { id sectionOrder }
        }
      }`,
      { pageId, sectionIds: orderedIds },
    ).expect(200);
    expect(reordered.body.errors).toBeUndefined();
    expect(reordered.body.data.reorderLandingPageSections.sections).toEqual(
      orderedIds.map((id, sectionOrder) => ({ id, sectionOrder })),
    );

    const mismatch = await mutation(
      memberToken,
      organizationId,
      `mutation Reorder($pageId: Int!, $sectionIds: [Int!]!) {
        reorderLandingPageSections(pageId: $pageId, sectionIds: $sectionIds) {
          sections { id }
        }
      }`,
      { pageId, sectionIds: [addedId] },
    ).expect(200);
    expect(mismatch.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'SECTION_SET_MISMATCH',
    });

    const emptyMismatch = await mutation(
      memberToken,
      organizationId,
      `mutation {
        reorderLandingPageSections(pageId: ${pageId}, sectionIds: []) {
          sections { id }
        }
      }`,
    ).expect(200);
    expect(emptyMismatch.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'SECTION_SET_MISMATCH',
    });

    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation {
        deleteLandingPageSection(pageId: ${pageId}, sectionId: ${addedId}) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(deleted.body.data.deleteLandingPageSection.deletedId).toBe(addedId);
  });

  it('updates publication state and returns bounded analytics aggregates', async () => {
    const updated = await mutation(
      memberToken,
      organizationId,
      `mutation {
        updateLandingPage(
          id: ${pageId},
          input: { status: "published", seoTitle: "Launch SEO" }
        ) { id status seoTitle publishedAt }
      }`,
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateLandingPage).toMatchObject({
      id: pageId,
      status: 'published',
      seoTitle: 'Launch SEO',
      publishedAt: expect.any(String),
    });

    const analytics = await graphql(
      memberToken,
      organizationId,
      `query {
        landingPageAnalytics(id: ${pageId}, period: 30) {
          period
          overall {
            totalViews uniqueVisitors averageTimeOnPage averageScrollDepth
            conversions
          }
          devices { deviceType count }
          referrers { referrer count }
          utmSources { utmSource count }
        }
      }`,
    ).expect(200);
    expect(analytics.body.errors).toBeUndefined();
    expect(analytics.body.data.landingPageAnalytics).toMatchObject({
      period: 30,
      overall: {
        totalViews: 2,
        uniqueVisitors: 2,
        averageTimeOnPage: 15,
        averageScrollDepth: 50,
        conversions: 1,
      },
      devices: expect.arrayContaining([
        { deviceType: 'desktop', count: 1 },
        { deviceType: 'mobile', count: 1 },
      ]),
      utmSources: [{ utmSource: 'newsletter', count: 1 }],
    });
  });

  it('sets and removes a bounded password while retaining public HTTP delivery', async () => {
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation {
        setLandingPagePassword(pageId: ${pageId}, password: "open-sesame") {
          pageId passwordProtected
        }
      }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const set = await mutation(
      memberToken,
      organizationId,
      `mutation {
        setLandingPagePassword(pageId: ${pageId}, password: "open-sesame") {
          pageId passwordProtected
        }
      }`,
    ).expect(200);
    expect(set.body.errors).toBeUndefined();
    expect(set.body.data.setLandingPagePassword).toEqual({
      pageId,
      passwordProtected: true,
    });
    const stored = await pool.query<{
      settings: Record<string, unknown>;
    }>('SELECT settings FROM pages WHERE id = $1', [pageId]);
    expect(stored.rows[0].settings).toMatchObject({ enableAnalytics: true });
    expect(stored.rows[0].settings.password).not.toBe('open-sesame');
    await expect(
      bcrypt.compare(
        'open-sesame',
        String(stored.rows[0].settings.password),
      ),
    ).resolves.toBe(true);
    const redacted = await graphql(
      memberToken,
      organizationId,
      `query {
        landingPage(id: ${pageId}) { settings passwordProtected }
      }`,
    ).expect(200);
    expect(redacted.body.data.landingPage).toEqual({
      settings: { enableAnalytics: true },
      passwordProtected: true,
    });
    const version = await mutation(
      memberToken,
      organizationId,
      `mutation {
        createLandingPageVersion(pageId: ${pageId}, description: "Protected") {
          content
        }
      }`,
    ).expect(200);
    expect(version.body.data.createLandingPageVersion.content).toMatchObject({
      settings: { enableAnalytics: true },
      password_protected: true,
    });
    expect(
      version.body.data.createLandingPageVersion.content.settings.password,
    ).toBeUndefined();

    await request(legacyApp)
      .get('/api/pages/public/page/launch')
      .set('x-page-password', 'wrong-password')
      .expect(401);
    await request(legacyApp)
      .get('/api/pages/public/page/launch')
      .set('x-page-password', 'open-sesame')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: pageId, slug: 'launch' });
      });

    const outsiderCsrf = 'outsider-page-password-csrf';
    const foreign = await request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        `itemize_auth=${outsiderToken}; csrf-token=${outsiderCsrf}`,
      )
      .set('x-csrf-token', outsiderCsrf)
      .set('x-organization-id', String(outsiderOrganizationId))
      .send({
        query: `mutation {
          removeLandingPagePassword(pageId: ${pageId}) {
            pageId passwordProtected
          }
        }`,
      })
      .expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const removed = await mutation(
      memberToken,
      organizationId,
      `mutation {
        removeLandingPagePassword(pageId: ${pageId}) {
          pageId passwordProtected
        }
      }`,
    ).expect(200);
    expect(removed.body.data.removeLandingPagePassword).toEqual({
      pageId,
      passwordProtected: false,
    });
    const after = await pool.query<{ settings: Record<string, unknown> }>(
      'SELECT settings FROM pages WHERE id = $1',
      [pageId],
    );
    expect(after.rows[0].settings).toEqual({ enableAnalytics: true });
  });

  it('duplicates complete drafts, enforces limits, and tenant-privately deletes', async () => {
    const duplicated = await mutation(
      memberToken,
      organizationId,
      `mutation {
        duplicateLandingPage(id: ${pageId}) { ${pageFields} }
      }`,
    ).expect(200);
    expect(duplicated.body.errors).toBeUndefined();
    expect(duplicated.body.data.duplicateLandingPage).toMatchObject({
      name: 'Launch Copy',
      slug: 'launch-copy',
      status: 'draft',
      sections: [
        expect.objectContaining({ sectionOrder: 0 }),
        expect.objectContaining({ sectionOrder: 1 }),
      ],
    });
    const duplicateId = duplicated.body.data.duplicateLandingPage.id;

    const count = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM pages WHERE organization_id = $1',
      [organizationId],
    );
    await pool.query(
      'UPDATE organizations SET landing_pages_limit = $1 WHERE id = $2',
      [count.rows[0].count, organizationId],
    );
    const limited = await mutation(
      memberToken,
      organizationId,
      `mutation { duplicateLandingPage(id: ${pageId}) { id } }`,
    ).expect(200);
    expect(limited.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
    });

    const foreignDelete = await mutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation { deleteLandingPage(id: ${duplicateId}) { deletedId } }`,
    ).expect(200);
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation { deleteLandingPage(id: ${duplicateId}) { deletedId } }`,
    ).expect(200);
    expect(deleted.body.data.deleteLandingPage.deletedId).toBe(duplicateId);
  });
});
