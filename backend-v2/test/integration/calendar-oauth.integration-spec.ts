import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import {
  GOOGLE_CALENDAR_OAUTH_PROVIDER,
  GoogleTokens,
  SdkGoogleCalendarOAuthProvider,
} from '../../src/calendar-oauth/google-calendar-oauth.provider';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';
import {
  createCalendarOAuthState,
  verifyCalendarOAuthState,
} from '../../src/calendar-oauth/calendar-oauth-state';
import { loadGoogleCalendarConnection } from '../../src/calendar-sync-jobs/calendar-connection-credentials';

const FAKE_CALENDARS = [
  {
    id: 'primary',
    summary: 'Primary',
    description: undefined,
    primary: true,
    backgroundColor: '#fff',
    accessRole: 'owner',
  },
];

class FakeNetworkGoogleProvider extends SdkGoogleCalendarOAuthProvider {
  exchangeTokens: GoogleTokens = {
    access_token: 'ya29.exchanged-access',
    refresh_token: '1//exchanged-refresh',
    expiry_date: Date.now() + 3600 * 1000,
  };
  refreshedTokens: GoogleTokens = {
    access_token: 'ya29.refreshed-access',
    expiry_date: Date.now() + 3600 * 1000,
  };
  refreshCalls = 0;

  override async exchangeCodeForTokens(): Promise<GoogleTokens> {
    return this.exchangeTokens;
  }

  override async getUserInfo() {
    return { id: 'google-account-1', email: 'owner@gmail.example' };
  }

  override async refreshAccessToken(): Promise<GoogleTokens> {
    this.refreshCalls += 1;
    return this.refreshedTokens;
  }

  override async listCalendars() {
    return FAKE_CALENDARS;
  }
}

describe('Calendar OAuth retained HTTP protocol (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let owner: any;
  let fakeProvider: FakeNetworkGoogleProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let legacyTokenCrypto: any;

  const authCookie = () => `itemize_auth=${owner.token}`;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for calendar OAuth tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.GOOGLE_CLIENT_ID = 'fake-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'fake-google-client-secret';
    process.env.FRONTEND_URL = 'https://app.itemize.test';
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEYS;
    delete process.env.CALENDAR_TOKEN_ACTIVE_KEY_ID;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    legacyTokenCrypto = require('../../../db/src/utils/calendarTokenEncryption');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `calendar-oauth-${Date.now()}@test.itemize`,
      'Calendar Owner',
    );

    fakeProvider = new FakeNetworkGoogleProvider();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(GOOGLE_CALENDAR_OAUTH_PROVIDER)
      .useValue(fakeProvider)
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

  it('mints authorization URLs whose states verify', async () => {
    const nest = await request(app.getHttpServer())
        .get('/api/calendar-integrations/google/auth?return_url=/calendars?tab=sync')
        .set('Cookie', authCookie())
        .set('x-organization-id', String(owner.org.id));
    expect(nest.status).toBe(200);

    const nestUrl = new URL(nest.body.authUrl);
    expect(nestUrl.origin + nestUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(nestUrl.searchParams.get('access_type')).toBe('offline');
    expect(nestUrl.searchParams.get('prompt')).toBe('consent');
    expect(nestUrl.searchParams.get('client_id')).toBe('fake-google-client-id');
    const verified = verifyCalendarOAuthState(
      nestUrl.searchParams.get('state'),
    );
    expect(verified).toEqual({
      userId: owner.user.id,
      organizationId: owner.org.id,
      returnPath: '/calendars?tab=sync',
    });
  });

  it('denies unauthenticated authorization begins', async () => {
    const nest = await request(app.getHttpServer()).get('/api/calendar-integrations/google/auth');
    expect(nest.status).toBe(401);
  });

  it('redirects callback failures identically before any provider exchange', async () => {
    const noCode = await Promise.all([
      request(app.getHttpServer()).get('/api/calendar-integrations/google/callback'),
      request(app.getHttpServer()).get('/api/calendar-integrations/google/callback'),
    ]);
    expect(noCode[0].status).toBe(302);
    expect(noCode[1].status).toBe(302);
    expect(noCode[0].headers.location).toBe(noCode[1].headers.location);
    expect(noCode[0].headers.location).toContain('error=no_code');

    const badState = await Promise.all([
      request(app.getHttpServer()).get(
        '/api/calendar-integrations/google/callback?code=abc&state=not-a-state',
      ),
      request(app.getHttpServer()).get(
        '/api/calendar-integrations/google/callback?code=abc&state=not-a-state',
      ),
    ]);
    expect(badState[0].headers.location).toBe(badState[1].headers.location);
    expect(badState[0].headers.location).toContain('error=invalid_state');

    const foreign = await dbHelper.seedUser(
      `calendar-foreign-${Date.now()}@test.itemize`,
      'Foreign Owner',
    );
    const crossTenantState = createCalendarOAuthState({
      userId: owner.user.id,
      organizationId: foreign.org.id,
      returnUrl: '/calendars',
    });
    const nonMember = await Promise.all([
      request(app.getHttpServer()).get(
        `/api/calendar-integrations/google/callback?code=abc&state=${encodeURIComponent(crossTenantState)}`,
      ),
      request(app.getHttpServer()).get(
        `/api/calendar-integrations/google/callback?code=abc&state=${encodeURIComponent(crossTenantState)}`,
      ),
    ]);
    expect(nonMember[0].headers.location).toBe(nonMember[1].headers.location);
    expect(nonMember[0].headers.location).toContain('error=invalid_state');
  });

  it('completes a minted state through the callback and stores keyring envelopes', async () => {
    const state = createCalendarOAuthState({
      userId: owner.user.id,
      organizationId: owner.org.id,
      returnUrl: '/calendars?tab=connections',
    });
    const response = await request(app.getHttpServer()).get(
      `/api/calendar-integrations/google/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'https://app.itemize.test/calendars?tab=connections&google_connected=true',
    );

    const row = await pool.query(
      `SELECT id, provider_email, access_token, refresh_token, token_generation, is_active
       FROM calendar_connections
       WHERE user_id = $1 AND organization_id = $2 AND provider_account_id = 'google-account-1'`,
      [owner.user.id, owner.org.id],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      provider_email: 'owner@gmail.example',
      is_active: true,
    });
    expect(
      legacyTokenCrypto.decryptCalendarToken(row.rows[0].access_token, 'access'),
    ).toBe('ya29.exchanged-access');
    expect(
      legacyTokenCrypto.decryptCalendarToken(row.rows[0].refresh_token, 'refresh'),
    ).toBe('1//exchanged-refresh');

    const replay = await request(app.getHttpServer()).get(
      `/api/calendar-integrations/google/callback?code=auth-code&state=${encodeURIComponent(state)}`,
    );
    expect(replay.status).toBe(302);
    const updated = await pool.query(
      `SELECT token_generation FROM calendar_connections WHERE id = $1`,
      [row.rows[0].id],
    );
    expect(Number(updated.rows[0].token_generation)).toBe(
      Number(row.rows[0].token_generation) + 1,
    );
  });

  it('lists provider calendars, refreshes expired tokens once, and stays legacy-readable', async () => {
    const seeded = await pool.query<{ id: number }>(
      `INSERT INTO calendar_connections (
         user_id, organization_id, provider, provider_account_id,
         provider_email, access_token, refresh_token, token_expires_at
       ) VALUES ($1, $2, 'google', 'expired-account', 'stale@gmail.example', $3, $4, NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [
        owner.user.id,
        owner.org.id,
        legacyTokenCrypto.encryptCalendarToken('ya29.stale-access', 'access'),
        legacyTokenCrypto.encryptCalendarToken('1//stale-refresh', 'refresh'),
      ],
    );
    const connectionId = seeded.rows[0].id;

    const before = fakeProvider.refreshCalls;
    const response = await request(app.getHttpServer())
      .get(`/api/calendar-integrations/google/calendars/${connectionId}`)
      .set('Cookie', authCookie())
      .set('x-organization-id', String(owner.org.id));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(FAKE_CALENDARS);
    expect(fakeProvider.refreshCalls).toBe(before + 1);

    const loaded = await loadGoogleCalendarConnection(
      pool,
      {
        connectionId,
        userId: owner.user.id,
        organizationId: owner.org.id,
      },
      {
        needsTokenRefresh: () => false,
        refreshAccessToken: () => {
          throw new Error('unexpected refresh');
        },
      },
    );
    expect(loaded!.access_token).toBe('ya29.refreshed-access');
    expect(loaded!.refresh_token).toBe('1//stale-refresh');

    const missing = await Promise.all([
      request(app.getHttpServer())
        .get('/api/calendar-integrations/google/calendars/999999')
        .set('Cookie', authCookie())
        .set('x-organization-id', String(owner.org.id)),
      request(app.getHttpServer())
        .get('/api/calendar-integrations/google/calendars/999999')
        .set('Cookie', authCookie())
        .set('x-organization-id', String(owner.org.id)),
    ]);
    expect(missing[0].status).toBe(404);
    expect(missing[1].status).toBe(404);
    expect(missing[0].body).toEqual(missing[1].body);
  });
});
