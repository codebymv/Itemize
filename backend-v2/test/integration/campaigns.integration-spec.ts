import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  CAMPAIGN_TEST_EMAIL_PROVIDER,
  CampaignTestEmailProvider,
} from '../../src/campaign-delivery/campaign-test-email.provider';
import { CampaignSendService } from '../../src/campaign-delivery/campaign-send.service';
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
  let campaignSendService: CampaignSendService;
  const jwt = new JwtService();
  const testEmailProvider: jest.Mocked<CampaignTestEmailProvider> = {
    send: jest.fn(),
  };

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
      .overrideProvider(CAMPAIGN_TEST_EMAIL_PROVIDER)
      .useValue(testEmailProvider)
      .compile();
    campaignSendService = moduleRef.get(CampaignSendService);
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

  it('pages tenant-qualified recipient snapshots with stable status filtering and REST parity', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email, status, created_by)
       VALUES ($1, 'Current A', 'Contact', $5, 'active', $3),
              ($1, 'Current B', 'Contact', $6, 'active', $3),
              ($2, 'Foreign', 'Contact', $7, 'active', $4)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId,
        `recipient-a-${suffix}@test.itemize`, `recipient-b-${suffix}@test.itemize`,
        `recipient-foreign-${suffix}@test.itemize`],
    );
    const [contactA, contactB, foreignContact] = contacts.rows.map((row) => Number(row.id));
    const campaigns = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id, name, subject, created_by)
       VALUES ($1, $3, 'Recipients', $5), ($2, $4, 'Foreign recipients', $6)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, `Recipients ${suffix}`,
        `Foreign recipients ${suffix}`, memberId, outsiderId],
    );
    const id = Number(campaigns.rows[0].id);
    const foreignCampaignId = Number(campaigns.rows[1].id);
    await pool.query(
      `INSERT INTO campaign_recipients (
         campaign_id, contact_id, organization_id, email, first_name, last_name,
         status, sent_at, opened_at, open_count
       ) VALUES
         ($1, $2, $6, $8, 'Snapshot A', 'Original', 'opened', '2026-07-21T10:00:00Z', '2026-07-21T10:05:00Z', 2),
         ($1, $3, $6, $9, 'Snapshot B', NULL, 'sent', '2026-07-21T09:00:00Z', NULL, 0),
         ($4, $5, $7, $10, 'Foreign', 'Snapshot', 'opened', '2026-07-21T11:00:00Z', '2026-07-21T11:05:00Z', 1)`,
      [id, contactA, contactB, foreignCampaignId, foreignContact, organizationId, outsiderOrganizationId,
        `snapshot-a-${suffix}@test.itemize`, `snapshot-b-${suffix}@test.itemize`,
        `snapshot-foreign-${suffix}@test.itemize`],
    );
    const document = `query Recipients(
      $campaignId: Int!, $filter: CampaignRecipientFilterInput, $page: PageInput
    ) {
      campaignRecipients(campaignId: $campaignId, filter: $filter, page: $page) {
        nodes {
          id campaignId contactId organizationId email firstName lastName status sentAt openedAt
          openCount clickCount clickedLinks contactFirstName contactLastName
        }
        pageInfo { page pageSize total totalPages hasNextPage hasPreviousPage }
      }
    }`;
    const listed = await graphql(memberToken, organizationId, document, {
      campaignId: id, filter: { status: 'all' }, page: { page: 1, pageSize: 1 },
    }, false).expect(200);
    expect(listed.body.errors).toBeUndefined();
    expect(listed.body.data.campaignRecipients).toMatchObject({
      nodes: [{
        campaignId: id, contactId: contactA, organizationId, status: 'opened',
        firstName: 'Snapshot A', contactFirstName: 'Current A', openCount: 2,
      }],
      pageInfo: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNextPage: true },
    });

    const opened = await graphql(memberToken, organizationId, document, {
      campaignId: id, filter: { status: 'opened' }, page: { page: 1, pageSize: 50 },
    }, false).expect(200);
    expect(opened.body.data.campaignRecipients.pageInfo.total).toBe(1);
    const retained = await legacy(`/${id}/recipients?status=opened&page=1&limit=50`).expect(200);
    expect(retained.body.data.recipients).toHaveLength(1);
    expect(retained.body.data.recipients[0]).toMatchObject({
      id: opened.body.data.campaignRecipients.nodes[0].id,
      campaign_id: id, contact_id: contactA, status: 'opened',
      first_name: 'Snapshot A', contact_first_name: 'Current A', open_count: 2,
    });
    expect(retained.body.data.pagination).toEqual({
      page: 1, limit: 50, total: 1, totalPages: 1,
    });

    await pool.query(
      `INSERT INTO campaign_recipients (
         campaign_id, contact_id, organization_id, email, status, sent_at
       ) VALUES ($1, $2, $3, $4, 'opened', '2026-07-21T12:00:00Z')`,
      [id, foreignContact, outsiderOrganizationId, `corrupt-${suffix}@test.itemize`],
    );
    const isolated = await graphql(memberToken, organizationId, document, {
      campaignId: id, filter: { status: 'opened' }, page: { page: 1, pageSize: 50 },
    }, false).expect(200);
    expect(isolated.body.data.campaignRecipients.pageInfo.total).toBe(1);

    const hidden = await graphql(memberToken, organizationId, document, {
      campaignId: foreignCampaignId,
    }, false).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const invalid = await graphql(memberToken, organizationId, document, {
      campaignId: id, filter: { status: 'unknown' },
    }, false).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_RECIPIENT_STATUS',
    });
    await pool.query('DELETE FROM email_campaigns WHERE id=ANY($1::int[])', [[id, foreignCampaignId]]);
    await pool.query('DELETE FROM contacts WHERE id=ANY($1::int[])', [[contactA, contactB, foreignContact]]);
  });

  it('sends durable idempotent campaign tests without mutating campaign delivery state', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const template = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (
         organization_id, name, subject, body_html, body_text, created_by
       ) VALUES ($1,$2,'Template subject','<p>Hello {{ first_name }} at {{company}} ({{email}})</p>',
                 'Hello {{last_name}}', $3) RETURNING id`,
      [organizationId, `Campaign test template ${suffix}`, memberId],
    );
    const campaigns = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (
         organization_id, name, subject, from_name, from_email, reply_to,
         template_id, status, created_by
       ) VALUES
         ($1,$3,'Test launch','Campaign Sender','sender@test.itemize','reply@test.itemize',$5,'draft',$6),
         ($2,$4,'Foreign launch',NULL,NULL,NULL,NULL,'draft',$7)
       RETURNING id`,
      [organizationId, outsiderOrganizationId, `Campaign test ${suffix}`,
        `Foreign campaign test ${suffix}`, Number(template.rows[0].id), memberId, outsiderId],
    );
    const campaignId = Number(campaigns.rows[0].id);
    const foreignCampaignId = Number(campaigns.rows[1].id);
    testEmailProvider.send.mockReset();
    testEmailProvider.send.mockResolvedValue({ kind: 'sent', providerId: 'provider-test-1' });
    const document = `mutation SendTest(
      $campaignId: Int!, $testEmail: String!, $idempotencyKey: String!
    ) {
      sendCampaignTest(
        campaignId: $campaignId, testEmail: $testEmail, idempotencyKey: $idempotencyKey
      ) { success replayed deliveryId status emailId message }
    }`;
    const variables = {
      campaignId, testEmail: `recipient-${suffix}@test.itemize`, idempotencyKey: `test-${suffix}`,
    };
    const sent = await graphql(memberToken, organizationId, document, variables).expect(200);
    expect(sent.body.errors).toBeUndefined();
    expect(sent.body.data.sendCampaignTest).toMatchObject({
      success: true, replayed: false, status: 'SENT', emailId: 'provider-test-1',
    });
    expect(testEmailProvider.send).toHaveBeenCalledTimes(1);
    expect(testEmailProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      to: variables.testEmail,
      subject: '[TEST] Test launch',
      html: `<p>Hello Test at Test Company (${variables.testEmail})</p>`,
      text: 'Hello User',
      fromName: 'Campaign Sender',
      idempotencyKey: expect.stringMatching(/^campaign-test-email:/),
    }));
    const persisted = await pool.query(
      `SELECT status, provider_id, recipient_email, payload
       FROM campaign_test_email_deliveries WHERE campaign_id=$1`,
      [campaignId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      status: 'sent', provider_id: 'provider-test-1', recipient_email: variables.testEmail,
    });
    const untouched = await pool.query(
      `SELECT status, total_recipients, total_sent, started_at, completed_at,
              (SELECT COUNT(*)::int FROM campaign_recipients WHERE campaign_id=$1) recipient_count
       FROM email_campaigns WHERE id=$1`,
      [campaignId],
    );
    expect(untouched.rows[0]).toMatchObject({
      status: 'draft', total_recipients: 0, total_sent: 0,
      started_at: null, completed_at: null, recipient_count: 0,
    });

    const replayed = await graphql(memberToken, organizationId, document, variables).expect(200);
    expect(replayed.body.data.sendCampaignTest).toMatchObject({
      success: true, replayed: true, deliveryId: sent.body.data.sendCampaignTest.deliveryId,
    });
    expect(testEmailProvider.send).toHaveBeenCalledTimes(1);
    const conflict = await graphql(memberToken, organizationId, document, {
      ...variables, testEmail: `other-${suffix}@test.itemize`,
    }).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT', reason: 'IDEMPOTENCY_KEY_REUSED',
    });
    const hidden = await graphql(memberToken, organizationId, document, {
      ...variables, campaignId: foreignCampaignId, idempotencyKey: `foreign-${suffix}`,
    }).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    const noCsrf = await graphql(memberToken, organizationId, document, {
      ...variables, idempotencyKey: `csrf-${suffix}`,
    }, false).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
    await pool.query('DELETE FROM email_campaigns WHERE id=ANY($1::int[])', [[campaignId, foreignCampaignId]]);
    await pool.query('DELETE FROM email_templates WHERE id=$1', [Number(template.rows[0].id)]);
  });

  it('atomically accepts, replays, and durably completes a bulk campaign send', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    await pool.query(
      `INSERT INTO subscriptions (organization_id, plan_id, status)
       SELECT $1, id, 'trialing' FROM subscription_plans WHERE name='starter'
       ON CONFLICT (organization_id) DO UPDATE SET
         plan_id=EXCLUDED.plan_id, status=EXCLUDED.status`,
      [organizationId],
    );
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, last_name, email, source, created_by)
       VALUES ($1,'Bulk','One',$2,'manual',$4), ($1,'Bulk','Two',$3,'manual',$4)
       RETURNING id`,
      [organizationId, `bulk-one-${suffix}@test.itemize`,
        `bulk-two-${suffix}@test.itemize`, memberId],
    );
    const campaign = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (
         organization_id, name, subject, content_html, content_text,
         segment_type, status, created_by
       ) VALUES ($1,$2,'Hello {{first_name}}','<p>{{full_name}}: {{email}}</p>',
                 'Hi {{first_name}}','all','draft',$3) RETURNING id`,
      [organizationId, `Bulk campaign ${suffix}`, memberId],
    );
    const campaignId = Number(campaign.rows[0].id);
    const usageBefore = await pool.query<{ count: number }>(
      `SELECT COALESCE((SELECT count FROM usage_tracking
         WHERE organization_id=$1 AND resource_type='emails_per_month'
           AND period_start=date_trunc('month',CURRENT_TIMESTAMP)::date),0)::int count`,
      [organizationId],
    );
    testEmailProvider.send.mockReset();
    testEmailProvider.send.mockResolvedValue({ kind: 'sent', providerId: 'provider-bulk' });
    const document = `mutation SendCampaign($campaignId: Int!, $idempotencyKey: String!) {
      sendCampaign(campaignId: $campaignId, idempotencyKey: $idempotencyKey) {
        campaign { id status totalRecipients totalSent startedAt }
        recipientCount deliveryJobId replayed message
      }
    }`;
    const variables = { campaignId, idempotencyKey: `bulk-${suffix}` };
    const accepted = await graphql(memberToken, organizationId, document, variables).expect(200);
    expect(accepted.body.errors).toBeUndefined();
    expect(accepted.body.data.sendCampaign).toMatchObject({
      campaign: { id: campaignId, status: 'sending', totalSent: 0 },
      replayed: false, message: 'Campaign is now sending',
    });
    const recipientCount = Number(accepted.body.data.sendCampaign.recipientCount);
    expect(recipientCount).toBeGreaterThanOrEqual(2);
    expect(testEmailProvider.send).not.toHaveBeenCalled();

    const persisted = await pool.query(
      `SELECT job.status, job.recipient_count,
              COUNT(recipient.id)::int snapshot_count,
              COUNT(*) FILTER (WHERE recipient.delivery_status='queued')::int queued_count
       FROM campaign_delivery_jobs job
       JOIN campaign_recipients recipient ON recipient.delivery_job_id=job.id
       WHERE job.id=$1 GROUP BY job.id`,
      [accepted.body.data.sendCampaign.deliveryJobId],
    );
    expect(persisted.rows[0]).toMatchObject({
      status: 'queued', recipient_count: recipientCount,
      snapshot_count: recipientCount, queued_count: recipientCount,
    });
    const usageAfter = await pool.query<{ count: number }>(
      `SELECT count::int FROM usage_tracking
       WHERE organization_id=$1 AND resource_type='emails_per_month'
         AND period_start=date_trunc('month',CURRENT_TIMESTAMP)::date`,
      [organizationId],
    );
    expect(usageAfter.rows[0].count).toBe(usageBefore.rows[0].count + recipientCount);

    const replayed = await graphql(memberToken, organizationId, document, variables).expect(200);
    expect(replayed.body.data.sendCampaign).toMatchObject({
      deliveryJobId: accepted.body.data.sendCampaign.deliveryJobId,
      recipientCount, replayed: true,
    });
    const replayUsage = await pool.query<{ count: number }>(
      `SELECT count::int FROM usage_tracking
       WHERE organization_id=$1 AND resource_type='emails_per_month'
         AND period_start=date_trunc('month',CURRENT_TIMESTAMP)::date`,
      [organizationId],
    );
    expect(replayUsage.rows[0].count).toBe(usageAfter.rows[0].count);

    const paused = await graphql(
      memberToken, organizationId,
      `mutation Pause($campaignId: Int!) {
        pauseCampaign(campaignId: $campaignId) {
          campaign { id status totalSent } pendingRecipients message
        }
      }`,
      { campaignId },
    ).expect(200);
    expect(paused.body.errors).toBeUndefined();
    expect(paused.body.data.pauseCampaign).toMatchObject({
      campaign: { id: campaignId, status: 'paused', totalSent: 0 },
      pendingRecipients: recipientCount, message: 'Campaign paused',
    });
    await expect(campaignSendService.runDue(500)).resolves.toEqual({ attempted: 0, sent: 0 });
    expect(testEmailProvider.send).not.toHaveBeenCalled();

    const resumed = await graphql(
      memberToken, organizationId,
      `mutation Resume($campaignId: Int!) {
        resumeCampaign(campaignId: $campaignId) {
          campaign { id status totalSent } pendingRecipients message
        }
      }`,
      { campaignId },
    ).expect(200);
    expect(resumed.body.errors).toBeUndefined();
    expect(resumed.body.data.resumeCampaign).toMatchObject({
      campaign: { id: campaignId, status: 'sending', totalSent: 0 },
      pendingRecipients: recipientCount, message: 'Campaign resumed',
    });

    await expect(campaignSendService.runDue(500)).resolves.toEqual({
      attempted: recipientCount, sent: recipientCount,
    });
    expect(testEmailProvider.send).toHaveBeenCalledTimes(recipientCount);
    expect(testEmailProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.stringMatching(/^campaign-recipient-email:/),
    }));
    const completed = await pool.query(
      `SELECT campaign.status, campaign.total_sent, campaign.completed_at,
              job.status job_status,
              COUNT(*) FILTER (WHERE recipient.status='sent')::int sent_count
       FROM email_campaigns campaign
       JOIN campaign_delivery_jobs job ON job.campaign_id=campaign.id
       JOIN campaign_recipients recipient ON recipient.delivery_job_id=job.id
       WHERE campaign.id=$1 GROUP BY campaign.id, job.id`,
      [campaignId],
    );
    expect(completed.rows[0]).toMatchObject({
      status: 'sent', total_sent: recipientCount,
      job_status: 'completed', sent_count: recipientCount,
    });
    expect(completed.rows[0].completed_at).toBeTruthy();
    await pool.query('DELETE FROM email_campaigns WHERE id=$1', [campaignId]);
    await pool.query('DELETE FROM contacts WHERE id=ANY($1::int[])', [contacts.rows.map((row) => row.id)]);
  });

  it('previews deliverable audiences with REST parity and fail-closed saved segments', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const tags = await pool.query<{ id: number }>(
      `INSERT INTO tags (organization_id, name)
       VALUES ($1, $2), ($1, $3) RETURNING id`,
      [organizationId, `Preview include ${suffix}`, `Preview exclude ${suffix}`],
    );
    const includeTagId = Number(tags.rows[0].id);
    const excludeTagId = Number(tags.rows[1].id);
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, status, source, custom_fields,
         email_unsubscribed, email_bounced, created_by
       ) VALUES
         ($1, 'Eligible', 'Preview', $3, 'active', 'manual', '{"tier":"gold"}', FALSE, FALSE, $2),
         ($1, 'Excluded', 'Preview', $4, 'active', 'manual', '{"tier":"silver"}', FALSE, FALSE, $2),
         ($1, 'Unsubscribed', 'Preview', $5, 'active', 'manual', '{"tier":"gold"}', TRUE, FALSE, $2),
         ($1, 'Bounced', 'Preview', $6, 'active', 'manual', '{}', FALSE, TRUE, $2),
         ($1, 'Blank', 'Preview', '', 'active', 'manual', '{}', FALSE, FALSE, $2),
         ($1, 'Inactive', 'Preview', $7, 'inactive', 'manual', '{}', FALSE, FALSE, $2)
       RETURNING id`,
      [organizationId, memberId,
        `eligible-${suffix}@preview.test`, `excluded-${suffix}@preview.test`,
        `unsub-${suffix}@preview.test`, `bounce-${suffix}@preview.test`,
        `inactive-${suffix}@preview.test`],
    );
    const ids = contacts.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO contact_tags (contact_id, tag_id)
       SELECT contact_id, tag_id FROM UNNEST($1::int[], $2::int[]) AS x(contact_id, tag_id)`,
      [[ids[0], ids[1], ids[2], ids[3], ids[4], ids[1]],
        [includeTagId, includeTagId, includeTagId, includeTagId, includeTagId, excludeTagId]],
    );
    const segments = await pool.query<{ id: number }>(
      `INSERT INTO segments (
         organization_id, name, filter_type, filters, segment_type, static_contact_ids, is_active, created_by
       ) VALUES
         ($1, $3, 'and', $4::jsonb, 'dynamic', '{}', TRUE, $2),
         ($1, $5, 'and', '[]', 'static', $6::int[], TRUE, $2)
       RETURNING id`,
      [organizationId, memberId, `Dynamic preview ${suffix}`,
        JSON.stringify([{ field: 'custom_field', operator: 'equals', custom_field_key: 'tier', value: 'gold' }]),
        `Static preview ${suffix}`, [ids[0], ids[2]]],
    );
    const dynamicSegmentId = Number(segments.rows[0].id);
    const staticSegmentId = Number(segments.rows[1].id);
    const campaign = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (
         organization_id, name, subject, segment_type, tag_ids, excluded_tag_ids, created_by
       ) VALUES ($1, $2, 'Preview', 'tag', $3::int[], $4::int[], $5) RETURNING id`,
      [organizationId, `Preview ${suffix}`, [includeTagId], [excludeTagId], memberId],
    );
    const id = Number(campaign.rows[0].id);
    const document = `query Preview($id: Int!) {
      campaignAudiencePreview(id: $id) { recipientCount segmentType segmentId tagIds excludedTagIds }
    }`;
    const preview = async () => graphql(memberToken, organizationId, document, { id }, false).expect(200);

    const tagPreview = await preview();
    expect(tagPreview.body.errors).toBeUndefined();
    expect(tagPreview.body.data.campaignAudiencePreview).toEqual({
      recipientCount: 1, segmentType: 'tag', segmentId: null,
      tagIds: [includeTagId], excludedTagIds: [excludeTagId],
    });
    const retained = await legacy(`/${id}/preview`).expect(200);
    expect(retained.body.data).toEqual(tagPreview.body.data.campaignAudiencePreview);

    await pool.query(
      `UPDATE email_campaigns SET segment_type='all', segment_id=NULL, segment_filter='{}',
         tag_ids='{}', excluded_tag_ids='{}' WHERE id=$1`, [id],
    );
    await expect(preview()).resolves.toMatchObject({ body: { data: {
      campaignAudiencePreview: { recipientCount: 3, segmentType: 'all' },
    } } });

    await pool.query(
      `UPDATE email_campaigns SET segment_type='status', segment_filter=$2::jsonb WHERE id=$1`,
      [id, JSON.stringify({ status: 'inactive' })],
    );
    await expect(preview()).resolves.toMatchObject({ body: { data: {
      campaignAudiencePreview: { recipientCount: 1, segmentType: 'status' },
    } } });

    for (const segmentId of [dynamicSegmentId, staticSegmentId]) {
      await pool.query(
        `UPDATE email_campaigns SET segment_type='segment', segment_id=$2,
           segment_filter='{}', tag_ids='{}', excluded_tag_ids='{}' WHERE id=$1`,
        [id, segmentId],
      );
      const result = await preview();
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.campaignAudiencePreview).toMatchObject({
        recipientCount: 1, segmentType: 'segment', segmentId,
      });
    }

    await pool.query(
      `UPDATE segments SET filters=$2::jsonb WHERE id=$1`,
      [dynamicSegmentId, JSON.stringify([{
        field: 'custom_field', operator: 'equals', custom_field_key: "tier') OR TRUE --", value: 'gold',
      }])],
    );
    await pool.query('UPDATE email_campaigns SET segment_id=$2 WHERE id=$1', [id, dynamicSegmentId]);
    const hostile = await preview();
    expect(hostile.body.errors).toBeUndefined();
    expect(hostile.body.data.campaignAudiencePreview.recipientCount).toBe(0);

    await pool.query(
      `UPDATE segments SET filters=$2::jsonb WHERE id=$1`,
      [dynamicSegmentId, JSON.stringify([{ field: 'unknown', operator: 'equals', value: 'x' }])],
    );
    const invalid = await preview();
    expect(invalid.body.data).toBeNull();
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', reason: 'INVALID_CAMPAIGN_AUDIENCE',
    });

    const hidden = await graphql(
      outsiderToken, outsiderOrganizationId, document, { id }, false,
    ).expect(200);
    expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
