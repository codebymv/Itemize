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

describe('Landing-page version GraphQL PostgreSQL coverage', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let pageId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for page-version tests');
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
       VALUES ($1, 'Version Owner', 'email', true),
              ($2, 'Version Outsider', 'email', true)
       RETURNING id`,
      [
        `version-owner-${suffix}@test.itemize`,
        `version-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug, landing_pages_limit)
       VALUES ('Version Org', $1, 20), ('Version Outsider Org', $2, 20)
       RETURNING id`,
      [`version-${suffix}`, `version-outsider-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1,$2,'owner',NOW()), ($3,$4,'owner',NOW())`,
      [organizationId, memberId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id = CASE id
         WHEN $1::int THEN $2::int WHEN $3::int THEN $4::int END
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
         organization_id, name, description, slug, theme, settings,
         seo_title, seo_description, seo_keywords, og_image, favicon_url,
         custom_css, custom_js, custom_head, created_by
       ) VALUES (
         $1, 'Original', 'Original description', $2,
         '{"primaryColor":"#112233"}'::jsonb, '{"layout":"wide"}'::jsonb,
         'Original SEO', 'Original meta', 'one,two', 'https://img.test/og',
         'https://img.test/icon', '.original{}', 'window.original=true',
         '<meta name="original">', $3
       ) RETURNING id`,
      [organizationId, `original-${suffix}`, memberId],
    );
    pageId = Number(page.rows[0].id);
    await pool.query(
      `INSERT INTO page_sections (
         page_id, organization_id, section_type, name, content, settings,
         section_order
       ) VALUES (
         $1,$2,'hero','Original hero','{"heading":"Original"}'::jsonb,
         '{"visible":true}'::jsonb,0
       )`,
      [pageId, organizationId],
    );

    memberToken = await jwt.signAsync(
      { id: memberId, name: 'Version Owner' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Version Outsider' },
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

    const createVersionsRouter = require('../../../backend/src/routes/pageVersions.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const { requireOrganization } =
      require('../../../backend/src/middleware/organization')(pool);
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/pages',
      authenticateJWT,
      requireOrganization,
      createVersionsRouter(
        pool,
        authenticateJWT,
        requireOrganization,
      ),
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const graphql = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query, variables });

  const mutation = (
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'page-version-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${memberToken}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organizationId))
      .send({ query, variables });
  };

  const fields = `
    id pageId versionNumber content description createdBy createdByName
    publishedAt isCurrent createdAt
  `;

  it('creates complete snapshots and matches the retained list projection', async () => {
    const created = await mutation(
      `mutation Create($pageId: Int!, $description: String) {
        createLandingPageVersion(pageId: $pageId, description: $description) {
          ${fields}
        }
      }`,
      { pageId, description: '  Original snapshot  ' },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createLandingPageVersion).toMatchObject({
      pageId,
      versionNumber: 1,
      description: 'Original snapshot',
      createdBy: memberId,
      createdByName: null,
      content: {
        name: 'Original',
        description: 'Original description',
        theme: { primaryColor: '#112233' },
        settings: { layout: 'wide' },
        seo_title: 'Original SEO',
        custom_css: '.original{}',
        sections: [
          {
            section_type: 'hero',
            name: 'Original hero',
            content: { heading: 'Original' },
          },
        ],
      },
    });
    const versionId = created.body.data.createLandingPageVersion.id;

    const legacy = await request(legacyApp)
      .get(`/api/pages/${pageId}/versions`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const target = await graphql(
      memberToken,
      organizationId,
      `query {
        landingPageVersions(pageId: ${pageId}) {
          currentVersionId versions { ${fields} }
        }
        landingPageVersion(pageId: ${pageId}, versionId: ${versionId}) {
          ${fields}
        }
      }`,
    ).expect(200);
    expect(target.body.errors).toBeUndefined();
    const legacyBody = legacy.body.data ?? legacy.body;
    expect(target.body.data.landingPageVersions).toMatchObject({
      currentVersionId: legacyBody.currentVersionId ?? null,
      versions: [
        expect.objectContaining({
          id: legacyBody.versions[0].id,
          pageId: legacyBody.versions[0].page_id,
          versionNumber: legacyBody.versions[0].version_number,
        }),
      ],
    });
    expect(target.body.data.landingPageVersion.id).toBe(versionId);

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query { landingPageVersion(pageId: ${pageId}, versionId: ${versionId}) { id } }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('publishes the complete snapshot atomically, restores, and protects current state', async () => {
    const version = await pool.query<{ id: number }>(
      `SELECT id FROM page_versions WHERE page_id = $1 AND version_number = 1`,
      [pageId],
    );
    const versionId = Number(version.rows[0].id);
    await pool.query(
      `UPDATE pages SET
         name = 'Changed', description = 'Changed description',
         theme = '{"primaryColor":"#ffffff"}'::jsonb,
         settings = '{"layout":"compact"}'::jsonb,
         seo_title = 'Changed SEO', custom_css = '.changed{}'
       WHERE id = $1`,
      [pageId],
    );
    await pool.query(
      `UPDATE page_sections SET content = '{"heading":"Changed"}'::jsonb
       WHERE page_id = $1`,
      [pageId],
    );

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation {
        publishLandingPageVersion(pageId: ${pageId}, versionId: ${versionId}) {
          id
        }
      }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const published = await mutation(
      `mutation {
        publishLandingPageVersion(pageId: ${pageId}, versionId: ${versionId}) {
          ${fields}
        }
      }`,
    ).expect(200);
    expect(published.body.errors).toBeUndefined();
    expect(published.body.data.publishLandingPageVersion).toMatchObject({
      id: versionId,
      isCurrent: true,
      publishedAt: expect.any(String),
    });
    const page = await pool.query<{
      name: string;
      description: string;
      theme: Record<string, unknown>;
      settings: Record<string, unknown>;
      seo_title: string;
      custom_css: string;
      current_version_id: number;
      heading: string;
    }>(
      `SELECT p.name, p.description, p.theme, p.settings, p.seo_title,
              p.custom_css, p.current_version_id,
              s.content->>'heading' AS heading
       FROM pages p JOIN page_sections s ON s.page_id = p.id
       WHERE p.id = $1`,
      [pageId],
    );
    expect(page.rows[0]).toMatchObject({
      name: 'Original',
      description: 'Original description',
      theme: { primaryColor: '#112233' },
      settings: { layout: 'wide' },
      seo_title: 'Original SEO',
      custom_css: '.original{}',
      current_version_id: versionId,
      heading: 'Original',
    });

    const restored = await mutation(
      `mutation {
        restoreLandingPageVersion(pageId: ${pageId}, versionId: ${versionId}) {
          ${fields}
        }
      }`,
    ).expect(200);
    expect(restored.body.errors).toBeUndefined();
    expect(restored.body.data.restoreLandingPageVersion).toMatchObject({
      versionNumber: 102,
      description: 'Restored from version 1',
      createdBy: memberId,
      isCurrent: false,
    });
    const restoredId = restored.body.data.restoreLandingPageVersion.id;

    const currentDelete = await mutation(
      `mutation {
        deleteLandingPageVersion(pageId: ${pageId}, versionId: ${versionId}) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(currentDelete.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'CURRENT_VERSION',
    });
    const deleted = await mutation(
      `mutation {
        deleteLandingPageVersion(pageId: ${pageId}, versionId: ${restoredId}) {
          deletedId
        }
      }`,
    ).expect(200);
    expect(deleted.body.data.deleteLandingPageVersion.deletedId).toBe(restoredId);
    const remains = await pool.query(
      'SELECT 1 FROM page_versions WHERE id = $1',
      [restoredId],
    );
    expect(remains.rowCount).toBe(0);
  });
});
