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

describe('Tag and pipeline REST/GraphQL PostgreSQL parity', () => {
  let graphqlApp: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberId: number;
  let outsiderId: number;
  let memberToken: string;
  let outsiderToken: string;
  let tagId: number;
  let contactId: number;
  let pipelineId: number;
  let dealId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for CRM vocabulary tests');
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
       VALUES ($1, 'Vocabulary Member', 'email', true),
              ($2, 'Vocabulary Outsider', 'email', true)
       RETURNING id`,
      [
        `vocabulary-member-${suffix}@test.itemize`,
        `vocabulary-outsider-${suffix}@test.itemize`,
      ],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Vocabulary Org', $1), ('Vocabulary Outsider', $2)
       RETURNING id`,
      [`vocabulary-${suffix}`, `vocabulary-outsider-${suffix}`],
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

    const tag = await pool.query<{ id: number }>(
      `INSERT INTO tags (organization_id, name, color)
       VALUES ($1, 'VIP', '#F59E0B')
       RETURNING id`,
      [organizationId],
    );
    tagId = Number(tag.rows[0].id);
    const contact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, email, tags, created_by
       ) VALUES ($1, 'Tagged Contact', $2, ARRAY['VIP'], $3)
       RETURNING id`,
      [organizationId, `tagged-${suffix}@test.itemize`, memberId],
    );
    contactId = Number(contact.rows[0].id);
    const pipeline = await pool.query<{ id: number }>(
      `INSERT INTO pipelines (
         organization_id, name, description, stages, is_default, created_by
       ) VALUES (
         $1, 'Sales', 'Primary board',
         $2::jsonb, true, $3
       ) RETURNING id`,
      [
        organizationId,
        JSON.stringify([
          { id: 'lead', name: 'Lead', color: '#6B7280', order: 0 },
          { id: 'qualified', name: 'Qualified', color: '#3B82F6', order: 1 },
        ]),
        memberId,
      ],
    );
    pipelineId = Number(pipeline.rows[0].id);
    const deal = await pool.query<{ id: number }>(
      `INSERT INTO deals (
         organization_id, pipeline_id, contact_id, stage_id, title,
         value, currency, probability, assigned_to, created_by, tags
       ) VALUES (
         $1, $2, $3, 'lead', 'Parity Deal',
         1250.50, 'USD', 40, $4, $4, ARRAY['VIP']
       ) RETURNING id`,
      [organizationId, pipelineId, contactId, memberId],
    );
    dealId = Number(deal.rows[0].id);

    memberToken = await jwt.signAsync(
      { id: memberId, name: 'Vocabulary Member' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Vocabulary Outsider' },
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

    const createTagsRouter = require('../../../backend/src/routes/tags.routes');
    const createPipelinesRouter = require('../../../backend/src/routes/pipelines.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/tags', createTagsRouter(pool, authenticateJWT));
    legacyApp.use('/api/pipelines', createPipelinesRouter(pool, authenticateJWT));
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
    query: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query, variables });

  const mutation = (
    token: string,
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'vocabulary-csrf';
    return request(graphqlApp.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query, variables });
  };

  it('matches the canonical tag list, counts, suggestions, and tenant isolation', async () => {
    const legacy = await request(legacyApp)
      .get('/api/tags')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const target = await graphql(
      memberToken,
      organizationId,
      `query Tags {
        tags {
          id organizationId name color contactCount dealCount createdAt
        }
        contactTagSuggestions
      }`,
    ).expect(200);

    expect(target.body.errors).toBeUndefined();
    const targetTag = target.body.data.tags.find(
      (row: { id: number }) => row.id === tagId,
    );
    const legacyTag = legacy.body.data.find(
      (row: { id: number }) => row.id === tagId,
    );
    expect(targetTag).toMatchObject({
      id: legacyTag.id,
      organizationId: legacyTag.organization_id,
      name: legacyTag.name,
      color: legacyTag.color,
      contactCount: legacyTag.contact_count,
      dealCount: 1,
    });
    expect(target.body.data.contactTagSuggestions).toContain('VIP');

    const outsider = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      '{ tags { id } contactTagSuggestions }',
    ).expect(200);
    expect(outsider.body.data.tags).toEqual([]);
    expect(outsider.body.data.contactTagSuggestions).toEqual([]);
  });

  it('creates, renames, and deletes one canonical tag with projection updates', async () => {
    const created = await mutation(
      memberToken,
      organizationId,
      `mutation CreateTag($input: CreateTagInput!) {
        createTag(input: $input) { id name color }
      }`,
      { input: { name: '  Newsletter  ', color: '#10b981' } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createTag).toMatchObject({
      name: 'Newsletter',
      color: '#10B981',
    });
    const createdId = created.body.data.createTag.id;
    await pool.query(
      'UPDATE contacts SET tags = tags || ARRAY[$1] WHERE id = $2',
      ['Newsletter', contactId],
    );

    const renamed = await mutation(
      memberToken,
      organizationId,
      `mutation UpdateTag($id: Int!, $input: UpdateTagInput!) {
        updateTag(id: $id, input: $input) { id name color contactCount }
      }`,
      { id: createdId, input: { name: 'Dispatch' } },
    ).expect(200);
    expect(renamed.body.data.updateTag).toMatchObject({
      id: createdId,
      name: 'Dispatch',
      contactCount: 1,
    });
    const projected = await pool.query<{ tags: string[] }>(
      'SELECT tags FROM contacts WHERE id = $1',
      [contactId],
    );
    expect(projected.rows[0].tags).toContain('Dispatch');

    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation DeleteTag($id: Int!) { deleteTag(id: $id) { deletedId } }`,
      { id: createdId },
    ).expect(200);
    expect(deleted.body.data.deleteTag.deletedId).toBe(createdId);
    const afterDelete = await pool.query<{ tags: string[] }>(
      'SELECT tags FROM contacts WHERE id = $1',
      [contactId],
    );
    expect(afterDelete.rows[0].tags).not.toContain('Dispatch');
  });

  it('rejects duplicate tags, invalid colors, missing CSRF, and foreign mutations', async () => {
    const duplicate = await mutation(
      memberToken,
      organizationId,
      `mutation { createTag(input: { name: " vip " }) { id } }`,
    ).expect(200);
    expect(duplicate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'DUPLICATE_TAG_NAME',
    });

    const invalid = await mutation(
      memberToken,
      organizationId,
      `mutation { createTag(input: { name: "Bad color", color: "red" }) { id } }`,
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'color',
    });

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation { updateTag(id: ${tagId}, input: { name: "Blocked" }) { id } }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const foreign = await mutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation UpdateTag($id: Int!) {
        updateTag(id: $id, input: { name: "Foreign" }) { id }
      }`,
      { id: tagId },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('matches pipeline list/detail projections, aggregates, ordering, and privacy', async () => {
    const legacyList = await request(legacyApp)
      .get('/api/pipelines')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const targetList = await graphql(
      memberToken,
      organizationId,
      `query Pipelines {
        pipelines {
          id organizationId name description isDefault dealCount totalValue
          stages { id name color order }
        }
      }`,
    ).expect(200);
    expect(targetList.body.errors).toBeUndefined();
    const targetPipeline = targetList.body.data.pipelines.find(
      (row: { id: number }) => row.id === pipelineId,
    );
    const legacyPipeline = legacyList.body.find(
      (row: { id: number }) => row.id === pipelineId,
    );
    expect(targetPipeline).toMatchObject({
      id: legacyPipeline.id,
      organizationId: legacyPipeline.organization_id,
      name: legacyPipeline.name,
      isDefault: true,
      dealCount: 1,
      totalValue: 1250.5,
    });

    const detail = await graphql(
      memberToken,
      organizationId,
      `query Pipeline($id: Int!) {
        pipeline(id: $id) {
          id
          deals {
            id organizationId pipelineId contactId stageId title value currency
            probability assignedToId assignedToName contactFirstName
          }
        }
      }`,
      { id: pipelineId },
    ).expect(200);
    expect(detail.body.data.pipeline.deals).toEqual([
      expect.objectContaining({
        id: dealId,
        organizationId,
        pipelineId,
        contactId,
        stageId: 'lead',
        title: 'Parity Deal',
        value: '1250.50',
        assignedToName: 'Vocabulary Member',
        contactFirstName: 'Tagged Contact',
      }),
    ]);

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query Pipeline($id: Int!) { pipeline(id: $id) { id } }`,
      { id: pipelineId },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('creates and updates normalized canonical stages with explicit null semantics', async () => {
    const created = await mutation(
      memberToken,
      organizationId,
      `mutation CreatePipeline($input: CreatePipelineInput!) {
        createPipeline(input: $input) {
          id name description isDefault
          stages { id name color order }
        }
      }`,
      {
        input: {
          name: '  Partner Sales  ',
          description: '  channel  ',
          stages: [
            { id: ' incoming ', name: ' Incoming ', color: '#abcdef', order: 50 },
            { id: 'review', name: 'Review', color: '#123456', order: 0 },
          ],
          isDefault: true,
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createPipeline).toMatchObject({
      name: 'Partner Sales',
      description: 'channel',
      isDefault: true,
      stages: [
        { id: 'incoming', name: 'Incoming', color: '#ABCDEF', order: 0 },
        { id: 'review', name: 'Review', color: '#123456', order: 1 },
      ],
    });
    const createdId = created.body.data.createPipeline.id;

    const updated = await mutation(
      memberToken,
      organizationId,
      `mutation UpdatePipeline($id: Int!, $input: UpdatePipelineInput!) {
        updatePipeline(id: $id, input: $input) {
          id name description stages { id name order }
        }
      }`,
      {
        id: createdId,
        input: {
          description: null,
          stages: [
            { id: 'review', name: 'Review renamed', color: '#123456' },
            { id: 'incoming', name: 'Incoming', color: '#ABCDEF' },
          ],
        },
      },
    ).expect(200);
    expect(updated.body.data.updatePipeline).toMatchObject({
      id: createdId,
      description: null,
      stages: [
        { id: 'review', name: 'Review renamed', order: 0 },
        { id: 'incoming', name: 'Incoming', order: 1 },
      ],
    });

    const canonical = await pool.query<{
      stage_key: string;
      stage_order: number;
    }>(
      `SELECT stage_key, stage_order
       FROM pipeline_stages
       WHERE pipeline_id = $1
       ORDER BY stage_order`,
      [createdId],
    );
    expect(canonical.rows).toEqual([
      { stage_key: 'review', stage_order: 0 },
      { stage_key: 'incoming', stage_order: 1 },
    ]);
  });

  it('serializes defaults and protects used stages and non-empty pipelines', async () => {
    const createDefault = (name: string) =>
      mutation(
        memberToken,
        organizationId,
        `mutation CreatePipeline($input: CreatePipelineInput!) {
          createPipeline(input: $input) { id isDefault }
        }`,
        { input: { name, isDefault: true } },
      );
    const defaults = await Promise.all([
      createDefault(`Concurrent A ${Date.now()}`),
      createDefault(`Concurrent B ${Date.now()}`),
    ]);
    expect(defaults.every((response) => !response.body.errors)).toBe(true);
    const defaultCount = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM pipelines
       WHERE organization_id = $1 AND is_default = true`,
      [organizationId],
    );
    expect(defaultCount.rows[0].total).toBe(1);

    const stageRemoval = await mutation(
      memberToken,
      organizationId,
      `mutation UpdatePipeline($id: Int!, $input: UpdatePipelineInput!) {
        updatePipeline(id: $id, input: $input) { id }
      }`,
      {
        id: pipelineId,
        input: {
          stages: [
            { id: 'qualified', name: 'Qualified', color: '#3B82F6' },
          ],
        },
      },
    ).expect(200);
    expect(stageRemoval.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'STAGE_IN_USE',
    });

    const blockedDelete = await mutation(
      memberToken,
      organizationId,
      `mutation DeletePipeline($id: Int!) {
        deletePipeline(id: $id) { deletedId }
      }`,
      { id: pipelineId },
    ).expect(200);
    expect(blockedDelete.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'PIPELINE_HAS_DEALS',
    });

    const foreignDelete = await mutation(
      outsiderToken,
      outsiderOrganizationId,
      `mutation DeletePipeline($id: Int!) {
        deletePipeline(id: $id) { deletedId }
      }`,
      { id: pipelineId },
    ).expect(200);
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('implements strict deal reads, validation, CSRF, and tenant privacy', async () => {
    const list = await graphql(
      memberToken,
      organizationId,
      `query Deals($filter: DealFilterInput, $sort: DealSortInput, $page: PageInput) {
        deals(filter: $filter, sort: $sort, page: $page) {
          nodes { id value pipelineName contactEmail }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      {
        filter: { pipelineId, status: 'OPEN' },
        sort: { field: 'VALUE', direction: 'ASC' },
        page: { page: 1, pageSize: 10 },
      },
    ).expect(200);
    expect(list.body.errors).toBeUndefined();
    expect(list.body.data.deals.nodes).toContainEqual(expect.objectContaining({
      id: dealId,
      value: '1250.50',
      pipelineName: 'Sales',
    }));

    const foreign = await graphql(
      outsiderToken,
      outsiderOrganizationId,
      `query Deal($id: Int!) { deal(id: $id) { id } }`,
      { id: dealId },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const invalidValue = await mutation(
      memberToken,
      organizationId,
      `mutation CreateDeal($input: CreateDealInput!) {
        createDeal(input: $input) { id }
      }`,
      { input: { pipelineId, title: 'Invalid', value: '1.234' } },
    ).expect(200);
    expect(invalidValue.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'value',
    });

    const foreignContact = await pool.query<{ id: number }>(
      `INSERT INTO contacts (organization_id, first_name, created_by)
       VALUES ($1, 'Foreign deal contact', $2) RETURNING id`,
      [outsiderOrganizationId, outsiderId],
    );
    const invalidReference = await mutation(
      memberToken,
      organizationId,
      `mutation CreateDeal($input: CreateDealInput!) {
        createDeal(input: $input) { id }
      }`,
      {
        input: {
          pipelineId,
          title: 'Invalid reference',
          contactId: Number(foreignContact.rows[0].id),
        },
      },
    ).expect(200);
    expect(invalidReference.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      field: 'contactId',
    });

    const noCsrf = await graphql(
      memberToken,
      organizationId,
      `mutation CreateDeal($input: CreateDealInput!) {
        createDeal(input: $input) { id }
      }`,
      { input: { pipelineId, title: 'Blocked' } },
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('serializes deal changes and atomically records real transitions', async () => {
    const created = await mutation(
      memberToken,
      organizationId,
      `mutation CreateDeal($input: CreateDealInput!) {
        createDeal(input: $input) {
          id title value currency probability stageId contactId wonAt lostAt
        }
      }`,
      {
        input: {
          pipelineId,
          contactId,
          title: 'Lifecycle parity',
          value: '99.90',
          currency: 'usd',
          probability: 55,
        },
      },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createDeal).toMatchObject({
      title: 'Lifecycle parity',
      value: '99.90',
      currency: 'USD',
      probability: 55,
      stageId: 'lead',
      contactId,
    });
    const lifecycleDealId = created.body.data.createDeal.id;

    const update = (title: string) => mutation(
      memberToken,
      organizationId,
      `mutation UpdateDeal($id: Int!, $input: UpdateDealInput!) {
        updateDeal(id: $id, input: $input) { id title }
      }`,
      { id: lifecycleDealId, input: { title } },
    );
    const concurrent = await Promise.all([update('Concurrent A'), update('Concurrent B')]);
    expect(concurrent.every((response) => !response.body.errors)).toBe(true);

    const move = () => mutation(
      memberToken,
      organizationId,
      `mutation MoveDeal($id: Int!) {
        moveDeal(id: $id, stageId: "qualified") { id stageId }
      }`,
      { id: lifecycleDealId },
    );
    await move().expect(200);
    await move().expect(200);
    const won = await mutation(
      memberToken,
      organizationId,
      `mutation Won($id: Int!) { markDealWon(id: $id) { wonAt lostAt } }`,
      { id: lifecycleDealId },
    ).expect(200);
    expect(won.body.data.markDealWon.wonAt).toBeTruthy();
    expect(won.body.data.markDealWon.lostAt).toBeNull();
    await mutation(
      memberToken,
      organizationId,
      `mutation Won($id: Int!) { markDealWon(id: $id) { id } }`,
      { id: lifecycleDealId },
    ).expect(200);
    const lost = await mutation(
      memberToken,
      organizationId,
      `mutation Lost($id: Int!) {
        markDealLost(id: $id, reason: " Budget ") { wonAt lostAt lostReason }
      }`,
      { id: lifecycleDealId },
    ).expect(200);
    expect(lost.body.data.markDealLost).toMatchObject({
      wonAt: null,
      lostReason: 'Budget',
    });
    expect(lost.body.data.markDealLost.lostAt).toBeTruthy();
    const reopened = await mutation(
      memberToken,
      organizationId,
      `mutation Reopen($id: Int!) {
        reopenDeal(id: $id) { wonAt lostAt lostReason }
      }`,
      { id: lifecycleDealId },
    ).expect(200);
    expect(reopened.body.data.reopenDeal).toEqual({
      wonAt: null,
      lostAt: null,
      lostReason: null,
    });

    const evidence = await pool.query<{
      activities: number;
      contact_activities: number;
      triggers: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM deal_activities
          WHERE organization_id = $1 AND deal_id = $2) AS activities,
         (SELECT COUNT(*)::int FROM contact_activities
          WHERE contact_id = $3 AND type = 'deal_update'
            AND metadata->>'dealId' = $2::text) AS contact_activities,
         (SELECT COUNT(*)::int FROM workflow_triggers
          WHERE organization_id = $1 AND entity_type = 'deal' AND entity_id = $2) AS triggers`,
      [organizationId, lifecycleDealId, contactId],
    );
    expect(evidence.rows[0]).toEqual({
      activities: 4,
      contact_activities: 4,
      triggers: 4,
    });
    const kinds = await pool.query<{ kind: string; trigger_type: string }>(
      `SELECT activity.kind, trigger.trigger_type
       FROM deal_activities activity
       JOIN workflow_triggers trigger
         ON trigger.organization_id = activity.organization_id
        AND trigger.entity_id = activity.deal_id
        AND trigger.occurred_at >= activity.created_at - interval '1 second'
       WHERE activity.organization_id = $1 AND activity.deal_id = $2
       ORDER BY activity.id, trigger.id`,
      [organizationId, lifecycleDealId],
    );
    expect(new Set(kinds.rows.map((row) => row.kind))).toEqual(
      new Set(['stage_changed', 'won', 'lost', 'reopened']),
    );
    expect(new Set(kinds.rows.map((row) => row.trigger_type))).toEqual(
      new Set(['deal_stage_changed', 'deal_won', 'deal_lost', 'deal_reopened']),
    );

    const deleted = await mutation(
      memberToken,
      organizationId,
      `mutation DeleteDeal($id: Int!) { deleteDeal(id: $id) { deletedId } }`,
      { id: lifecycleDealId },
    ).expect(200);
    expect(deleted.body.data.deleteDeal.deletedId).toBe(lifecycleDealId);
  });
});
