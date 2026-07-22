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

describe('Reputation reviews GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let contactId: number;
  let outsiderContactId: number;
  let platformId: number;
  let outsiderPlatformId: number;
  let memberToken: string;
  let outsiderToken: string;
  let reviewId: number;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for reputation review tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified)
       VALUES ($1,'Review Member','email',true),($2,'Review Outsider','email',true) RETURNING id`,
      [`review-member-${suffix}@test.itemize`, `review-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug)
       VALUES ('Review Primary',$1),('Review Other',$2) RETURNING id`,
      [`review-primary-${suffix}`, `review-other-${suffix}`],
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
      `INSERT INTO contacts (organization_id,first_name,last_name,email,status,source,created_by)
       VALUES ($1,'Ada','Primary',$3,'active','manual',$2),
              ($4,'Grace','Other',$5,'active','manual',$6) RETURNING id`,
      [organizationId, memberId, `ada-${suffix}@test.itemize`, outsiderOrganizationId,
        `grace-${suffix}@test.itemize`, outsiderId],
    );
    [contactId, outsiderContactId] = contacts.rows.map((row) => Number(row.id));
    const platforms = await pool.query<{ id: number }>(
      `INSERT INTO review_platforms
       (organization_id,platform,platform_name,review_url,is_active,is_connected)
       VALUES ($1,'google','Google Primary',$3,true,true),
              ($2,'facebook','Facebook Other',$4,true,true) RETURNING id`,
      [organizationId, outsiderOrganizationId,
        'https://google.example/review', 'https://facebook.example/review'],
    );
    [platformId, outsiderPlatformId] = platforms.rows.map((row) => Number(row.id));
    memberToken = await jwt.signAsync({ id: memberId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    outsiderToken = await jwt.signAsync({ id: outsiderId }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL).useValue(pool).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();

    const createReputationRouter = require('../../../backend/src/routes/reputation.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use('/api/reputation', createReputationRouter(pool, authenticateJWT, (_req: unknown, _res: unknown, next: () => void) => next()));
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
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=review-csrf` : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'review-csrf');
    return call.send({ query: document, variables });
  };

  const fields = `id organizationId platformId platform rating reviewText reviewerName reviewerEmail
    contactId status responseText respondedAt respondedBy internalNotes sentiment source reviewDate
    createdAt updatedAt platformName platformReviewUrl contactFirstName contactLastName contactEmail`;

  it('requires verified tenant context and CSRF', async () => {
    const forged = await graphql('{ reputationReviews { nodes { id } } }', {}, {
      token: outsiderToken, orgId: organizationId, csrf: false,
    }).expect(200);
    expect(forged.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const noCsrf = await graphql(
      'mutation { createReputationReview(input:{rating:5}) { id } }', {}, { csrf: false },
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('creates a tenant-qualified manual review and preserves retained REST interoperability', async () => {
    const created = await graphql(
      `mutation Create($input: CreateReputationReviewInput!) {
        createReputationReview(input: $input) { ${fields} }
      }`,
      { input: { platform: 'google', platformId, rating: 5, reviewText: ' Excellent ',
        reviewerName: ' Ada ', contactId, reviewDate: '2026-07-20T12:00:00.000Z' } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createReputationReview).toMatchObject({
      organizationId, platformId, platform: 'google', rating: 5, reviewText: 'Excellent',
      reviewerName: 'Ada', contactId, status: 'new', sentiment: 'positive', source: 'manual',
      platformName: 'Google Primary', platformReviewUrl: 'https://google.example/review',
      contactFirstName: 'Ada', contactEmail: expect.stringContaining('ada-'),
    });
    reviewId = Number(created.body.data.createReputationReview.id);

    const legacy = await request(legacyApp).get(`/api/reputation/reviews/${reviewId}`)
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId)).expect(200);
    expect(legacy.body).toMatchObject({
      id: reviewId, organization_id: organizationId, review_text: 'Excellent',
      platform_name: 'Google Primary', contact_first_name: 'Ada',
    });
  });

  it('uses bounded stable filters and private detail lookup', async () => {
    await pool.query(
      `INSERT INTO reviews (organization_id,platform,rating,reviewer_name,sentiment,source,review_date)
       VALUES ($1,'custom',3,'Neutral Person','neutral','manual','2026-07-19T12:00:00Z')`,
      [organizationId],
    );
    const list = await graphql(
      `query List($filter: ReputationReviewFilterInput, $page: PageInput) {
        reputationReviews(filter:$filter,page:$page) {
          nodes { id reviewerName rating } pageInfo { page pageSize total totalPages }
        }
      }`,
      { filter: { platform: 'google', rating: 5, sentiment: 'positive', search: 'Ada' },
        page: { page: 1, pageSize: 1 } }, { csrf: false },
    ).expect(200);
    expect(list.body.errors).toBeUndefined();
    expect(list.body.data.reputationReviews).toEqual({
      nodes: [{ id: reviewId, reviewerName: 'Ada', rating: 5 }],
      pageInfo: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    });

    const foreign = await graphql(
      'query Detail($id:Int!){ reputationReview(id:$id){ id } }', { id: reviewId },
      { token: outsiderToken, orgId: outsiderOrganizationId, csrf: false },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('composes concurrent partial updates and keeps response metadata coherent', async () => {
    const mutation = `mutation Update($id:Int!,$input:UpdateReputationReviewInput!){
      updateReputationReview(id:$id,input:$input){ id status responseText respondedBy internalNotes }
    }`;
    const [responseUpdate, noteUpdate] = await Promise.all([
      graphql(mutation, { id: reviewId, input: { responseText: 'Thank you' } }).expect(200),
      graphql(mutation, { id: reviewId, input: { internalNotes: 'Priority reviewer' } }).expect(200),
    ]);
    expect(responseUpdate.body.errors).toBeUndefined();
    expect(noteUpdate.body.errors).toBeUndefined();
    const detail = await graphql(
      'query Detail($id:Int!){ reputationReview(id:$id){ status responseText respondedBy internalNotes } }',
      { id: reviewId }, { csrf: false },
    ).expect(200);
    expect(detail.body.data.reputationReview).toEqual({
      status: 'responded', responseText: 'Thank you', respondedBy: memberId,
      internalNotes: 'Priority reviewer',
    });

    const cleared = await graphql(mutation, {
      id: reviewId, input: { responseText: null },
    }).expect(200);
    expect(cleared.body.data.updateReputationReview).toMatchObject({
      status: 'read', responseText: null, respondedBy: null,
    });
  });

  it('rejects foreign references and deletes with stable identity', async () => {
    for (const input of [
      { platform: 'facebook', platformId: outsiderPlatformId, rating: 4 },
      { rating: 4, contactId: outsiderContactId },
    ]) {
      const denied = await graphql(
        `mutation Create($input:CreateReputationReviewInput!){
          createReputationReview(input:$input){ id }
        }`, { input },
      ).expect(200);
      expect(denied.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    }

    const deleted = await graphql(
      'mutation Delete($id:Int!){ deleteReputationReview(id:$id){ deletedId } }',
      { id: reviewId },
    ).expect(200);
    expect(deleted.body.data.deleteReputationReview).toEqual({ deletedId: reviewId });
    const missing = await graphql(
      'query Detail($id:Int!){ reputationReview(id:$id){ id } }',
      { id: reviewId }, { csrf: false },
    ).expect(200);
    expect(missing.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
