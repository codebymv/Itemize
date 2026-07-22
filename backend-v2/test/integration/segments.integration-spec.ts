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

describe('Segments GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let activeContactId: number;
  let inactiveContactId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for segment tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified)
       VALUES ($1,'Segment Member','email',true),($2,'Segment Outsider','email',true) RETURNING id`,
      [`segment-member-${suffix}@test.itemize`, `segment-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug)
       VALUES ('Segment Primary',$1),('Segment Other',$2) RETURNING id`,
      [`segment-primary-${suffix}`, `segment-other-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO organization_members (organization_id,user_id,role,joined_at)
       VALUES ($1,$3,'owner',NOW()),($2,$4,'owner',NOW())`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    await pool.query(
      `UPDATE users SET default_organization_id=CASE id
         WHEN $3::int THEN $1::int WHEN $4::int THEN $2::int ELSE default_organization_id END
       WHERE id=ANY($5::int[])`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId, [memberId, outsiderId]],
    );
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts
       (organization_id,first_name,last_name,email,status,source,custom_fields,created_by)
       VALUES
       ($1,'Active','Gold',$3,'active','manual','{"tier":"gold"}',$2),
       ($1,'Inactive','Silver',$4,'inactive','manual','{"tier":"silver"}',$2)
       RETURNING id`,
      [organizationId, memberId, `active-${suffix}@test.itemize`, `inactive-${suffix}@test.itemize`],
    );
    [activeContactId, inactiveContactId] = contacts.rows.map((row) => Number(row.id));
    memberToken = await jwt.signAsync({ id: memberId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(pool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();

    const createSegmentsRouter = require('../../../backend/src/routes/segments.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/segments', createSegmentsRouter(pool, authenticateJWT));
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id=ANY($1::int[])', [[organizationId, outsiderOrganizationId].filter(Boolean)]);
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[memberId, outsiderId].filter(Boolean)]);
    }
    if (app) await app.close();
  });

  const graphql = (
    document: string,
    variables: Record<string, unknown> = {},
    options: { token?: string; orgId?: number; csrf?: boolean } = {},
  ) => {
    const token = options.token ?? memberToken;
    const orgId = options.orgId ?? organizationId;
    const csrf = options.csrf ?? true;
    const call = request(app.getHttpServer()).post('/graphql')
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=segment-csrf` : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'segment-csrf');
    return call.send({ query: document, variables });
  };

  const fields = `id organizationId name description color icon filterType filters segmentType
    staticContactIds contactCount lastCalculatedAt isActive usedInCampaigns usedInAutomations
    createdById createdByName createdAt updatedAt`;

  it('exposes tenant-owned filter vocabulary and rejects forged organization context', async () => {
    const options = await graphql(`{ segmentFilterOptions {
      fields { id operators options } users { id name } tags { id } pipelines { id stages { id } }
    } }`, {}, { csrf: false }).expect(200);
    expect(options.body.errors).toBeUndefined();
    expect(options.body.data.segmentFilterOptions.fields.find((field: { id: string }) => field.id === 'status'))
      .toMatchObject({ options: ['active', 'inactive', 'archived'] });
    expect(options.body.data.segmentFilterOptions.users).toContainEqual({ id: memberId, name: 'Segment Member' });

    const forged = await graphql('{ segments { nodes { id } } }', {}, {
      token: outsiderToken, orgId: organizationId, csrf: false,
    }).expect(200);
    expect(forged.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('previews and creates with the shared bound evaluator, initial count, and history', async () => {
    const input = {
      filterType: 'and',
      filters: [{ field: 'custom_field', operator: 'equals', customFieldKey: 'tier', value: 'gold' }],
    };
    const preview = await graphql(
      `query Preview($input: PreviewSegmentInput!) {
        previewSegment(input: $input) { count sample { id firstName status } }
      }`, { input }, { csrf: false },
    ).expect(200);
    expect(preview.body.errors).toBeUndefined();
    expect(preview.body.data.previewSegment).toEqual({
      count: 1, sample: [{ id: activeContactId, firstName: 'Active', status: 'active' }],
    });

    const created = await graphql(
      `mutation Create($input: CreateSegmentInput!) { createSegment(input: $input) { ${fields} } }`,
      { input: { name: ' Gold ', segmentType: 'dynamic', ...input } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createSegment).toMatchObject({
      name: 'Gold', organizationId, contactCount: 1, segmentType: 'dynamic',
    });
    const id = Number(created.body.data.createSegment.id);
    const detail = await graphql(
      `query Detail($id: Int!) { segment(id: $id) {
        ${fields} history { contactCount contactsAdded contactsRemoved }
      } }`, { id }, { csrf: false },
    ).expect(200);
    expect(detail.body.data.segment.history).toEqual([
      { contactCount: 1, contactsAdded: 1, contactsRemoved: 0 },
    ]);
  });

  it('keeps bounded list/membership parity and the retained REST rollback path', async () => {
    const list = await graphql(
      `query List($filter: SegmentListFilterInput, $page: PageInput) {
        segments(filter: $filter, page: $page) { nodes { id name } pageInfo { total pageSize } }
      }`, { filter: { search: 'Gold', isActive: true }, page: { page: 1, pageSize: 10 } },
      { csrf: false },
    ).expect(200);
    expect(list.body.data.segments.pageInfo).toMatchObject({ total: 1, pageSize: 10 });
    const id = Number(list.body.data.segments.nodes[0].id);
    const contacts = await graphql(
      `query Contacts($id: Int!, $page: PageInput) {
        segmentContacts(id: $id, page: $page) {
          nodes { id firstName customFields } pageInfo { total page pageSize }
        }
      }`, { id, page: { page: 1, pageSize: 1 } }, { csrf: false },
    ).expect(200);
    expect(contacts.body.data.segmentContacts).toMatchObject({
      nodes: [{ id: activeContactId, firstName: 'Active', customFields: { tier: 'gold' } }],
      pageInfo: { total: 1, page: 1, pageSize: 1 },
    });
    const legacy = await request(legacyApp).get('/api/segments')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId)).expect(200);
    expect(legacy.body.map((segment: { id: number }) => Number(segment.id))).toContain(id);
  });

  it('preserves partial updates and serializes recalculation history', async () => {
    const row = await pool.query<{ id: number }>(
      `SELECT id FROM segments WHERE organization_id=$1 AND name='Gold'`, [organizationId],
    );
    const id = Number(row.rows[0].id);
    const before = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM segment_history WHERE segment_id=$1', [id],
    );
    const updated = await graphql(
      `mutation Update($id: Int!, $input: UpdateSegmentInput!) {
        updateSegment(id: $id, input: $input) { ${fields} }
      }`, { id, input: { description: 'Audience' } },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateSegment).toMatchObject({
      id, description: 'Audience', contactCount: 1,
      filters: [{ field: 'custom_field', operator: 'equals', custom_field_key: 'tier', value: 'gold' }],
    });
    const afterMetadata = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM segment_history WHERE segment_id=$1', [id],
    );
    expect(Number(afterMetadata.rows[0].total)).toBe(Number(before.rows[0].total));

    const updateMutation = `mutation Update($id: Int!, $input: UpdateSegmentInput!) {
      updateSegment(id: $id, input: $input) { id description color }
    }`;
    const [descriptionUpdate, colorUpdate] = await Promise.all([
      graphql(updateMutation, { id, input: { description: 'Concurrent metadata' } }).expect(200),
      graphql(updateMutation, { id, input: { color: '#123456' } }).expect(200),
    ]);
    expect(descriptionUpdate.body.errors).toBeUndefined();
    expect(colorUpdate.body.errors).toBeUndefined();
    const composed = await graphql(
      'query Detail($id: Int!) { segment(id: $id) { description color } }',
      { id }, { csrf: false },
    ).expect(200);
    expect(composed.body.data.segment).toEqual({
      description: 'Concurrent metadata', color: '#123456',
    });
    const afterConcurrentMetadata = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM segment_history WHERE segment_id=$1', [id],
    );
    expect(Number(afterConcurrentMetadata.rows[0].total)).toBe(Number(before.rows[0].total));

    const mutation = `mutation Recalculate($id: Int!) { recalculateSegment(id: $id) { id contactCount } }`;
    const [first, second] = await Promise.all([
      graphql(mutation, { id }).expect(200), graphql(mutation, { id }).expect(200),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    const history = await pool.query<{ contacts_added: number; contacts_removed: number }>(
      `SELECT contacts_added,contacts_removed FROM segment_history
       WHERE segment_id=$1 ORDER BY id DESC LIMIT 2`, [id],
    );
    expect(history.rows).toEqual([
      { contacts_added: 0, contacts_removed: 0 },
      { contacts_added: 0, contacts_removed: 0 },
    ]);
  });

  it('fails closed on invalid references, requires CSRF, and conflicts on campaign use', async () => {
    const invalid = await graphql(
      `mutation Create($input: CreateSegmentInput!) { createSegment(input: $input) { id } }`,
      { input: { name: 'Foreign', segmentType: 'static', staticContactIds: [inactiveContactId + 999999] } },
    ).expect(200);
    expect(invalid.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');

    const noCsrf = await graphql(
      `mutation { createSegment(input: {
        name: "Denied", segmentType: "static", staticContactIds: []
      }) { id } }`, {}, { csrf: false },
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const row = await pool.query<{ id: number }>(
      `SELECT id FROM segments WHERE organization_id=$1 AND name='Gold'`, [organizationId],
    );
    const id = Number(row.rows[0].id);
    const campaign = await pool.query<{ id: number }>(
      `INSERT INTO email_campaigns (organization_id,name,subject,segment_type,segment_id,created_by)
       VALUES ($1,'Segment campaign','Subject','segment',$2,$3) RETURNING id`,
      [organizationId, id, memberId],
    );
    const conflict = await graphql(
      'mutation Delete($id: Int!) { deleteSegment(id: $id) { deletedId } }', { id },
    ).expect(200);
    expect(conflict.body.errors[0].extensions).toMatchObject({ code: 'CONFLICT', reason: 'SEGMENT_IN_USE' });
    await pool.query('DELETE FROM email_campaigns WHERE id=$1', [campaign.rows[0].id]);
    const deleted = await graphql(
      'mutation Delete($id: Int!) { deleteSegment(id: $id) { deletedId } }', { id },
    ).expect(200);
    expect(deleted.body.data.deleteSegment.deletedId).toBe(id);
  });
});
