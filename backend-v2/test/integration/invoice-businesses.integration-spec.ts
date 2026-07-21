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
import { InvoiceLogoCleanupService } from '../../src/invoice-logo-cleanup/invoice-logo-cleanup.service';
import {
  INVOICE_LOGO_STORAGE, InvoiceLogoStorage,
} from '../../src/invoice-logo-cleanup/invoice-logo-storage.provider';

describe('Invoice business GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let logoCleanupService: InvoiceLogoCleanupService;
  let logoStorage: InvoiceLogoStorage;
  const uploadedLogoUrls: string[] = [];
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for business tests');
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
       VALUES ($1, 'Business Member', 'email', true),
              ($2, 'Business Outsider', 'email', true)
       RETURNING id`,
      [
        `business-member-${suffix}@test.itemize`,
        `business-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Business Primary', $1), ('Business Other', $2)
       RETURNING id`,
      [`business-primary-${suffix}`, `business-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id
       END
       WHERE id = ANY($5::int[])`,
      [
        organizationId,
        outsiderOrganizationId,
        memberId,
        outsiderId,
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    logoCleanupService = moduleRef.get(InvoiceLogoCleanupService);
    logoStorage = moduleRef.get(INVOICE_LOGO_STORAGE);
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

    const createBusinessRouter = require('../../../backend/src/routes/invoices/businesses.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    const { requireOrganization } =
      require('../../../backend/src/middleware/organization')(pool);
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/invoices',
      createBusinessRouter({ pool, authenticateJWT, requireOrganization }),
    );
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [memberId, outsiderId].filter(Boolean),
      ]);
    }
    for (const url of uploadedLogoUrls) await logoStorage?.remove(url);
    if (app) await app.close();
  });

  const graphql = (
    token: string,
    orgId: number,
    document: string,
    variables: Record<string, unknown> = {},
    csrf = true,
  ) => {
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        csrf
          ? `itemize_auth=${token}; csrf-token=business-csrf`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'business-csrf');
    return call.send({ query: document, variables });
  };

  const legacy = (
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    token = memberToken,
    orgId = organizationId,
  ) =>
    request(legacyApp)
      [method](path)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));

  const fields = `
    id organizationId name email phone address taxId logoUrl isActive
    lastUsedAt createdAt updatedAt
  `;

  it('characterizes active-only REST listing, ordering, and soft deletion', async () => {
    const older = await legacy('post', '/api/invoices/businesses')
      .send({
        name: 'Legacy older',
        email: 'older@test.itemize',
        logo_url: 'https://attacker.invalid/logo.png',
      })
      .expect(201);
    const newer = await legacy('post', '/api/invoices/businesses')
      .send({ name: 'Legacy selected' })
      .expect(201);
    const olderId = Number(older.body.data.id);
    const newerId = Number(newer.body.data.id);
    expect(older.body.data.logo_url).toBeNull();
    await pool.query(
      `UPDATE businesses
       SET last_used_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [olderId, organizationId],
    );

    const listed = await legacy(
      'get',
      '/api/invoices/businesses',
    ).expect(200);
    expect(listed.body.data.slice(0, 2).map(
      (business: { id: number }) => Number(business.id),
    )).toEqual([olderId, newerId]);

    await legacy(
      'put',
      `/api/invoices/businesses/${olderId}`,
      outsiderToken,
      outsiderOrganizationId,
    )
      .send({ name: 'Stolen' })
      .expect(404);
    await legacy(
      'delete',
      `/api/invoices/businesses/${newerId}`,
    ).expect(200);
    const persisted = await pool.query<{ is_active: boolean }>(
      'SELECT is_active FROM businesses WHERE id = $1',
      [newerId],
    );
    expect(persisted.rows[0].is_active).toBe(false);
  });

  it('keeps GraphQL CRUD interoperable with REST and logo ownership retained', async () => {
    const created = await graphql(
      memberToken,
      organizationId,
      `mutation Create($input: CreateInvoiceBusinessInput!) {
        createInvoiceBusiness(input: $input) { ${fields} }
      }`,
      {
        input: {
          name: ' Itemize Studio ',
          email: ' billing@itemize.test ',
          phone: ' ',
          address: ' Phoenix, AZ ',
          taxId: ' EIN-123 ',
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createInvoiceBusiness).toMatchObject({
      organizationId,
      name: 'Itemize Studio',
      email: 'billing@itemize.test',
      phone: null,
      address: 'Phoenix, AZ',
      taxId: 'EIN-123',
      logoUrl: null,
      isActive: true,
    });
    const id = Number(created.body.data.createInvoiceBusiness.id);
    await pool.query(
      `UPDATE businesses
       SET logo_url = '/uploads/logos/retained.png'
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId],
    );

    const restRead = await legacy(
      'get',
      `/api/invoices/businesses/${id}`,
    ).expect(200);
    expect(restRead.body.data).toMatchObject({
      id,
      name: 'Itemize Studio',
      logo_url: '/uploads/logos/retained.png',
    });

    const updated = await graphql(
      memberToken,
      organizationId,
      `mutation Update($id: Int!, $input: UpdateInvoiceBusinessInput!) {
        updateInvoiceBusiness(id: $id, input: $input) { ${fields} }
      }`,
      {
        id,
        input: { email: '', address: null, name: 'Itemize HQ' },
      },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateInvoiceBusiness).toMatchObject({
      id,
      name: 'Itemize HQ',
      email: null,
      address: null,
      logoUrl: '/uploads/logos/retained.png',
    });

    const detail = await graphql(
      memberToken,
      organizationId,
      `query Business($id: Int!) {
        invoiceBusiness(id: $id) { ${fields} }
      }`,
      { id },
      false,
    ).expect(200);
    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.invoiceBusiness.id).toBe(id);

    const deleted = await graphql(
      memberToken,
      organizationId,
      `mutation Delete($id: Int!) {
        deleteInvoiceBusiness(id: $id) { deletedId success }
      }`,
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteInvoiceBusiness).toEqual({
      deletedId: id,
      success: true,
    });
    const listed = await graphql(
      memberToken,
      organizationId,
      `query {
        invoiceBusinesses(page: { page: 1, pageSize: 100 }) {
          nodes { id }
          pageInfo { total }
        }
      }`,
      {},
      false,
    ).expect(200);
    expect(
      listed.body.data.invoiceBusinesses.nodes.map(
        (business: { id: number }) => business.id,
      ),
    ).not.toContain(id);
  });

  it('clears business logos atomically and durably cleans server-owned storage', async () => {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO businesses (organization_id, name, logo_url)
       VALUES ($1, 'Logo cleanup business', '/uploads/logos/integration-missing.png')
       RETURNING id`,
      [organizationId],
    );
    const id = Number(inserted.rows[0].id);
    const shared = await pool.query<{ id: number }>(
      `INSERT INTO businesses (organization_id, name, logo_url)
       VALUES ($1, 'Shared logo business', '/uploads/logos/integration-missing.png')
       RETURNING id`,
      [organizationId],
    );
    const sharedId = Number(shared.rows[0].id);
    const mutation = `mutation RemoveLogo($id: Int!) {
      removeInvoiceBusinessLogo(id: $id) { success cleanupQueued }
    }`;

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      mutation,
      { id },
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      mutation,
      { id },
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const removed = await graphql(
      memberToken,
      organizationId,
      mutation,
      { id },
    ).expect(200);
    expect(removed.body.errors).toBeUndefined();
    expect(removed.body.data.removeInvoiceBusinessLogo).toEqual({
      success: true,
      cleanupQueued: true,
    });
    const persisted = await pool.query<{ logo_url: string | null }>(
      'SELECT logo_url FROM businesses WHERE id = $1',
      [id],
    );
    expect(persisted.rows[0].logo_url).toBeNull();
    const queued = await pool.query<{ id: number; logo_url: string; status: string }>(
      `SELECT id, logo_url, status FROM invoice_logo_deletion_jobs
       WHERE organization_id = $1 AND scope = 'business' AND resource_id = $2`,
      [organizationId, id],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]).toMatchObject({
      logo_url: '/uploads/logos/integration-missing.png',
      status: 'queued',
    });

    await logoCleanupService.runDue(100);
    const cleaned = await pool.query<{ status: string; attempt_count: number }>(
      'SELECT status, attempt_count FROM invoice_logo_deletion_jobs WHERE id = $1',
      [queued.rows[0].id],
    );
    expect(cleaned.rows[0]).toMatchObject({ status: 'deleted', attempt_count: 1 });
    const sharedReference = await pool.query<{ logo_url: string | null }>(
      'SELECT logo_url FROM businesses WHERE id = $1',
      [sharedId],
    );
    expect(sharedReference.rows[0].logo_url).toBe(
      '/uploads/logos/integration-missing.png',
    );

    const lastReference = await graphql(
      memberToken,
      organizationId,
      mutation,
      { id: sharedId },
    ).expect(200);
    expect(lastReference.body.data.removeInvoiceBusinessLogo).toEqual({
      success: true,
      cleanupQueued: true,
    });
    await logoCleanupService.runDue(100);
    const requeued = await pool.query<{
      resource_id: number;
      status: string;
      attempt_count: number;
    }>(
      `SELECT resource_id, status, attempt_count
       FROM invoice_logo_deletion_jobs WHERE id = $1`,
      [queued.rows[0].id],
    );
    expect(requeued.rows[0]).toMatchObject({
      resource_id: sharedId,
      status: 'deleted',
      attempt_count: 1,
    });

    const replay = await graphql(
      memberToken,
      organizationId,
      mutation,
      { id },
    ).expect(200);
    expect(replay.body.data.removeInvoiceBusinessLogo).toEqual({
      success: true,
      cleanupQueued: false,
    });

    const rejectedUrl = '/uploads/logos/integration-rollback.png';
    const rollbackBusiness = await pool.query<{ id: number }>(
      `INSERT INTO businesses (organization_id, name, logo_url)
       VALUES ($1, 'Rollback business', $2) RETURNING id`,
      [organizationId, rejectedUrl],
    );
    await pool.query(
      `ALTER TABLE invoice_logo_deletion_jobs
       ADD CONSTRAINT integration_reject_rollback_logo
       CHECK (logo_url <> '/uploads/logos/integration-rollback.png')`,
    );
    const rolledBack = await (async () => {
      try {
        return await graphql(
          memberToken,
          organizationId,
          mutation,
          { id: Number(rollbackBusiness.rows[0].id) },
        ).expect(200);
      } finally {
        await pool.query(
          `ALTER TABLE invoice_logo_deletion_jobs
           DROP CONSTRAINT integration_reject_rollback_logo`,
        );
      }
    })();
    expect(rolledBack.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    const retained = await pool.query<{ logo_url: string }>(
      'SELECT logo_url FROM businesses WHERE id = $1',
      [rollbackBusiness.rows[0].id],
    );
    expect(retained.rows[0].logo_url).toBe(rejectedUrl);
  });

  it('enforces CSRF, validation, paging, and tenant-hidden misses', async () => {
    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation {
        createInvoiceBusiness(input: { name: "Denied" }) { id }
      }`,
      {},
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const invalid = await graphql(
      memberToken,
      organizationId,
      `mutation {
        createInvoiceBusiness(input: { name: " " }) { id }
      }`,
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_INVOICE_BUSINESS_NAME',
    });

    const invalidPage = await graphql(
      memberToken,
      organizationId,
      `query {
        invoiceBusinesses(page: { page: 1, pageSize: 101 }) {
          nodes { id }
        }
      }`,
      {},
      false,
    ).expect(200);
    expect(invalidPage.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query Business($id: Int!) {
        invoiceBusiness(id: $id) { id }
      }`,
      { id: 2147483647 },
      false,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('owns bounded multipart business and settings logo replacement over HTTP', async () => {
    const oldLogo = '/uploads/logos/integration-old-logo.png';
    const businessId = Number((await pool.query<{ id: number }>(
      `INSERT INTO businesses (organization_id, name, logo_url)
       VALUES ($1, 'Multipart Logo', $2) RETURNING id`,
      [organizationId, oldLogo],
    )).rows[0].id);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from([0, 0, 0, 0]),
    ]);
    const authenticated = (path: string) => request(app.getHttpServer())
      .post(path)
      .set('Cookie', `itemize_auth=${memberToken}; csrf-token=business-csrf`)
      .set('x-csrf-token', 'business-csrf')
      .set('x-organization-id', String(organizationId));

    const business = await authenticated(`/api/invoices/businesses/${businessId}/logo`)
      .attach('logo', png, { filename: 'brand.png', contentType: 'image/png' });
    expect({ status: business.status, body: business.body }).toMatchObject({
      status: 200,
      body: {
        success: true,
        data: { logo_url: expect.stringMatching(/^\/uploads\/logos\/logo-/) },
      },
    });
    uploadedLogoUrls.push(business.body.data.logo_url);
    expect((await pool.query(
      `SELECT 1 FROM invoice_logo_deletion_jobs
       WHERE organization_id = $1 AND logo_url = $2 AND status = 'queued'`,
      [organizationId, oldLogo],
    )).rows).toHaveLength(1);

    const settings = await authenticated('/api/invoices/settings/logo')
      .attach('logo', png, { filename: 'settings.png', contentType: 'image/png' })
      .expect(200);
    expect(settings.body).toMatchObject({
      success: true,
      data: { success: true, logo_url: expect.stringMatching(/^\/uploads\/logos\/logo-/) },
    });
    uploadedLogoUrls.push(settings.body.data.logo_url);

    await authenticated(`/api/invoices/businesses/${businessId}/logo`)
      .attach('logo', Buffer.from('spoofed'), {
        filename: 'spoofed.png', contentType: 'image/png',
      }).expect(400);
    expect((await pool.query<{ logo_url: string }>(
      'SELECT logo_url FROM businesses WHERE id = $1', [businessId],
    )).rows[0].logo_url).toBe(business.body.data.logo_url);

    await request(app.getHttpServer())
      .post(`/api/invoices/businesses/${businessId}/logo`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .attach('logo', png, { filename: 'no-csrf.png', contentType: 'image/png' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/invoices/businesses/${businessId}/logo`)
      .set('Cookie', `itemize_auth=${outsiderToken}; csrf-token=business-csrf`)
      .set('x-csrf-token', 'business-csrf')
      .set('x-organization-id', String(outsiderOrganizationId))
      .attach('logo', png, { filename: 'foreign.png', contentType: 'image/png' })
      .expect(404);
  });
});
