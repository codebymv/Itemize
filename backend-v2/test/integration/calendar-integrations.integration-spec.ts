import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

const {
  encryptCalendarToken,
} = require('../../../backend/src/utils/calendarTokenEncryption');

describe('Calendar integrations GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let userId: number;
  let otherUserId: number;
  let organizationId: number;
  let otherOrganizationId: number;
  let connectionId: number;
  let otherOrganizationConnectionId: number;
  let otherUserConnectionId: number;
  let token: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'TEST_DATABASE_URL is required for calendar integration tests',
      );
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
       VALUES
         ($1, 'Calendar Integration Member', 'email', true),
         ($2, 'Calendar Integration Other', 'email', true)
       RETURNING id`,
      [
        `calendar-integration-member-${suffix}@test.itemize`,
        `calendar-integration-other-${suffix}@test.itemize`,
      ],
    );
    [userId, otherUserId] = users.rows.map((row) => Number(row.id));
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES
         ('Calendar Integration Primary', $1),
         ('Calendar Integration Other', $2)
       RETURNING id`,
      [
        `calendar-integration-primary-${suffix}`,
        `calendar-integration-other-${suffix}`,
      ],
    );
    [organizationId, otherOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (
         organization_id, user_id, role, joined_at
       ) VALUES
         ($1, $3, 'owner', NOW()),
         ($2, $3, 'owner', NOW()),
         ($1, $4, 'member', NOW())`,
      [organizationId, otherOrganizationId, userId, otherUserId],
    );
    await pool.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, userId],
    );

    const accessToken = encryptCalendarToken(
      'calendar-integration-access',
      'access',
    );
    const refreshToken = encryptCalendarToken(
      'calendar-integration-refresh',
      'refresh',
    );
    const connections = await pool.query<{ id: number }>(
      `INSERT INTO calendar_connections (
         user_id,
         organization_id,
         provider,
         provider_account_id,
         provider_email,
         access_token,
         refresh_token,
         token_expires_at,
         selected_calendars
       ) VALUES
         ($1, $3, 'google', $5, 'member@example.com', $8, $9, NOW() + INTERVAL '1 hour', '["primary"]'::jsonb),
         ($1, $4, 'google', $6, 'foreign@example.com', $8, NULL, NOW() + INTERVAL '1 hour', '[]'::jsonb),
         ($2, $3, 'google', $7, 'other-user@example.com', $8, NULL, NOW() + INTERVAL '1 hour', '[]'::jsonb)
       RETURNING id`,
      [
        userId,
        otherUserId,
        organizationId,
        otherOrganizationId,
        `primary-${suffix}`,
        `foreign-${suffix}`,
        `other-user-${suffix}`,
        accessToken,
        refreshToken,
      ],
    );
    [
      connectionId,
      otherOrganizationConnectionId,
      otherUserConnectionId,
    ] = connections.rows.map((row) => Number(row.id));

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
  });

  afterAll(async () => {
    if (pool && (organizationId || otherOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, otherOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (userId || otherUserId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [userId, otherUserId].filter(Boolean),
      ]);
    }
    if (app) await app.close();
  });

  const graphql = (
    document: string,
    variables: Record<string, unknown> = {},
    options: { organizationId?: number; csrf?: boolean } = {},
  ) => {
    const organization = options.organizationId ?? organizationId;
    const csrf = 'calendar-integration-csrf';
    const call = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        options.csrf
          ? `itemize_auth=${token}; csrf-token=${csrf}`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(organization));
    if (options.csrf) call.set('x-csrf-token', csrf);
    return call.send({ query: document, variables });
  };

  const connectionFields = `
    id provider providerEmail syncEnabled syncDirection lastSyncAt
    isActive errorMessage errorCount selectedCalendars createdAt updatedAt
  `;

  it('lists only the current user and organization without credential fields', async () => {
    const response = await graphql(
      `{ calendarConnections { ${connectionFields} } }`,
    ).expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.calendarConnections).toEqual([
      expect.objectContaining({
        id: connectionId,
        providerEmail: 'member@example.com',
        selectedCalendars: ['primary'],
      }),
    ]);

    const forbiddenField = await graphql(
      '{ calendarConnections { id accessToken } }',
    ).expect(400);
    expect(forbiddenField.body.errors[0].extensions.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });

  it('updates validated settings with CSRF and tenant ownership enforcement', async () => {
    const mutation = `
      mutation UpdateConnection(
        $connectionId: Int!
        $input: UpdateCalendarConnectionInput!
      ) {
        updateCalendarConnection(
          connectionId: $connectionId
          input: $input
        ) { ${connectionFields} }
      }
    `;
    const noCsrf = await graphql(
      mutation,
      { connectionId, input: { syncDirection: 'pull' } },
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const updated = await graphql(
      mutation,
      {
        connectionId,
        input: {
          syncEnabled: true,
          syncDirection: 'pull',
          selectedCalendars: ['primary', 'team'],
        },
      },
      { csrf: true },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateCalendarConnection).toMatchObject({
      syncEnabled: true,
      syncDirection: 'pull',
      selectedCalendars: ['primary', 'team'],
    });

    const duplicate = await graphql(
      mutation,
      {
        connectionId,
        input: { selectedCalendars: ['primary', 'primary'] },
      },
      { csrf: true },
    ).expect(200);
    expect(duplicate.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_SELECTED_CALENDARS',
    });

    for (const hiddenConnectionId of [
      otherOrganizationConnectionId,
      otherUserConnectionId,
    ]) {
      const hidden = await graphql(
        mutation,
        {
          connectionId: hiddenConnectionId,
          input: { syncEnabled: false },
        },
        { csrf: true },
      ).expect(200);
      expect(hidden.body.errors[0].extensions.code).toBe('NOT_FOUND');
    }
  });

  it('enqueues idempotently and exposes only safe durable status', async () => {
    const mutation = `
      mutation RequestSync($connectionId: Int!, $key: String) {
        requestCalendarSync(
          connectionId: $connectionId
          idempotencyKey: $key
        ) {
          message
          created
          job {
            id connectionId direction status attemptCount nextAttemptAt
            result lastError completedAt createdAt updatedAt
          }
        }
      }
    `;
    const variables = { connectionId, key: 'graphql-sync-request-1' };
    const first = await graphql(mutation, variables, { csrf: true }).expect(200);
    const replay = await graphql(mutation, variables, { csrf: true }).expect(
      200,
    );
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data.requestCalendarSync).toMatchObject({
      message: 'Sync queued',
      created: true,
      job: { connectionId, direction: 'pull', status: 'queued' },
    });
    expect(replay.body.data.requestCalendarSync).toMatchObject({
      message: 'Sync already queued',
      created: false,
      job: { id: first.body.data.requestCalendarSync.job.id },
    });

    const status = await graphql(
      `query SyncStatus($connectionId: Int!) {
        calendarSyncStatus(connectionId: $connectionId) {
          connection { ${connectionFields} }
          stats { totalSynced pushed pulled lastEventSync }
          jobs {
            id connectionId direction status attemptCount nextAttemptAt
            result lastError completedAt createdAt updatedAt
          }
        }
      }`,
      { connectionId },
    ).expect(200);
    expect(status.body.errors).toBeUndefined();
    expect(status.body.data.calendarSyncStatus).toMatchObject({
      connection: { id: connectionId, providerEmail: 'member@example.com' },
      stats: { totalSynced: 0, pushed: 0, pulled: 0 },
      jobs: [{ id: first.body.data.requestCalendarSync.job.id }],
    });
    expect(JSON.stringify(status.body.data)).not.toContain('encrypted-access');
    expect(JSON.stringify(status.body.data)).not.toContain(
      'graphql-sync-request-1',
    );
  });

  it('disconnects only owned connections and requires CSRF', async () => {
    const connection = await pool.query<{ id: number }>(
      `INSERT INTO calendar_connections (
         user_id, organization_id, provider, provider_account_id,
         provider_email, access_token
       ) VALUES ($1, $2, 'google', $3, 'delete@example.com', $4)
       RETURNING id`,
      [
        userId,
        organizationId,
        `delete-${Date.now()}-${process.pid}`,
        encryptCalendarToken('calendar-delete-access', 'access'),
      ],
    );
    const deleteId = Number(connection.rows[0].id);
    const mutation = `mutation Disconnect($connectionId: Int!) {
      disconnectCalendar(connectionId: $connectionId)
    }`;
    const noCsrf = await graphql(mutation, {
      connectionId: deleteId,
    }).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const disconnected = await graphql(
      mutation,
      { connectionId: deleteId },
      { csrf: true },
    ).expect(200);
    expect(disconnected.body.errors).toBeUndefined();
    expect(disconnected.body.data.disconnectCalendar).toBe(true);

    const retained = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM calendar_connections
       WHERE id = ANY($1::int[])`,
      [[otherOrganizationConnectionId, otherUserConnectionId]],
    );
    expect(retained.rows[0].count).toBe(2);
  });
});
