import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import {
  createStripeConnectState,
  verifyStripeConnectState,
} from '../../src/stripe-connect/stripe-connect-state';
import {
  FACEBOOK_GRAPH_CLIENT,
  FacebookGraphClient,
} from '../../src/social-oauth/facebook-graph.provider';
import {
  STRIPE_CONNECT_CLIENT,
  StripeConnectClient,
} from '../../src/stripe-connect/stripe-connect.provider';

class FakeFacebookGraph implements FacebookGraphClient {
  async exchangeCode() {
    return { access_token: 'fb-user-access-token' };
  }
  async getPages() {
    return {
      data: [
        {
          id: 'page-1',
          name: 'Acme Page',
          access_token: 'page-token-1',
          instagram_business_account: {
            id: 'ig-1',
            username: 'acme.ig',
            profile_picture_url: 'https://cdn.example/ig.png',
          },
        },
      ],
    };
  }
  async getMe() {
    return { id: 'fb-user-1' };
  }
}

class FakeStripeConnect implements StripeConnectClient {
  account = {
    stripeAccountId: 'acct_parity123',
    chargesEnabled: true,
    detailsSubmitted: true,
  };
  onboardingStates: string[] = [];

  async createAccount() {
    return {
      stripeAccountId: 'acct_parity123',
      chargesEnabled: false,
      detailsSubmitted: false,
    };
  }

  async retrieveAccount(stripeAccountId: string) {
    return stripeAccountId === this.account.stripeAccountId
      ? this.account
      : null;
  }

  async createOnboardingLink(_stripeAccountId: string, state: string) {
    this.onboardingStates.push(state);
    return `https://connect.stripe.test/onboarding?state=${encodeURIComponent(state)}`;
  }
}

describe('Provider OAuth protocol', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let owner: any;
  let fakeStripe: FakeStripeConnect;

  const authCookie = () => `itemize_auth=${owner.token}`;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for provider OAuth tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.FRONTEND_URL = 'https://app.itemize.test';
    process.env.BACKEND_URL = 'https://api.itemize.test';
    process.env.FACEBOOK_APP_ID = 'fake-fb-app-id';
    process.env.FACEBOOK_APP_SECRET = 'fake-fb-app-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    delete process.env.FACEBOOK_REDIRECT_URI;
    delete process.env.STRIPE_CONNECT_REDIRECT_URI;
    delete process.env.STRIPE_CONNECT_STATE_SECRET;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `provider-oauth-${Date.now()}@test.itemize`,
      'Provider OAuth Owner',
    );

    fakeStripe = new FakeStripeConnect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(FACEBOOK_GRAPH_CLIENT)
      .useValue(new FakeFacebookGraph())
      .overrideProvider(STRIPE_CONNECT_CLIENT)
      .useValue(fakeStripe)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();

  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it('mints Facebook authorization URLs and stores single-use states', async () => {
    const nest = await request(app.getHttpServer())
        .get('/api/social/connect/facebook')
        .set('Cookie', authCookie())
        .set('x-organization-id', String(owner.org.id));
    expect(nest.status).toBe(200);

    const nestUrl = new URL(nest.body.auth_url);
    expect(nestUrl.origin + nestUrl.pathname).toBe(
      'https://www.facebook.com/v18.0/dialog/oauth',
    );
    expect(nestUrl.searchParams.get('client_id')).toBe('fake-fb-app-id');
    const states = await pool.query(
      `SELECT state FROM oauth_states
       WHERE provider = 'facebook' AND organization_id = $1`,
      [owner.org.id],
    );
    const stored = new Set(states.rows.map((row) => row.state));
    expect(stored.has(nestUrl.searchParams.get('state'))).toBe(true);
  });

  it('rejects Facebook callback failures before any Graph call', async () => {
    const missing = await Promise.all([
      request(app.getHttpServer()).get('/api/social/callback/facebook'),
      request(app.getHttpServer()).get('/api/social/callback/facebook'),
    ]);
    expect(missing[0].status).toBe(302);
    expect(missing[0].headers.location).toBe(missing[1].headers.location);
    expect(missing[0].headers.location).toContain('error=missing_params');

    const invalid = await Promise.all([
      request(app.getHttpServer()).get(
        '/api/social/callback/facebook?code=abc&state=unknown-state',
      ),
      request(app.getHttpServer()).get(
        '/api/social/callback/facebook?code=abc&state=unknown-state',
      ),
    ]);
    expect(invalid[0].headers.location).toBe(invalid[1].headers.location);
    expect(invalid[0].headers.location).toContain('error=invalid_state');

    const providerError = await Promise.all([
      request(app.getHttpServer()).get(
        '/api/social/callback/facebook?error=access_denied&error_description=User%20denied',
      ),
      request(app.getHttpServer()).get(
        '/api/social/callback/facebook?error=access_denied&error_description=User%20denied',
      ),
    ]);
    expect(providerError[0].headers.location).toBe(
      providerError[1].headers.location,
    );
  });

  it('completes a stored Facebook state through the callback and connects channels', async () => {
    const begin = await request(app.getHttpServer())
      .get('/api/social/connect/facebook')
      .set('Cookie', authCookie())
      .set('x-organization-id', String(owner.org.id))
      .expect(200);
    const state = new URL(begin.body.auth_url).searchParams.get('state');

    const response = await request(app.getHttpServer()).get(
      `/api/social/callback/facebook?code=fb-code&state=${state}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://app.itemize.test/settings/integrations?success=facebook_connected',
    );

    const channels = await pool.query(
      `SELECT channel_type, external_id, name, username, page_access_token, is_connected
       FROM social_channels
       WHERE organization_id = $1
       ORDER BY channel_type`,
      [owner.org.id],
    );
    expect(channels.rows).toEqual([
      expect.objectContaining({
        channel_type: 'facebook',
        external_id: 'page-1',
        name: 'Acme Page',
        page_access_token: 'page-token-1',
        is_connected: true,
      }),
      expect.objectContaining({
        channel_type: 'instagram',
        external_id: 'ig-1',
        username: 'acme.ig',
        is_connected: true,
      }),
    ]);

    const replay = await request(app.getHttpServer()).get(
      `/api/social/callback/facebook?code=fb-code&state=${state}`,
    );
    expect(replay.headers.location).toContain('error=invalid_state');
  });

  it('starts Stripe-hosted onboarding with a tenant-bound state', async () => {
    const csrf = 'stripe-start-csrf';
    const started = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `${authCookie()}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(owner.org.id))
      .send({
        query: `mutation StartStripe($returnUrl: String) {
          startStripeConnect(returnUrl: $returnUrl)
        }`,
        variables: { returnUrl: '/payment-settings?from=setup' },
      });
    expect(started.status).toBe(200);
    expect(started.body.errors).toBeUndefined();
    const url = new URL(started.body.data.startStripeConnect);
    expect(url.origin + url.pathname).toBe(
      'https://connect.stripe.test/onboarding',
    );
    expect(verifyStripeConnectState(url.searchParams.get('state'))).toEqual({
      userId: owner.user.id,
      organizationId: owner.org.id,
      returnPath: '/payment-settings?from=setup',
    });
    expect(fakeStripe.onboardingStates).toHaveLength(1);
    const settings = await pool.query(
      `SELECT stripe_account_id, stripe_publishable_key, stripe_connected
       FROM payment_settings WHERE organization_id = $1`,
      [owner.org.id],
    );
    expect(settings.rows[0]).toMatchObject({
      stripe_account_id: 'acct_parity123',
      stripe_publishable_key: null,
      stripe_connected: false,
    });
  });

  it('completes Stripe-hosted onboarding through the signed return route', async () => {
    const state = createStripeConnectState({
      userId: owner.user.id,
      organizationId: owner.org.id,
      returnUrl: '/payment-settings?from=setup',
    });
    const callback = await request(app.getHttpServer()).get(
      `/api/invoice-integrations/stripe/return?state=${encodeURIComponent(state)}`,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(
      'https://app.itemize.test/payment-settings?from=setup&stripe_connected=true',
    );

    const settings = await pool.query(
      `SELECT stripe_account_id, stripe_publishable_key, stripe_connected
       FROM payment_settings WHERE organization_id = $1`,
      [owner.org.id],
    );
    expect(settings.rows[0]).toMatchObject({
      stripe_account_id: 'acct_parity123',
      stripe_publishable_key: null,
      stripe_connected: true,
    });
  });

  it('disconnects Stripe through the GraphQL mutation', async () => {
    await pool.query(
      `INSERT INTO payment_settings (
         organization_id, stripe_account_id, stripe_publishable_key,
         stripe_connected, stripe_connected_at
       ) VALUES ($1, 'acct_mutation123', 'pk_test_mutation', TRUE, NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         stripe_account_id = EXCLUDED.stripe_account_id,
         stripe_publishable_key = EXCLUDED.stripe_publishable_key,
         stripe_connected = TRUE,
         stripe_connected_at = NOW()`,
      [owner.org.id],
    );
    const csrf = 'stripe-disconnect-csrf';
    const mutate = () =>
      request(app.getHttpServer())
        .post('/graphql')
        .set('Cookie', `${authCookie()}; csrf-token=${csrf}`)
        .set('x-csrf-token', csrf)
        .set('x-organization-id', String(owner.org.id))
        .send({ query: 'mutation DisconnectStripe { disconnectStripe }' });

    const first = await mutate();
    expect(first.status).toBe(200);
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data).toEqual({ disconnectStripe: true });

    const cleared = await pool.query(
      `SELECT stripe_account_id, stripe_publishable_key, stripe_connected, stripe_connected_at
       FROM payment_settings WHERE organization_id = $1`,
      [owner.org.id],
    );
    expect(cleared.rows[0]).toMatchObject({
      stripe_account_id: 'acct_mutation123',
      stripe_publishable_key: null,
      stripe_connected: false,
      stripe_connected_at: null,
    });

    // Idempotent already-disconnected outcome, exactly like the REST route.
    const replay = await mutate();
    expect(replay.body.errors).toBeUndefined();
    expect(replay.body.data).toEqual({ disconnectStripe: true });
  });

  it('refuses the disconnect mutation without a session or CSRF evidence', async () => {
    const anonymous = await request(app.getHttpServer())
      .post('/graphql')
      .set('x-organization-id', String(owner.org.id))
      .send({ query: 'mutation DisconnectStripe { disconnectStripe }' });
    expect(anonymous.body.data ?? null).toBeNull();
    expect(anonymous.body.errors?.length).toBeGreaterThan(0);

    const withoutCsrf = await request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', authCookie())
      .set('x-organization-id', String(owner.org.id))
      .send({ query: 'mutation DisconnectStripe { disconnectStripe }' });
    expect(withoutCsrf.body.data ?? null).toBeNull();
    expect(withoutCsrf.body.errors?.length).toBeGreaterThan(0);
  });

  it('rejects invalid Stripe onboarding return states consistently', async () => {
    const badState = await Promise.all([
      request(app.getHttpServer()).get(
        '/api/invoice-integrations/stripe/return?state=bad',
      ),
      request(app.getHttpServer()).get(
        '/api/invoice-integrations/stripe/return?state=bad',
      ),
    ]);
    expect(badState[0].headers.location).toBe(badState[1].headers.location);
    expect(badState[0].headers.location).toContain('error=onboarding_failed');

    const foreign = await dbHelper.seedUser(
      `provider-foreign-${Date.now()}@test.itemize`,
      'Foreign Provider Owner',
    );
    const crossTenant = createStripeConnectState({
      userId: owner.user.id,
      organizationId: foreign.org.id,
    });
    const nonMember = await Promise.all([
      request(app.getHttpServer()).get(
        `/api/invoice-integrations/stripe/return?state=${encodeURIComponent(crossTenant)}`,
      ),
      request(app.getHttpServer()).get(
        `/api/invoice-integrations/stripe/return?state=${encodeURIComponent(crossTenant)}`,
      ),
    ]);
    expect(nonMember[0].headers.location).toBe(nonMember[1].headers.location);
    expect(nonMember[0].headers.location).toContain('error=onboarding_failed');
  });

  it('denies unauthenticated starts for both providers', async () => {
    const facebook = await request(app.getHttpServer()).get(
      '/api/social/connect/facebook',
    );
    expect(facebook.status).toBe(401);
    const stripe = await request(app.getHttpServer())
      .post('/graphql')
      .set('x-organization-id', String(owner.org.id))
      .send({
        query: `mutation StartStripe($returnUrl: String) {
          startStripeConnect(returnUrl: $returnUrl)
        }`,
        variables: { returnUrl: '/payment-settings' },
      });
    expect(stripe.body.data ?? null).toBeNull();
    expect(stripe.body.errors?.length).toBeGreaterThan(0);
  });
});
