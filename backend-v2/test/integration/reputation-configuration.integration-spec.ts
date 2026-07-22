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

describe('Reputation configuration GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let memberId: number;
  let outsiderId: number;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let memberToken: string;
  let outsiderToken: string;
  let templateId: number;
  let outsiderTemplateId: number;
  let widgetId: number;
  let widgetKey: string;
  let platformId: number;
  const jwt = new JwtService();
  const originalAppUrl = process.env.APP_URL;
  const originalPublicApiUrl = process.env.PUBLIC_API_URL;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for reputation configuration tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.APP_URL = 'https://app.test.itemize';
    process.env.PUBLIC_API_URL = 'https://api.test.itemize';
    pool = new Pool({ connectionString, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email,name,provider,email_verified)
       VALUES ($1,'Configuration Member','email',true),($2,'Configuration Outsider','email',true)
       RETURNING id`,
      [`configuration-member-${suffix}@test.itemize`, `configuration-outsider-${suffix}@test.itemize`],
    );
    [memberId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name,slug)
       VALUES ('Configuration Primary',$1),('Configuration Other',$2) RETURNING id`,
      [`configuration-primary-${suffix}`, `configuration-other-${suffix}`],
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
    const templates = await pool.query<{ id: number }>(
      `INSERT INTO email_templates (organization_id,name,subject,body_html,created_by)
       VALUES ($1,'Review request','Please review','<p>Review</p>',$3),
              ($2,'Other review','Other','<p>Other</p>',$4) RETURNING id`,
      [organizationId, outsiderOrganizationId, memberId, outsiderId],
    );
    [templateId, outsiderTemplateId] = templates.rows.map((row) => Number(row.id));
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
    legacyApp.use('/api/reputation', createReputationRouter(
      pool, authenticateJWT, (_req: unknown, _res: unknown, next: () => void) => next(),
    ));
  });

  afterAll(async () => {
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query(
        'DELETE FROM organizations WHERE id=ANY($1::int[])',
        [[organizationId, outsiderOrganizationId].filter(Boolean)],
      );
    }
    if (pool && (memberId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [[memberId, outsiderId].filter(Boolean)]);
    }
    if (app) await app.close();
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
    if (originalPublicApiUrl === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = originalPublicApiUrl;
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
      .set('Cookie', csrf ? `itemize_auth=${token}; csrf-token=configuration-csrf` : `itemize_auth=${token}`)
      .set('x-organization-id', String(orgId));
    if (csrf) call.set('x-csrf-token', 'configuration-csrf');
    return call.send({ query: document, variables });
  };

  const platformFields = `id organizationId platform platformName placeId pageId businessUrl reviewUrl
    totalReviews averageRating lastSyncedAt isActive isConnected createdAt updatedAt`;
  const widgetFields = `id organizationId widgetKey name widgetType theme primaryColor backgroundColor
    textColor borderRadius showRatingStars showReviewerPhoto showReviewDate showPlatformIcon minRating
    platforms maxReviews hideNoTextReviews autoRefresh refreshIntervalHours isActive createdAt updatedAt`;
  const settingsFields = `id organizationId autoRequestEnabled autoRequestDelayDays autoRequestChannel
    autoRequestTrigger emailTemplateId smsTemplateText negativeThreshold negativeAlertEmail
    negativeRouteInternal positiveRouteUrl defaultReviewUrl googlePlaceId newReviewNotifyEmail
    newReviewNotifySlack slackWebhookUrl createdAt updatedAt`;

  it('requires verified organization context and CSRF for configuration writes', async () => {
    const forged = await graphql('{ reputationWidgets { id } }', {}, {
      token: outsiderToken, orgId: organizationId, csrf: false,
    }).expect(200);
    expect(forged.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const noCsrf = await graphql(
      'mutation { createReputationWidget(input:{name:"Blocked"}) { id } }', {}, { csrf: false },
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('serializes null-place platform upserts, preserves REST parity, and omits OAuth secrets', async () => {
    const mutation = `mutation Save($input:UpsertReputationPlatformInput!){
      upsertReputationPlatform(input:$input){ ${platformFields} }
    }`;
    const first = await graphql(mutation, { input: {
      platform: 'custom', platformName: 'Primary listing',
      reviewUrl: 'https://reviews.example.test/primary',
    } }).expect(200);
    expect(first.body.errors).toBeUndefined();
    platformId = Number(first.body.data.upsertReputationPlatform.id);
    expect(first.body.data.upsertReputationPlatform).toMatchObject({
      organizationId, platform: 'custom', platformName: 'Primary listing',
      reviewUrl: 'https://reviews.example.test/primary', isConnected: true,
    });
    await pool.query(
      `UPDATE review_platforms SET access_token='secret-access',refresh_token='secret-refresh'
       WHERE id=$1 AND organization_id=$2`, [platformId, organizationId],
    );

    const second = await graphql(mutation, { input: {
      platform: 'custom', platformName: 'Updated listing',
      reviewUrl: 'https://reviews.example.test/updated',
    } }).expect(200);
    expect(Number(second.body.data.upsertReputationPlatform.id)).toBe(platformId);
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text count FROM review_platforms
       WHERE organization_id=$1 AND platform='custom' AND place_id IS NULL`, [organizationId],
    );
    expect(Number(count.rows[0].count)).toBe(1);

    const listed = await graphql(`{ reputationPlatforms { ${platformFields} } }`).expect(200);
    expect(listed.body.data.reputationPlatforms).toEqual([
      expect.objectContaining({ id: platformId, platformName: 'Updated listing' }),
    ]);
    const secretField = await graphql('{ reputationPlatforms { id accessToken } }').expect(400);
    expect(secretField.body.errors[0].message).toContain('Cannot query field');

    const legacy = await request(legacyApp).get('/api/reputation/platforms')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId)).expect(200);
    expect(legacy.body).toEqual([expect.objectContaining({ id: platformId, platform_name: 'Updated listing' })]);

    const privateMiss = await graphql(
      'mutation Delete($id:Int!){deleteReputationPlatform(id:$id){deletedId}}',
      { id: platformId }, { token: outsiderToken, orgId: outsiderOrganizationId },
    ).expect(200);
    expect(privateMiss.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('returns virtual settings defaults and commits validated partial updates atomically', async () => {
    const defaults = await graphql(`{ reputationSettings { ${settingsFields} } }`).expect(200);
    expect(defaults.body.data.reputationSettings).toMatchObject({
      id: null, organizationId, autoRequestEnabled: false, autoRequestDelayDays: 3,
      autoRequestChannel: 'email', autoRequestTrigger: 'deal_won', negativeThreshold: 3,
      negativeRouteInternal: true, newReviewNotifyEmail: true, newReviewNotifySlack: false,
    });

    const mutation = `mutation Settings($input:UpdateReputationSettingsInput!){
      updateReputationSettings(input:$input){ ${settingsFields} }
    }`;
    const saved = await graphql(mutation, { input: {
      autoRequestEnabled: true, autoRequestDelayDays: 5, emailTemplateId: templateId,
      negativeThreshold: 2, negativeAlertEmail: 'alerts@example.test',
      defaultReviewUrl: 'https://reviews.example.test/default',
    } }).expect(200);
    expect(saved.body.errors).toBeUndefined();
    expect(saved.body.data.updateReputationSettings).toMatchObject({
      organizationId, autoRequestEnabled: true, autoRequestDelayDays: 5,
      emailTemplateId: templateId, negativeThreshold: 2,
      defaultReviewUrl: 'https://reviews.example.test/default',
    });
    const legacy = await request(legacyApp).get('/api/reputation/settings')
      .set('Cookie', `itemize_auth=${memberToken}`)
      .set('x-organization-id', String(organizationId)).expect(200);
    expect(legacy.body).toMatchObject({ auto_request_enabled: true, email_template_id: templateId });

    const rejected = await graphql(mutation, { input: {
      autoRequestDelayDays: 9, emailTemplateId: outsiderTemplateId,
    } }).expect(200);
    expect(rejected.body.errors[0].extensions).toMatchObject({
      code: 'NOT_FOUND', field: 'input.emailTemplateId',
      reason: 'REPUTATION_CONFIGURATION_REFERENCE_NOT_FOUND',
    });
    const unchanged = await pool.query(
      'SELECT auto_request_delay_days,email_template_id FROM reputation_settings WHERE organization_id=$1',
      [organizationId],
    );
    expect(unchanged.rows[0]).toMatchObject({ auto_request_delay_days: 5, email_template_id: templateId });
  });

  it('creates and updates widgets, emits usable embed code, and filters public review data', async () => {
    const created = await graphql(
      `mutation Create($input:CreateReputationWidgetInput!){
        createReputationWidget(input:$input){ ${widgetFields} }
      }`,
      { input: { name: ' Homepage ', widgetType: 'grid', platforms: ['google'], maxReviews: 5 } },
    ).expect(200);
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data.createReputationWidget).toMatchObject({
      organizationId, name: 'Homepage', widgetType: 'grid', platforms: ['google'],
      maxReviews: 5, minRating: 4, autoRefresh: true, isActive: true,
    });
    widgetId = Number(created.body.data.createReputationWidget.id);
    widgetKey = created.body.data.createReputationWidget.widgetKey;
    expect(widgetKey).toMatch(/^[a-f0-9]{32}$/);

    const updated = await graphql(
      `mutation Update($id:Int!,$input:UpdateReputationWidgetInput!){
        updateReputationWidget(id:$id,input:$input){ ${widgetFields} }
      }`, { id: widgetId, input: { maxReviews: 2, primaryColor: '#abcdef' } },
    ).expect(200);
    expect(updated.body.data.updateReputationWidget).toMatchObject({
      id: widgetId, name: 'Homepage', widgetType: 'grid', maxReviews: 2, primaryColor: '#ABCDEF',
    });

    const embed = await graphql(
      'query Embed($id:Int!){reputationWidgetEmbedCode(id:$id){embedCode widgetKey}}', { id: widgetId },
    ).expect(200);
    expect(embed.body.data.reputationWidgetEmbedCode).toMatchObject({ widgetKey });
    expect(embed.body.data.reputationWidgetEmbedCode.embedCode)
      .toContain('https://app.test.itemize/widget/reviews.js');
    expect(embed.body.data.reputationWidgetEmbedCode.embedCode)
      .toContain('data-api-base="https://api.test.itemize"');

    await pool.query(
      `INSERT INTO reviews
       (organization_id,platform,rating,review_text,reviewer_name,status,source,review_date)
       VALUES ($1,'google',5,'Visible review','Visible reviewer','new','manual',NOW()),
              ($1,'google',5,'Legacy review','Legacy reviewer',NULL,'manual',NOW()-INTERVAL '1 second'),
              ($1,'google',5,'Hidden review','Hidden reviewer','hidden','manual',NOW()+INTERVAL '1 second'),
              ($2,'google',5,'Other tenant','Other reviewer','new','manual',NOW())`,
      [organizationId, outsiderOrganizationId],
    );
    const publicWidget = await request(legacyApp)
      .get(`/api/reputation/public/widget/${widgetKey}`).expect(200);
    expect(publicWidget.headers['cache-control']).toBe('no-store');
    expect(publicWidget.body.reviews).toEqual([
      expect.objectContaining({ review_text: 'Visible review', reviewer_name: 'Visible reviewer' }),
      expect.objectContaining({ review_text: 'Legacy review', reviewer_name: 'Legacy reviewer' }),
    ]);
    const malformed = await request(legacyApp)
      .get('/api/reputation/public/widget/not-a-capability').expect(404);
    expect(malformed.headers['cache-control']).toBe('no-store');

    const invalid = await graphql(
      `mutation Update($id:Int!,$input:UpdateReputationWidgetInput!){
        updateReputationWidget(id:$id,input:$input){ id }
      }`, { id: widgetId, input: { minRating: 6 } },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT', field: 'input.minRating',
    });
    const stillValid = await pool.query('SELECT min_rating FROM review_widgets WHERE id=$1', [widgetId]);
    expect(stillValid.rows[0].min_rating).toBe(4);
  });

  it('conceals foreign widget IDs and revokes the public capability before deletion', async () => {
    const foreign = await graphql(
      'query Embed($id:Int!){reputationWidgetEmbedCode(id:$id){widgetKey}}', { id: widgetId },
      { token: outsiderToken, orgId: outsiderOrganizationId },
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');

    await graphql(
      'mutation Off($id:Int!,$input:UpdateReputationWidgetInput!){updateReputationWidget(id:$id,input:$input){isActive}}',
      { id: widgetId, input: { isActive: false } },
    ).expect(200);
    await request(legacyApp).get(`/api/reputation/public/widget/${widgetKey}`).expect(404);

    const deleted = await graphql(
      'mutation Delete($id:Int!){deleteReputationWidget(id:$id){deletedId}}', { id: widgetId },
    ).expect(200);
    expect(deleted.body.data.deleteReputationWidget.deletedId).toBe(widgetId);
    const repeated = await graphql(
      'mutation Delete($id:Int!){deleteReputationWidget(id:$id){deletedId}}', { id: widgetId },
    ).expect(200);
    expect(repeated.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });
});
