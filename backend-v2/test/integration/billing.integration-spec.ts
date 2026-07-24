import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { StripeBillingProvider } from '../../src/billing/stripe-billing.provider';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Billing GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let organizationId: number;
  let outsiderOrganizationId: number;
  let userId: number;
  let outsiderId: number;
  let token: string;
  let outsiderToken: string;
  const jwt = new JwtService();
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const provider = {
    isConfigured: jest.fn(() => true),
    createCustomer: jest.fn(async () => 'cus_graphql_billing'),
    activeSubscription: jest.fn(async () => null),
    createCheckoutSession: jest.fn(async () => 'https://checkout.stripe.test/session'),
    createPortalSession: jest.fn(async () => 'https://billing.stripe.test/portal'),
  };

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for billing tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://app.test.itemize';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const users = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Billing Member', 'email', true),
              ($2, 'Billing Outsider', 'email', true)
       RETURNING id`,
      [
        `billing-member-${suffix}@test.itemize`,
        `billing-outsider-${suffix}@test.itemize`,
      ],
    );
    [userId, outsiderId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (
         name, slug, plan, subscription_status, billing_period,
         emails_used, emails_limit, sms_used, sms_limit,
         api_calls_used, api_calls_limit, contacts_limit, users_limit,
         workflows_limit, landing_pages_limit, forms_limit, calendars_limit
       ) VALUES (
         'Billing Org', $1, 'starter', 'trialing', 'monthly',
         12, 1000, 4, 500, 20, 100, 5000, 3, 5, 10, 10, 3
       ), (
         'Billing Outsider', $2, 'starter', 'none', 'monthly',
         0, 1000, 0, 500, 0, 100, 5000, 3, 5, 10, 10, 3
       ) RETURNING id`,
      [`billing-${suffix}`, `billing-outsider-${suffix}`],
    );
    [organizationId, outsiderOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW()), ($3, $4, 'owner', NOW())`,
      [organizationId, userId, outsiderOrganizationId, outsiderId],
    );
    await pool.query(
      `UPDATE users
       SET default_organization_id = CASE id
         WHEN $1::int THEN $2::int
         WHEN $3::int THEN $4::int
       END
       WHERE id = ANY($5::int[])`,
      [
        userId,
        organizationId,
        outsiderId,
        outsiderOrganizationId,
        [userId, outsiderId],
      ],
    );
    token = await jwt.signAsync(
      { id: userId, name: 'Billing Member' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
    outsiderToken = await jwt.signAsync(
      { id: outsiderId, name: 'Billing Outsider' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(StripeBillingProvider)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (pool && (organizationId || outsiderOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, outsiderOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (userId || outsiderId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [userId, outsiderId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const graphql = (
    query: string,
    variables: Record<string, unknown> = {},
    auth = token,
    organization = organizationId,
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${auth}`)
      .set('x-organization-id', String(organization))
      .send({ query, variables });

  const mutation = (
    query: string,
    variables: Record<string, unknown> = {},
    auth = token,
    organization = organizationId,
  ) => {
    const csrf = 'billing-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${auth}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query, variables });
  };

  it('publishes only complete purchasable plans without authentication', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `query {
          billingPlans {
            id displayName popular pricing { monthly yearly }
            limits { organizations contacts calendars storage }
          }
        }`,
      })
      .expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.billingPlans.map((plan: { id: string }) => plan.id))
      .toEqual(['starter', 'unlimited', 'pro']);
    expect(response.body.data.billingPlans[1].limits.organizations).toBe(-1);
  });

  it('returns selected-organization status and usage while denying foreign context', async () => {
    const response = await graphql(`query {
      billingStatus {
        plan subscriptionStatus billingPeriod emailsUsed emailsLimit
        contactsLimit trialEndAcknowledgedAt
      }
      billingUsage {
        usage { emails { used limit percentage } sms { used limit percentage } }
        resources { contacts workflows forms landingPages }
      }
    }`).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.billingStatus).toMatchObject({
      plan: 'starter',
      subscriptionStatus: 'trialing',
      billingPeriod: 'monthly',
      emailsUsed: 12,
      emailsLimit: 1000,
      contactsLimit: 5000,
    });
    expect(response.body.data.billingUsage.usage.emails).toEqual({
      used: 12,
      limit: 1000,
      percentage: 1,
    });
    expect(response.body.data.billingUsage.resources).toEqual({
      contacts: 0,
      workflows: 0,
      forms: 0,
      landingPages: 0,
    });

    const foreign = await graphql(
      'query { billingStatus { plan } }',
      {},
      outsiderToken,
      organizationId,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('validates and serializes subscription checkout customer creation', async () => {
    const operation = `mutation Checkout($input: CreateBillingCheckoutInput!) {
      createBillingCheckoutSession(input: $input) { url }
    }`;
    const input = {
      planId: 'starter',
      billingPeriod: 'monthly',
      successUrl: 'https://app.test.itemize/payment-settings?checkout=success',
      cancelUrl: 'https://app.test.itemize/payment-settings?checkout=canceled',
      idempotencyKey: 'billing-checkout-test-key-0001',
    };

    const noCsrf = await graphql(operation, { input }).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const invalid = await mutation(operation, {
      input: { ...input, priceId: 'price_attacker', planId: undefined },
    }).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_BILLING_PRICE',
    });

    const [first, second] = await Promise.all([
      mutation(operation, { input }),
      mutation(operation, { input }),
    ]);
    expect(first.body.errors).toBeUndefined();
    expect(second.body.errors).toBeUndefined();
    expect(first.body.data.createBillingCheckoutSession.url).toBe(
      'https://checkout.stripe.test/session',
    );
    expect(provider.createCustomer).toHaveBeenCalledTimes(1);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(provider.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        priceId: 'price_starter_monthly',
      }),
    );
    const stored = await pool.query<{ stripe_customer_id: string }>(
      'SELECT stripe_customer_id FROM organizations WHERE id = $1',
      [organizationId],
    );
    expect(stored.rows[0].stripe_customer_id).toBe('cus_graphql_billing');
  });

  it('creates portal sessions and persists trial acknowledgement', async () => {
    const portal = await mutation(
      `mutation Portal($input: CreateBillingPortalInput!) {
        createBillingPortalSession(input: $input) { url }
      }`,
      {
        input: {
          returnUrl: 'https://app.test.itemize/settings?tab=billing',
          idempotencyKey: 'billing-portal-test-key-0001',
        },
      },
    ).expect(200);
    expect(portal.body.data.createBillingPortalSession.url).toBe(
      'https://billing.stripe.test/portal',
    );
    expect(provider.createPortalSession).toHaveBeenCalledWith(
      'cus_graphql_billing',
      'https://app.test.itemize/settings?tab=billing',
      'billing-portal:' + organizationId + ':billing-portal-test-key-0001',
    );

    const acknowledged = await mutation(
      'mutation { acknowledgeBillingTrialEnd { acknowledged } }',
    ).expect(200);
    expect(acknowledged.body.data.acknowledgeBillingTrialEnd.acknowledged).toBe(
      true,
    );
    const stored = await pool.query<{ acknowledged: boolean }>(
      `SELECT (trial_end_acknowledged_at IS NOT NULL) AS acknowledged
       FROM organizations WHERE id = $1`,
      [organizationId],
    );
    expect(stored.rows[0].acknowledged).toBe(true);
  });
});
