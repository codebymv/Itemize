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

describe('Campaign management GraphQL PostgreSQL contract', () => {
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
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for campaign tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Campaign Member', 'email', true),
              ($2, 'Campaign Outsider', 'email', true)
       RETURNING id`,
      [`campaign-member-${suffix}@test.itemize`, `campaign-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Campaign Primary', $1), ('Campaign Other', $2)
       RETURNING id`,
      [`campaign-primary-${suffix}`, `campaign-other-${suffix}`],
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

    const createCampaignRouter = require('../../../backend/src/routes/campaigns.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/campaigns', createCampaignRouter(pool, authenticateJWT));
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
        ? `itemize_auth=${token}; csrf-token=campaign-csrf`
        : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'campaign-csrf');
    return call.send({ query: document, variables });
  };

  const legacy = (path: string, token = memberToken, orgId = organizationId) =>
    request(legacyApp)
      .get(`/api/campaigns${path}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));

  const fields = `
    id organizationId name subject fromName templateId contentHtml segmentType segmentId
    segmentFilter tagIds excludedTagIds status scheduledAt sendImmediately timezone
    totalRecipients openRate createdById createdAt updatedAt templateName createdByName
    links { id campaignId originalUrl }
  `;

  it('creates, filters, pages, and reads through the retained REST route', async () => {
    const created = await graphql(
      memberToken,
      organizationId,
      `mutation Create($input: CreateCampaignInput!) {
        createCampaign(input: $input) { ${fields} }
      }`,
      { input: {
        name: ' Launch ', subject: 'Hello audience', contentHtml: '<p>Hello</p>',
        segmentType: 'all', excludedTagIds: [],
      } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createCampaign).toMatchObject({
      organizationId, name: 'Launch', status: 'draft', segmentType: 'all', totalRecipients: 0,
    });
    const id = Number(created.body.data.createCampaign.id);

    const retained = await legacy(`/${id}`).expect(200);
    expect(retained.body.data).toMatchObject({
      id, organization_id: organizationId, content_html: '<p>Hello</p>',
    });

    const listed = await graphql(
      memberToken,
      organizationId,
      `query List($filter: CampaignFilterInput, $page: PageInput) {
        campaigns(filter: $filter, page: $page) {
          nodes { ${fields} }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      { filter: { status: 'draft', search: 'launch' }, page: { page: 1, pageSize: 1 } },
      false,
    ).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.campaigns.nodes[0].id).toBe(id);
    expect(listed.body.data.campaigns.pageInfo).toMatchObject({ page: 1, pageSize: 1 });
  });

  it('serializes partial updates, clears explicit nulls, validates references, and conceals tenants', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id, name, subject, from_name, content_html, created_by)
       VALUES ($1, 'Concurrent', 'Original', 'Original sender', '<p>Original</p>', $2)
       RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    const update = `mutation Update($id: Int!, $input: UpdateCampaignInput!) {
      updateCampaign(id: $id, input: $input) { ${fields} }
    }`;
    const [nameUpdate, contentUpdate] = await Promise.all([
      graphql(memberToken, organizationId, update, { id, input: { name: 'Renamed' } }).expect(200),
      graphql(memberToken, organizationId, update, {
        id, input: { subject: 'Updated subject', fromName: null, contentHtml: '<p>Updated</p>' },
      }).expect(200),
    ]);
    expect(nameUpdate.body.errors).toBeUndefined();
    expect(contentUpdate.body.errors).toBeUndefined();
    const detail = await graphql(
      memberToken,
      organizationId,
      `query Detail($id: Int!) { campaign(id: $id) { ${fields} } }`,
      { id },
      false,
    ).expect(200);
    expect(detail.body.data.campaign).toMatchObject({
      name: 'Renamed', subject: 'Updated subject', fromName: null, contentHtml: '<p>Updated</p>',
    });

    const tags = await pool.query<{ id: number }>(
      `INSERT INTO tags (organization_id, name)
       VALUES ($1, 'Owned campaign tag'), ($2, 'Foreign campaign tag') RETURNING id`,
      [organizationId, outsiderOrganizationId],
    );
    const segments = await pool.query<{ id: number }>(
      `INSERT INTO segments (organization_id, name, segment_type, static_contact_ids, created_by)
       VALUES ($1, 'Owned campaign segment', 'static', '{}', $3),
              ($2, 'Foreign campaign segment', 'static', '{}', $4)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    const create = `mutation Create($input: CreateCampaignInput!) {
      createCampaign(input: $input) { id segmentType segmentId tagIds }
    }`;
    const ownedTag = await graphql(memberToken, organizationId, create, { input: {
      name: 'Tag audience', subject: 'Tag audience', segmentType: 'tag',
      tagIds: [Number(tags.rows[0].id)],
    } }).expect(200);
    expect(ownedTag.body.data.createCampaign).toMatchObject({
      segmentType: 'tag', tagIds: [Number(tags.rows[0].id)],
    });
    const ownedSegment = await graphql(memberToken, organizationId, create, { input: {
      name: 'Saved audience', subject: 'Saved audience', segmentType: 'segment',
      segmentId: Number(segments.rows[0].id),
    } }).expect(200);
    expect(ownedSegment.body.data.createCampaign).toMatchObject({
      segmentType: 'segment', segmentId: Number(segments.rows[0].id),
    });
    const foreignTag = await graphql(memberToken, organizationId, create, { input: {
      name: 'Denied tag', subject: 'Denied tag', segmentType: 'tag',
      tagIds: [Number(tags.rows[1].id)],
    } }).expect(200);
    expect(foreignTag.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const foreignSegment = await graphql(memberToken, organizationId, create, { input: {
      name: 'Denied segment', subject: 'Denied segment', segmentType: 'segment',
      segmentId: Number(segments.rows[1].id),
    } }).expect(200);
    expect(foreignSegment.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');

    const foreignTemplate = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (organization_id, name, subject, body_html, created_by)
       VALUES ($1, 'Foreign', 'Foreign', '<p>Foreign</p>', $2) RETURNING id`,
      [outsiderOrganizationId, outsiderId],
    );
    const deniedReference = await graphql(memberToken, organizationId, update, {
      id, input: { templateId: Number(foreignTemplate.rows[0].id) },
    }).expect(200);
    expect(deniedReference.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');

    await pool.query('UPDATE email_campaigns SET template_id=$1 WHERE id=$2', [
      Number(foreignTemplate.rows[0].id), id,
    ]);
    const sanitized = await graphql(
      memberToken,
      organizationId,
      `query Sanitized($id: Int!) { campaign(id: $id) { id templateId templateName templateHtml } }`,
      { id },
      false,
    ).expect(200);
    expect(sanitized.body.data.campaign).toEqual({
      id, templateId: null, templateName: null, templateHtml: null,
    });

    const hidden = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      'query Hidden($id: Int!) { campaign(id: $id) { id } }',
      { id },
      false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const noCsrf = await graphql(memberToken, organizationId, update, {
      id, input: { name: 'Denied' },
    }, false).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('enforces the locked schedule state machine and absolute future timestamps', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id, name, subject, created_by)
       VALUES ($1, 'Schedule', 'Schedule', $2) RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    const scheduledAt = '2099-01-01T10:00:00Z';
    const scheduled = await graphql(
      memberToken,
      organizationId,
      `mutation Schedule($id: Int!, $input: ScheduleCampaignInput!) {
        scheduleCampaign(id: $id, input: $input) { id status scheduledAt timezone sendImmediately }
      }`,
      { id, input: { scheduledAt, timezone: 'America/Phoenix' } },
    ).expect(200);
    expect(scheduled.body.errors).toBeUndefined();
    expect(scheduled.body.data.scheduleCampaign).toMatchObject({
      id, status: 'scheduled', timezone: 'America/Phoenix', sendImmediately: false,
    });

    const unscheduled = await graphql(
      memberToken,
      organizationId,
      'mutation UnSchedule($id: Int!) { unscheduleCampaign(id: $id) { id status scheduledAt } }',
      { id },
    ).expect(200);
    expect(unscheduled.body.data.unscheduleCampaign).toEqual({ id, status: 'draft', scheduledAt: null });

    const repeated = await graphql(
      memberToken,
      organizationId,
      'mutation UnSchedule($id: Int!) { unscheduleCampaign(id: $id) { id } }',
      { id },
    ).expect(200);
    expect(repeated.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_STATE', actualStatus: 'draft',
    });

    const localTime = await graphql(
      memberToken,
      organizationId,
      'mutation Schedule($id: Int!) { scheduleCampaign(id: $id, input: { scheduledAt: "2099-01-01T10:00:00" }) { id } }',
      { id },
    ).expect(200);
    expect(localTime.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('duplicates into draft and rejects deletion only while sending', async () => {
    const source = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id, name, subject, status, created_by)
       VALUES ($1, 'Lifecycle', 'Lifecycle', 'sent', $2) RETURNING id`,
      [organizationId, memberId],
    );
    const id = Number(source.rows[0].id);
    const duplicate = await graphql(
      memberToken,
      organizationId,
      `mutation Duplicate($id: Int!) { duplicateCampaign(id: $id) { ${fields} } }`,
      { id },
    ).expect(200);
    expect(duplicate.body.errors).toBeUndefined();
    expect(duplicate.body.data.duplicateCampaign).toMatchObject({ name: 'Lifecycle (Copy)', status: 'draft' });

    await pool.query("UPDATE email_campaigns SET status='sending' WHERE id=$1", [id]);
    const blocked = await graphql(
      memberToken,
      organizationId,
      'mutation Delete($id: Int!) { deleteCampaign(id: $id) { deletedId success } }',
      { id },
    ).expect(200);
    expect(blocked.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_STATE', actualStatus: 'sending',
    });

    await pool.query("UPDATE email_campaigns SET status='sent' WHERE id=$1", [id]);
    const deleted = await graphql(
      memberToken,
      organizationId,
      'mutation Delete($id: Int!) { deleteCampaign(id: $id) { deletedId success } }',
      { id },
    ).expect(200);
    expect(deleted.body.data.deleteCampaign).toEqual({ deletedId: id, success: true });
  });
});
