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

describe('SMS templates GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication; let legacyApp: Express; let pool: Pool;
  let memberId: number; let outsiderId: number; let organizationId: number; let outsiderOrganizationId: number;
  let memberToken: string; let outsiderToken: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for SMS-template tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret'; process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified) VALUES ($1, 'SMS Member', 'email', true), ($2, 'SMS Outsider', 'email', true) RETURNING id`,
      [`sms-template-member-${suffix}@test.itemize`, `sms-template-outsider-${suffix}@test.itemize`]);
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug) VALUES ('SMS Primary', $1), ('SMS Other', $2) RETURNING id`,
      [`sms-primary-${suffix}`, `sms-other-${suffix}`]);
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(`INSERT INTO organization_members (organization_id, user_id, role, joined_at)
      VALUES ($1, $3, 'owner', NOW()), ($2, $4, 'owner', NOW())`, [organizationId, outsiderOrganizationId, memberId, outsiderId]);
    await pool.query(`UPDATE users SET default_organization_id = CASE id
      WHEN $3::int THEN $1::int WHEN $4::int THEN $2::int ELSE default_organization_id END
      WHERE id = ANY($5::int[])`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId, [memberId, outsiderId]]);
    memberToken = await jwt.signAsync({ id: memberId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PG_POOL).useValue(pool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false }); configureApp(app); await app.init();
    const createRouter = require('../../../backend/src/routes/sms-templates.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express(); legacyApp.use(cookieParser()); legacyApp.use(express.json());
    legacyApp.use('/api/sms-templates', createRouter(pool, authenticateJWT, (_req: unknown, _res: unknown, next: () => void) => next()));
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [[organizationId, outsiderOrganizationId].filter(Boolean)]);
    if (pool && (memberId || outsiderId)) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [[memberId, outsiderId].filter(Boolean)]);
    if (app) await app.close();
  });

  const graphql = (token: string, orgId: number, document: string, variables: Record<string, unknown> = {}, csrf = true) => {
    const call = request(app.getHttpServer()).post('/graphql')
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=sms-template-csrf` : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'sms-template-csrf');
    return call.send({ query: document, variables });
  };
  const fields = `id organizationId name message variables category isActive createdById createdByName
    messageInfo { length segments encoding charsRemaining } createdAt updatedAt`;

  it('creates, lists, aggregates, calculates segments, and interoperates with REST', async () => {
    const created = await graphql(memberToken, organizationId,
      `mutation Create($input: CreateSmsTemplateInput!) { createSmsTemplate(input: $input) { ${fields} } }`,
      { input: { name: ' Reminder ', message: 'Hi {{first_name}} {}', category: 'Reminders' } }).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createSmsTemplate).toMatchObject({ name: 'Reminder', variables: ['first_name'], category: 'Reminders', isActive: true });
    const id = Number(created.body.data.createSmsTemplate.id);
    const retained = await request(legacyApp).get(`/api/sms-templates/${id}`).set('Cookie', `itemize_auth=${memberToken}`).set('x-organization-id', String(organizationId)).expect(200);
    expect(retained.body).toMatchObject({ id, organization_id: organizationId, message: 'Hi {{first_name}} {}' });
    const listed = await graphql(memberToken, organizationId,
      `query List($filter: SmsTemplateFilterInput, $page: PageInput) { smsTemplates(filter: $filter, page: $page) {
        nodes { ${fields} } pageInfo { total hasNextPage } } smsTemplateCategories { category count }
        smsMessageInfo(message: "${'^'.repeat(81)}") { length segments encoding charsRemaining } }`,
      { filter: { category: 'Reminders', isActive: true, search: 'reminder' }, page: { page: 1, pageSize: 1 } }, false).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.smsTemplates.pageInfo.total).toBe(1);
    expect(listed.body.data.smsTemplateCategories).toContainEqual({ category: 'Reminders', count: 1 });
    expect(listed.body.data.smsMessageInfo).toEqual({ length: 162, segments: 2, encoding: 'GSM', charsRemaining: 144 });
  });

  it('serializes partial updates, re-extracts variables, and duplicates inactive', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO sms_templates (organization_id, name, message, category, created_by) VALUES ($1, 'Concurrent', 'Original', 'general', $2) RETURNING id`,
      [organizationId, memberId]);
    const id = Number(source.rows[0].id); const mutation = `mutation Update($id: Int!, $input: UpdateSmsTemplateInput!) { updateSmsTemplate(id: $id, input: $input) { ${fields} } }`;
    const [name, message] = await Promise.all([
      graphql(memberToken, organizationId, mutation, { id, input: { name: 'Renamed' } }).expect(200),
      graphql(memberToken, organizationId, mutation, { id, input: { message: '{{company}} 🙂' } }).expect(200),
    ]);
    expect(name.body.errors).toBeUndefined(); expect(message.body.errors).toBeUndefined();
    const detail = await graphql(memberToken, organizationId, `query($id: Int!) { smsTemplate(id: $id) { ${fields} } }`, { id }, false).expect(200);
    expect(detail.body.data.smsTemplate).toMatchObject({ name: 'Renamed', message: '{{company}} 🙂', variables: ['company'] });
    const duplicate = await graphql(memberToken, organizationId, `mutation($id: Int!) { duplicateSmsTemplate(id: $id) { ${fields} } }`, { id }).expect(200);
    expect(duplicate.body.data.duplicateSmsTemplate).toMatchObject({ name: 'Renamed (Copy)', isActive: false });
  });

  it('conceals foreign rows and enforces CSRF and message bounds', async () => {
    const foreign = await pool.query<{ id: number }>(
      `INSERT INTO sms_templates (organization_id, name, message, created_by) VALUES ($1, 'Foreign', 'No', $2) RETURNING id`,
      [outsiderOrganizationId, outsiderId]);
    const id = Number(foreign.rows[0].id);
    const hidden = await graphql(memberToken, organizationId, 'query($id: Int!) { smsTemplate(id: $id) { id } }', { id }, false).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const denied = await graphql(memberToken, organizationId,
      'mutation { createSmsTemplate(input: { name: "Denied", message: "No" }) { id } }', {}, false).expect(200);
    expect(denied.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const invalid = await graphql(outsiderToken, outsiderOrganizationId,
      'mutation { createSmsTemplate(input: { name: "Bad", message: "   " }) { id } }').expect(200);
    expect(invalid.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});
