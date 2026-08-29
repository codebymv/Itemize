import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Analytics GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let userId: number;
  let organizationId: number;
  let otherOrganizationId: number;
  let pipelineId: number;
  let foreignPipelineId: number;
  let token: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) throw new Error('TEST_DATABASE_URL is required for analytics tests');
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Analytics Member', 'email', true) RETURNING id`,
      [`analytics-member-${suffix}@test.itemize`],
    );
    userId = Number(user.rows[0].id);
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Analytics Primary', $1), ('Analytics Foreign', $2)
       RETURNING id`,
      [`analytics-primary-${suffix}`, `analytics-foreign-${suffix}`],
    );
    [organizationId, otherOrganizationId] = organizations.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $3, 'owner', NOW())`,
      [organizationId, otherOrganizationId, userId],
    );
    await pool.query('UPDATE users SET default_organization_id = $1 WHERE id = $2', [organizationId, userId]);

    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, email, status, source, created_by
       ) VALUES
         ($1, 'Own', $3, 'active', 'manual', $5),
         ($2, 'Foreign', $4, 'active', 'manual', $5)
       RETURNING id`,
      [
        organizationId,
        otherOrganizationId,
        `analytics-own-${suffix}@test.itemize`,
        `analytics-foreign-${suffix}@test.itemize`,
        userId,
      ],
    );
    const [contactId, foreignContactId] = contacts.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO contact_activities (contact_id, user_id, type, title, content, created_at)
       VALUES
         ($1, $3, 'system', 'Own activity', '{"action":"created"}'::jsonb, NOW()),
         ($2, $3, 'system', 'Foreign activity', '{"action":"created"}'::jsonb, NOW() + INTERVAL '1 minute')`,
      [contactId, foreignContactId, userId],
    );

    const stages = JSON.stringify([
      { id: 'qualified', name: 'Qualified', color: '#112233' },
      { id: 'proposal', name: 'Proposal', color: '#445566' },
    ]);
    const pipelines = await pool.query<{ id: number }>(
      `INSERT INTO pipelines (organization_id, name, stages, is_default, created_by)
       VALUES
         ($1, 'Primary pipeline', $3::jsonb, TRUE, $4),
         ($2, 'Foreign pipeline', $3::jsonb, TRUE, $4)
       RETURNING id`,
      [organizationId, otherOrganizationId, stages, userId],
    );
    [pipelineId, foreignPipelineId] = pipelines.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO deals (
         organization_id, pipeline_id, contact_id, stage_id, title, value, created_by, won_at
       ) VALUES
         ($1, $3, $5, 'qualified', 'Booked sale', 100, $7, NOW()),
         ($1, $3, $5, 'proposal', 'Open deal', 25, $7, NULL),
         ($2, $4, $6, 'qualified', 'Foreign sale', 900, $7, NOW())`,
      [
        organizationId,
        otherOrganizationId,
        pipelineId,
        foreignPipelineId,
        contactId,
        foreignContactId,
        userId,
      ],
    );
    await pool.query(
      `INSERT INTO payments (organization_id, amount, payment_method, status, paid_at)
       VALUES
         ($1, 50, 'cash', 'succeeded', NOW()),
         ($2, 700, 'cash', 'succeeded', NOW())`,
      [organizationId, otherOrganizationId],
    );
    const form = await pool.query<{ id: number }>(
      `INSERT INTO forms (organization_id, name, slug, status, created_by)
       VALUES ($1, 'Analytics form', $2, 'published', $3) RETURNING id`,
      [organizationId, `analytics-form-${suffix}`, userId],
    );
    await pool.query(
      `INSERT INTO form_submissions (form_id, organization_id, contact_id, data)
       VALUES ($1, $2, $3, '{"email":"converted@test.itemize"}'::jsonb)`,
      [Number(form.rows[0].id), organizationId, contactId],
    );

    const calendar = await pool.query<{ id: number }>(
      `INSERT INTO calendars (organization_id, name, slug, timezone, created_by)
       VALUES ($1, 'Analytics calendar', $2, 'UTC', $3) RETURNING id`,
      [organizationId, `analytics-calendar-${suffix}`, userId],
    );
    await pool.query(
      `INSERT INTO bookings (
         organization_id, calendar_id, title, start_time, end_time, timezone, status
       ) VALUES
         ($1, $2, 'Upcoming', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'UTC', 'confirmed'),
         ($1, $2, 'Cancelled future', NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'UTC', 'cancelled')`,
      [organizationId, Number(calendar.rows[0].id)],
    );
    await pool.query(
      `INSERT INTO invoices (
         organization_id, invoice_number, due_date, subtotal, total, amount_due, status, created_by
       ) VALUES ($1, $2, CURRENT_DATE + 7, 20, 20, 20, 'sent', $3)`,
      [organizationId, `AN-${suffix}`, userId],
    );
    await pool.query(
      `INSERT INTO bookings (
         organization_id, calendar_id, title, start_time, end_time, timezone, status
       ) VALUES
         ($1, $2, 'Completed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '47 hours', 'UTC', 'completed'),
         ($1, $2, 'No show', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', 'UTC', 'no_show')`,
      [organizationId, Number(calendar.rows[0].id)],
    );
    await pool.query(
      `INSERT INTO email_logs (organization_id, contact_id, to_email, subject, status, queued_at)
       VALUES
         ($1, $2, $3, 'Clicked', 'clicked', NOW() - INTERVAL '1 hour'),
         ($1, $2, $3, 'Delivered', 'delivered', NOW() - INTERVAL '1 hour'),
         ($4, $5, $6, 'Foreign', 'clicked', NOW() - INTERVAL '1 hour')`,
      [
        organizationId, contactId, `analytics-own-${suffix}@test.itemize`,
        otherOrganizationId, foreignContactId, `analytics-foreign-${suffix}@test.itemize`,
      ],
    );
    await pool.query(
      `INSERT INTO sms_logs (
         organization_id, contact_id, to_phone, message, direction, status, segments, queued_at
       ) VALUES
         ($1, $2, '+15205550001', 'Delivered', 'outbound', 'delivered', 2, NOW() - INTERVAL '1 hour'),
         ($1, $2, '+15205550001', 'Failed', 'outbound', 'failed', 1, NOW() - INTERVAL '1 hour'),
         ($1, $2, '+15205550001', 'Inbound', 'inbound', 'received', 5, NOW() - INTERVAL '1 hour'),
         ($3, $4, '+15205550002', 'Foreign', 'outbound', 'delivered', 9, NOW() - INTERVAL '1 hour')`,
      [organizationId, contactId, otherOrganizationId, foreignContactId],
    );
    const workflows = await pool.query<{ id: number }>(
      `INSERT INTO workflows (
         organization_id, name, trigger_type, is_active, stats, created_by
       ) VALUES
         ($1, 'Primary workflow', 'contact_added', TRUE, '{"enrolled":999}'::jsonb, $3),
         ($2, 'Foreign workflow', 'contact_added', TRUE, '{}'::jsonb, $3)
       RETURNING id`,
      [organizationId, otherOrganizationId, userId],
    );
    const [workflowId, foreignWorkflowId] = workflows.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO workflow_enrollments (workflow_id, contact_id, status)
       VALUES
         ($1, $3, 'completed'),
         ($1, $4, 'active'),
         ($2, $4, 'failed')`,
      [workflowId, foreignWorkflowId, contactId, foreignContactId],
    );

    token = await jwt.signAsync(
      { id: userId },
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

    legacyApp = express();
    legacyApp.use(express.json());
  });

  afterAll(async () => {
    if (pool && (organizationId || otherOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, otherOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (app) await app.close();
  });

  const graphql = (organization: number) => request(app.getHttpServer())
    .post('/graphql')
    .set('Cookie', `itemize_auth=${token}`)
    .set('x-organization-id', String(organization))
    .send({
      query: `query {
        dashboardAnalytics {
          asOf reportingTimezone
          contacts {
            total active newThisMonth newThisWeek
            growth { month count }
            recentContacts { id name email }
          }
          deals {
            total open won lost
            funnel { stageId stageName stageColor dealCount }
          }
          bookings { total confirmed pending cancelled upcomingThisWeek upcomingToday }
          tasks { total pending inProgress completed overdue }
          pipelines { total }
          recentActivity { id type title content createdAt contactId }
          invoiceMetrics {
            pending overdue paidThisMonth countThisMonth
            recentInvoices { id number amount status }
          }
          signatureMetrics { awaiting signedThisWeek total recentDocuments { id title status date } }
          workspaceMetrics { activeItems lists notes recentItems { type title date } }
        }
      }`,
    });

  const graphqlQuery = (
    organization: number,
    query: string,
    variables: Record<string, unknown> = {},
  ) => request(app.getHttpServer())
    .post('/graphql')
    .set('Cookie', `itemize_auth=${token}`)
    .set('x-organization-id', String(organization))
    .send({ query, variables });

  it('returns a typed, tenant-isolated snapshot without misleading money aggregates', async () => {
    const response = await graphql(organizationId).expect(200);
    expect(response.body.errors).toBeUndefined();
    const result = response.body.data.dashboardAnalytics;
    expect(result.reportingTimezone).toBe('UTC');
    expect(new Date(result.asOf).toISOString()).toBe(result.asOf);
    expect(result.contacts).toMatchObject({ total: 1, active: 1 });
    expect(result.contacts.recentContacts).toEqual([
      expect.objectContaining({ name: 'Own' }),
    ]);
    expect(result.contacts.recentContacts[0].email).toContain('analytics-own-');
    expect(result.contacts.recentContacts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Foreign' })]),
    );
    expect(result.deals).toMatchObject({
      total: 2,
      open: 1,
      won: 1,
    });
    expect(result.deals.funnel).toEqual([
      expect.objectContaining({ stageId: 'qualified', dealCount: 0 }),
      expect.objectContaining({ stageId: 'proposal', dealCount: 1 }),
    ]);
    expect(result.bookings).toMatchObject({ total: 4, cancelled: 1, upcomingToday: 1 });
    expect(result.recentActivity).toEqual([
      expect.objectContaining({ title: 'Own activity', content: { action: 'created' } }),
    ]);
    expect(result.invoiceMetrics).toMatchObject({ pending: 1, countThisMonth: 1 });
  });

  it('leaves no retained HTTP Analytics surface', async () => {
    const responses = await Promise.all([
      request(legacyApp).get('/api/analytics/dashboard'),
      request(legacyApp).get('/api/analytics/contacts/trends'),
      request(legacyApp).get('/api/analytics/deals/performance'),
      request(legacyApp).get('/api/analytics/bookings/summary'),
      request(legacyApp).get('/api/analytics/communication-stats'),
      request(legacyApp).get('/api/analytics/workflow-performance'),
      request(legacyApp).get('/api/analytics/conversion-rates'),
      request(legacyApp).get('/api/analytics/revenue-trends'),
      request(legacyApp).get('/api/analytics/pipeline-velocity'),
    ]);
    expect(responses.map((response) => response.status)).toEqual(
      Array(9).fill(404),
    );
  });

  it('uses the authenticated default organization and rejects anonymous reads', async () => {
    const defaultOrganization = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .send({ query: 'query { dashboardAnalytics { asOf } }' })
      .expect(200);
    expect(defaultOrganization.body.errors).toBeUndefined();
    expect(defaultOrganization.body.data.dashboardAnalytics.asOf).toBeTruthy();

    const unauthenticated = await request(app.getHttpServer())
      .post('/graphql')
      .set('x-organization-id', String(organizationId))
      .send({ query: 'query { dashboardAnalytics { asOf } }' })
      .expect(200);
    expect(unauthenticated.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('returns typed, tenant-isolated metrics for the five dedicated analytics reads', async () => {
    const response = await graphqlQuery(
      organizationId,
      `query AnalyticsReads(
        $contacts: ContactAnalyticsPeriod,
        $deals: DealAnalyticsPeriod,
        $communications: CommunicationAnalyticsPeriod
      ) {
        contactTrends(period: $contacts) {
          asOf reportingTimezone period data { period newContacts withSource }
        }
        dealPerformance(period: $deals) {
          asOf period metrics { closedTotal wonCount lostCount winRate avgDealValue totalRevenue avgDaysToClose }
        }
        bookingAnalytics {
          asOf total confirmed completed cancelled noShow createdThisMonth upcoming completionRate
        }
        communicationStats(period: $communications) {
          asOf period
          email { total sent delivered opened clicked bounced failed rates { delivery open click } }
          sms { total outbound inbound sent delivered failed segments rates { delivery } }
        }
        workflowPerformance {
          asOf workflows {
            id name triggerType isActive enrollments { total completed active failed } completionRate stats
          }
          summary {
            totalWorkflows activeWorkflows totalEnrollments completedEnrollments
            activeEnrollments failedEnrollments overallCompletionRate
          }
        }
      }`,
      { contacts: 'DAYS_30', deals: 'DAYS_30', communications: 'DAYS_30' },
    ).expect(200);
    expect(response.body.errors).toBeUndefined();
    const result = response.body.data;
    expect(result.contactTrends).toMatchObject({ period: '30days', reportingTimezone: 'UTC' });
    expect(result.contactTrends.data.reduce(
      (sum: number, bucket: { newContacts: number }) => sum + bucket.newContacts,
      0,
    )).toBe(1);
    expect(result.dealPerformance).toMatchObject({
      period: '30days',
      metrics: { closedTotal: 1, wonCount: 1, lostCount: 0, winRate: 100, avgDealValue: 100, totalRevenue: 100 },
    });
    expect(result.bookingAnalytics).toMatchObject({
      total: 4, confirmed: 1, completed: 1, cancelled: 1, noShow: 1,
      upcoming: 1, completionRate: 50,
    });
    expect(result.communicationStats).toMatchObject({
      period: '30days',
      email: { total: 2, sent: 2, delivered: 2, opened: 1, clicked: 1, rates: { delivery: 100, open: 50, click: 100 } },
      sms: { total: 3, outbound: 2, inbound: 1, sent: 1, delivered: 1, failed: 1, segments: 3, rates: { delivery: 50 } },
    });
    expect(result.workflowPerformance).toMatchObject({
      workflows: [{
        name: 'Primary workflow', enrollments: { total: 1, completed: 1, active: 0, failed: 0 },
        completionRate: 100, stats: { enrolled: 999 },
      }],
      summary: {
        totalWorkflows: 1, activeWorkflows: 1, totalEnrollments: 1,
        completedEnrollments: 1, activeEnrollments: 0, failedEnrollments: 0,
        overallCompletionRate: 100,
      },
    });
  });

  it('reports corrected conversion, currency-separated revenue, and honest open-deal age', async () => {
    const response = await graphqlQuery(
      organizationId,
      `query CorrectedAnalytics(
        $conversion: ConversionAnalyticsPeriod,
        $revenue: RevenueAnalyticsPeriod,
        $pipelineId: Int
      ) {
        conversionRates(period: $conversion) {
          period
          dealWinRate {
            rate won lost totalClosed
            valuesByCurrency { currency wonValue lostValue }
          }
          formToContact { rate submissions converted }
        }
        revenueTrends(period: $revenue) {
          period
          currencies {
            currency
            data {
              dealsWon paymentsCount bookedRevenue collectedRevenue
              cumulativeBookedRevenue cumulativeCollectedRevenue
            }
            summary {
              totalBookedRevenue totalCollectedRevenue totalDeals totalPayments
              averageBookedDealValue averageCollectedPayment
            }
          }
        }
        pipelineDealAge(pipelineId: $pipelineId) {
          pipeline { id name }
          stages {
            stageId openDealCount averageOpenDealAgeDays
            openValueByCurrency { currency amount }
          }
          summary { averageDaysToWin openDeals wonDeals lostDeals winRate }
        }
      }`,
      { conversion: 'DAYS_30', revenue: 'MONTHS_6', pipelineId },
    ).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.conversionRates).toMatchObject({
      period: '30days',
      dealWinRate: {
        rate: 100, won: 1, lost: 0, totalClosed: 1,
        valuesByCurrency: [{ currency: 'USD', wonValue: 100, lostValue: 0 }],
      },
      formToContact: { rate: 100, submissions: 1, converted: 1 },
    });
    expect(response.body.data.revenueTrends).toMatchObject({
      period: '6months',
      currencies: [{
        currency: 'USD',
        summary: {
          totalBookedRevenue: 100,
          totalCollectedRevenue: 50,
          totalDeals: 1,
          totalPayments: 1,
          averageBookedDealValue: 100,
          averageCollectedPayment: 50,
        },
      }],
    });
    const stage = response.body.data.pipelineDealAge.stages.find(
      (candidate: { stageId: string }) => candidate.stageId === 'proposal',
    );
    expect(response.body.data.pipelineDealAge.pipeline).toMatchObject({
      id: pipelineId,
      name: 'Primary pipeline',
    });
    expect(stage).toMatchObject({
      openDealCount: 1,
      openValueByCurrency: [{ currency: 'USD', amount: 25 }],
    });
    expect(stage.averageOpenDealAgeDays).toBeGreaterThanOrEqual(0);
    expect(response.body.data.pipelineDealAge.summary).toMatchObject({
      openDeals: 1, wonDeals: 1, lostDeals: 0, winRate: 100,
    });

    const foreign = await graphqlQuery(
      organizationId,
      'query ($pipelineId: Int) { pipelineDealAge(pipelineId: $pipelineId) { pipeline { id } stages { stageId } } }',
      { pipelineId: foreignPipelineId },
    ).expect(200);
    expect(foreign.body.errors).toBeUndefined();
    expect(foreign.body.data.pipelineDealAge).toEqual({ pipeline: null, stages: [] });
  });

  it('rejects unsupported enum values before executing analytics SQL', async () => {
    const response = await graphqlQuery(
      organizationId,
      'query InvalidPeriod($period: ContactAnalyticsPeriod) { contactTrends(period: $period) { period } }',
      { period: 'FOREVER' },
    ).expect(400);
    expect(response.body.data).toBeUndefined();
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});
