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

describe('Calendar read GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let userId: number;
  let organizationId: number;
  let otherOrganizationId: number;
  let calendarId: number;
  let otherCalendarId: number;
  let token: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for calendar tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });

    const suffix = `${Date.now()}-${process.pid}`;
    const user = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Calendar Member', 'email', true)
       RETURNING id`,
      [`calendar-member-${suffix}@test.itemize`],
    );
    userId = Number(user.rows[0].id);

    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Calendar Primary', $1), ('Calendar Other', $2)
       RETURNING id`,
      [`calendar-primary-${suffix}`, `calendar-other-${suffix}`],
    );
    [organizationId, otherOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $3, 'owner', NOW()), ($2, $3, 'owner', NOW())`,
      [organizationId, otherOrganizationId, userId],
    );
    await pool.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, userId],
    );

    const calendars = await pool.query<{ id: number }>(
      `INSERT INTO calendars (
         organization_id,
         name,
         description,
         slug,
         timezone,
         assigned_to,
         created_by
       )
       VALUES
         ($1, 'Primary consultation', 'Primary detail', $3, 'America/Phoenix', $5, $5),
         ($2, 'Foreign consultation', 'Foreign detail', $4, 'America/Chicago', $5, $5)
       RETURNING id`,
      [
        organizationId,
        otherOrganizationId,
        `primary-consultation-${suffix}`,
        `foreign-consultation-${suffix}`,
        userId,
      ],
    );
    [calendarId, otherCalendarId] = calendars.rows.map((row) => Number(row.id));
    await pool.query(
      `INSERT INTO availability_windows (
         calendar_id, day_of_week, start_time, end_time, is_active
       ) VALUES ($1, 1, '09:00', '17:00', true)`,
      [calendarId],
    );
    await pool.query(
      `INSERT INTO calendar_date_overrides (
         calendar_id, override_date, is_available, reason
       ) VALUES
         ($1, '2099-01-02', false, 'Future closure'),
         ($1, '2000-01-02', false, 'Past closure')`,
      [calendarId],
    );
    await pool.query(
      `INSERT INTO bookings (
         organization_id,
         calendar_id,
         title,
         start_time,
         end_time,
         timezone,
         status,
         source
       ) VALUES
         ($1, $2, 'Confirmed booking', '2099-01-03T17:00:00Z', '2099-01-03T17:30:00Z', 'America/Phoenix', 'confirmed', 'manual'),
         ($1, $2, 'Cancelled booking', '2099-01-04T17:00:00Z', '2099-01-04T17:30:00Z', 'America/Phoenix', 'cancelled', 'manual')`,
      [organizationId, calendarId],
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

    const createCalendarsRouter = require('../../../backend/src/routes/calendars.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/calendars',
      createCalendarsRouter(pool, authenticateJWT),
    );
  });

  afterAll(async () => {
    if (pool && (organizationId || otherOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, otherOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (app) await app.close();
  });

  const query = (
    organization: number,
    document: string,
    variables: Record<string, unknown> = {},
  ) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organization))
      .send({ query: document, variables });

  const calendarFields = `
    id
    organizationId
    name
    description
    slug
    timezone
    assignedToId
    assignedToName
    upcomingBookings
    createdAt
    updatedAt
  `;

  it('lists only the selected organization and preserves the REST projection', async () => {
    const graphql = await query(
      organizationId,
      `{ calendars { ${calendarFields} } }`,
    ).expect(200);
    const legacy = await request(legacyApp)
      .get('/api/calendars')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);

    expect(graphql.body.errors).toBeUndefined();
    expect(graphql.body.data.calendars).toHaveLength(1);
    expect(graphql.body.data.calendars[0]).toMatchObject({
      id: calendarId,
      organizationId,
      name: 'Primary consultation',
      assignedToId: userId,
      assignedToName: 'Calendar Member',
      upcomingBookings: 1,
    });
    expect(legacy.body.calendars).toHaveLength(1);
    expect(Number(legacy.body.calendars[0].id)).toBe(calendarId);
    expect(Number(legacy.body.calendars[0].upcoming_bookings)).toBe(1);
  });

  it('returns ordered availability and only current/future overrides', async () => {
    const response = await query(
      organizationId,
      `query Calendar($id: Int!) {
        calendar(id: $id) {
          ${calendarFields}
          availabilityWindows {
            calendarId
            dayOfWeek
            startTime
            endTime
            isActive
          }
          dateOverrides {
            calendarId
            overrideDate
            isAvailable
            reason
          }
        }
      }`,
      { id: calendarId },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.calendar).toMatchObject({
      id: calendarId,
      organizationId,
      availabilityWindows: [
        {
          calendarId,
          dayOfWeek: 1,
          startTime: '09:00:00',
          endTime: '17:00:00',
          isActive: true,
        },
      ],
      dateOverrides: [
        {
          calendarId,
          overrideDate: '2099-01-02',
          isAvailable: false,
          reason: 'Future closure',
        },
      ],
    });
  });

  it('conceals a calendar from another selected organization', async () => {
    const response = await query(
      organizationId,
      `query Calendar($id: Int!) { calendar(id: $id) { id } }`,
      { id: otherCalendarId },
    ).expect(200);
    expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const other = await query(
      otherOrganizationId,
      `{ calendars { id name organizationId } }`,
    ).expect(200);
    expect(other.body.errors).toBeUndefined();
    expect(other.body.data.calendars).toEqual([
      {
        id: otherCalendarId,
        name: 'Foreign consultation',
        organizationId: otherOrganizationId,
      },
    ]);
  });
});
