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

describe('Email templates GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for email-template tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Template Member', 'email', true),
              ($2, 'Template Outsider', 'email', true)
       RETURNING id`,
      [`template-member-${suffix}@test.itemize`, `template-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Template Primary', $1), ('Template Other', $2)
       RETURNING id`,
      [`template-primary-${suffix}`, `template-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id = CASE id
         WHEN $3 THEN $1 WHEN $4 THEN $2 ELSE default_organization_id END
       WHERE id = ANY($5::int[])`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId, [memberId, outsiderId]],
    );
    memberToken = await jwt.signAsync({ id: memberId }, {
      secret: process.env.JWT_SECRET, expiresIn: '15m',
    });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, {
      secret: process.env.JWT_SECRET, expiresIn: '15m',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();

    const createEmailTemplateRouter = require('../../../backend/src/routes/email-templates.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/email-templates', createEmailTemplateRouter(pool, authenticateJWT));
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
      .set('Cookie', csrf
        ? `itemize_auth=${token}; csrf-token=email-template-csrf`
        : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'email-template-csrf');
    return call.send({ query: document, variables });
  };

  const legacy = (path: string, token = memberToken, orgId = organizationId) =>
    request(legacyApp)
      .get(path)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));

  const fields = `
    id organizationId name subject bodyHtml bodyText variables category isActive
    createdById createdByName createdAt updatedAt
  `;

  it('creates, filters, pages, and exposes numeric category counts with REST interoperability', async () => {
    const created = await graphql(
      memberToken,
      organizationId,
      `mutation Create($input: CreateEmailTemplateInput!) {
        createEmailTemplate(input: $input) { ${fields} }
      }`,
      { input: {
        name: ' Welcome ',
        subject: 'Hello {{first_name}}',
        bodyHtml: '<p>{{company}} {{first_name}} {{link}}</p>',
        bodyText: '{{company}}',
        category: 'OnBoarding',
      } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createEmailTemplate).toMatchObject({
      organizationId,
      name: 'Welcome',
      category: 'OnBoarding',
      variables: ['first_name', 'company', 'link'],
      isActive: true,
    });
    const id = Number(created.body.data.createEmailTemplate.id);

    const retained = await legacy(`/api/email-templates/${id}`).expect(200);
    expect(retained.body).toMatchObject({
      id, organization_id: organizationId, body_html: '<p>{{company}} {{first_name}} {{link}}</p>',
    });

    const listed = await graphql(
      memberToken,
      organizationId,
      `query List($filter: EmailTemplateFilterInput, $page: PageInput) {
        emailTemplates(filter: $filter, page: $page) {
          nodes { ${fields} }
          pageInfo { page pageSize total hasNextPage }
        }
        emailTemplateCategories { category count }
      }`,
      { filter: { category: 'OnBoarding', isActive: true, search: 'welcome' }, page: { page: 1, pageSize: 1 } },
      false,
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.emailTemplates.nodes[0].id).toBe(id);
    expect(listed.body.data.emailTemplates.pageInfo).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(listed.body.data.emailTemplateCategories).toContainEqual({ category: 'OnBoarding', count: 1 });
  });

  it('serializes concurrent partial updates, re-extracts variables, and duplicates inactive', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (
         organization_id, name, subject, body_html, body_text, category, created_by
       ) VALUES ($1, 'Concurrent', 'Original', '<p>Original</p>', 'Original', 'general', $2)
       RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    const update = `mutation Update($id: Int!, $input: UpdateEmailTemplateInput!) {
      updateEmailTemplate(id: $id, input: $input) { ${fields} }
    }`;
    const [nameUpdate, contentUpdate] = await Promise.all([
      graphql(memberToken, organizationId, update, { id, input: { name: 'Renamed' } }).expect(200),
      graphql(memberToken, organizationId, update, {
        id,
        input: { subject: '{{first_name}}', bodyHtml: '<p>{{company}}</p>', bodyText: null },
      }).expect(200),
    ]);
    expect(nameUpdate.body.errors).toBeUndefined();
    expect(contentUpdate.body.errors).toBeUndefined();

    const detail = await graphql(
      memberToken,
      organizationId,
      `query Detail($id: Int!) { emailTemplate(id: $id) { ${fields} } }`,
      { id },
      false,
    ).expect(200);
    expect(detail.body.data.emailTemplate).toMatchObject({
      name: 'Renamed', subject: '{{first_name}}', bodyHtml: '<p>{{company}}</p>',
      bodyText: null, variables: ['first_name', 'company'],
    });

    const duplicate = await graphql(
      memberToken,
      organizationId,
      `mutation Duplicate($id: Int!) { duplicateEmailTemplate(id: $id) { ${fields} } }`,
      { id },
    ).expect(200);
    expect(duplicate.body.errors).toBeUndefined();
    expect(duplicate.body.data.duplicateEmailTemplate).toMatchObject({
      name: 'Renamed (Copy)', isActive: false, variables: ['first_name', 'company'],
    });
  });

  it('conceals foreign templates and enforces CSRF plus nonblank content', async () => {
    const foreign = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
       VALUES ($1, 'Foreign', 'Foreign', '<p>Foreign</p>', $2) RETURNING id`,
      [outsiderOrganizationId, outsiderId],
    );
    const foreignId = Number(foreign.rows[0].id);
    const hidden = await graphql(
      memberToken,
      organizationId,
      'query Hidden($id: Int!) { emailTemplate(id: $id) { id } }',
      { id: foreignId },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      'mutation { createEmailTemplate(input: { name: "Denied", subject: "No", bodyHtml: "<p>No</p>" }) { id } }',
      {},
      false,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const invalid = await graphql(
      memberToken,
      organizationId,
      'mutation { createEmailTemplate(input: { name: "   ", subject: "Valid", bodyHtml: "<p>Valid</p>" }) { id } }',
    ).expect(200);
    expect(invalid.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('deletes only tenant-owned templates and verifies the mutation result', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
       VALUES ($1, 'Delete me', 'Delete', '<p>Delete</p>', $2) RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    const deleted = await graphql(
      memberToken,
      organizationId,
      'mutation Delete($id: Int!) { deleteEmailTemplate(id: $id) { deletedId success } }',
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteEmailTemplate).toEqual({ deletedId: id, success: true });

    const second = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'mutation Delete($id: Int!) { deleteEmailTemplate(id: $id) { deletedId success } }',
      { id },
    ).expect(200);
    expect(second.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
