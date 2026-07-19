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

describe('Calendar GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let userId: number;
  let outsiderUserId: number;
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
    const outsider = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Calendar Outsider', 'email', true)
       RETURNING id`,
      [`calendar-outsider-${suffix}@test.itemize`],
    );
    outsiderUserId = Number(outsider.rows[0].id);

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
    await pool.query(
      'UPDATE organizations SET calendars_limit = 10 WHERE id = ANY($1::int[])',
      [[organizationId, otherOrganizationId]],
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
    const createBookingsRouter = require('../../../backend/src/routes/bookings.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
    legacyApp.use(
      '/api/calendars',
      createCalendarsRouter(pool, authenticateJWT),
    );
    legacyApp.use(
      '/api/bookings',
      createBookingsRouter(
        pool,
        authenticateJWT,
        (_request: unknown, _response: unknown, next: () => void) => next(),
      ),
    );
  });

  afterAll(async () => {
    if (pool && (organizationId || otherOrganizationId)) {
      await pool.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [
        [organizationId, otherOrganizationId].filter(Boolean),
      ]);
    }
    if (pool && (userId || outsiderUserId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [userId, outsiderUserId].filter(Boolean),
      ]);
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

  const mutation = (
    organization: number,
    document: string,
    variables: Record<string, unknown> = {},
  ) => {
    const csrf = 'calendar-csrf';
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Cookie', `itemize_auth=${token}; csrf-token=${csrf}`)
      .set('x-csrf-token', csrf)
      .set('x-organization-id', String(organization))
      .send({ query: document, variables });
  };

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

  it('creates a validated calendar with custom availability and preserves REST projection', async () => {
    const response = await mutation(
      organizationId,
      `mutation CreateCalendar($input: CreateCalendarInput!) {
        createCalendar(input: $input) {
          ${calendarFields}
          durationMinutes
          bufferBeforeMinutes
          assignmentMode
          color
          availabilityWindows {
            dayOfWeek
            startTime
            endTime
            isActive
          }
        }
      }`,
      {
        input: {
          name: '  Discovery call  ',
          description: '  New lead review  ',
          timezone: 'America/Los_Angeles',
          durationMinutes: 45,
          bufferBeforeMinutes: 10,
          assignedToId: userId,
          color: '#aabbcc',
          availabilityWindows: [
            {
              dayOfWeek: 3,
              startTime: '13:30',
              endTime: '16:00',
            },
            {
              dayOfWeek: 1,
              startTime: '08:00:00',
              endTime: '12:00:00',
              isActive: false,
            },
          ],
        },
      },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createCalendar).toMatchObject({
      organizationId,
      name: 'Discovery call',
      description: 'New lead review',
      timezone: 'America/Los_Angeles',
      durationMinutes: 45,
      bufferBeforeMinutes: 10,
      assignedToId: userId,
      assignedToName: 'Calendar Member',
      assignmentMode: 'specific',
      color: '#AABBCC',
      availabilityWindows: [
        {
          dayOfWeek: 1,
          startTime: '08:00:00',
          endTime: '12:00:00',
          isActive: false,
        },
        {
          dayOfWeek: 3,
          startTime: '13:30:00',
          endTime: '16:00:00',
          isActive: true,
        },
      ],
    });
    const createdId = response.body.data.createCalendar.id;
    const legacy = await request(legacyApp)
      .get(`/api/calendars/${createdId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(legacy.body).toMatchObject({
      id: createdId,
      name: 'Discovery call',
      description: 'New lead review',
      assigned_to: userId,
      color: '#AABBCC',
    });
    expect(legacy.body.availability_windows).toHaveLength(2);
  });

  it('updates only supplied fields, clears nullable values, and validates the final assignment', async () => {
    const updated = await mutation(
      organizationId,
      `mutation UpdateCalendar($id: Int!, $input: UpdateCalendarInput!) {
        updateCalendar(id: $id, input: $input) {
          id name description timezone assignedToId assignmentMode reminderHours
        }
      }`,
      {
        id: calendarId,
        input: {
          description: null,
          assignmentMode: 'round_robin',
          assignedToId: null,
          reminderHours: 12,
        },
      },
    ).expect(200);
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data.updateCalendar).toEqual({
      id: calendarId,
      name: 'Primary consultation',
      description: null,
      timezone: 'America/Phoenix',
      assignedToId: null,
      assignmentMode: 'round_robin',
      reminderHours: 12,
    });

    const legacy = await request(legacyApp)
      .get(`/api/calendars/${calendarId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(legacy.body).toMatchObject({
      id: calendarId,
      name: 'Primary consultation',
      description: null,
      timezone: 'America/Phoenix',
      assigned_to: null,
      assignment_mode: 'round_robin',
      reminder_hours: 12,
    });

    const invalid = await mutation(
      organizationId,
      `mutation UpdateCalendar($id: Int!, $input: UpdateCalendarInput!) {
        updateCalendar(id: $id, input: $input) { id }
      }`,
      { id: calendarId, input: { assignedToId: outsiderUserId } },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
    });
  });

  it('atomically replaces availability and interoperates with retained REST', async () => {
    const replaced = await mutation(
      organizationId,
      `mutation ReplaceCalendarAvailability(
        $calendarId: Int!,
        $windows: [CalendarAvailabilityWindowInput!]!
      ) {
        replaceCalendarAvailability(
          calendarId: $calendarId,
          windows: $windows
        ) {
          calendarId
          dayOfWeek
          startTime
          endTime
          isActive
        }
      }`,
      {
        calendarId,
        windows: [
          {
            dayOfWeek: 5,
            startTime: '13:30',
            endTime: '17:00',
          },
          {
            dayOfWeek: 1,
            startTime: '08:00',
            endTime: '12:00',
            isActive: false,
          },
        ],
      },
    ).expect(200);
    expect(replaced.body.errors).toBeUndefined();
    expect(replaced.body.data.replaceCalendarAvailability).toEqual([
      {
        calendarId,
        dayOfWeek: 1,
        startTime: '08:00:00',
        endTime: '12:00:00',
        isActive: false,
      },
      {
        calendarId,
        dayOfWeek: 5,
        startTime: '13:30:00',
        endTime: '17:00:00',
        isActive: true,
      },
    ]);

    const legacyRead = await request(legacyApp)
      .get(`/api/calendars/${calendarId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(legacyRead.body.availability_windows).toEqual([
      expect.objectContaining({
        day_of_week: 1,
        start_time: '08:00:00',
        is_active: false,
      }),
      expect.objectContaining({
        day_of_week: 5,
        start_time: '13:30:00',
        is_active: true,
      }),
    ]);

    await request(legacyApp)
      .put(`/api/calendars/${calendarId}/availability`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .send({
        availability_windows: [
          {
            day_of_week: 2,
            start_time: '10:00',
            end_time: '16:00',
            is_active: true,
          },
        ],
      })
      .expect(200);
    const graphqlRead = await query(
      organizationId,
      `query Calendar($id: Int!) {
        calendar(id: $id) {
          availabilityWindows { dayOfWeek startTime endTime isActive }
        }
      }`,
      { id: calendarId },
    ).expect(200);
    expect(graphqlRead.body.data.calendar.availabilityWindows).toEqual([
      {
        dayOfWeek: 2,
        startTime: '10:00:00',
        endTime: '16:00:00',
        isActive: true,
      },
    ]);
  });

  it('rejects invalid or foreign availability replacement without changing rows', async () => {
    const before = await pool.query(
      `SELECT day_of_week, start_time, end_time, is_active
       FROM availability_windows
       WHERE calendar_id = $1
       ORDER BY day_of_week, start_time`,
      [calendarId],
    );
    const invalid = await mutation(
      organizationId,
      `mutation ReplaceCalendarAvailability(
        $calendarId: Int!,
        $windows: [CalendarAvailabilityWindowInput!]!
      ) {
        replaceCalendarAvailability(
          calendarId: $calendarId,
          windows: $windows
        ) { id }
      }`,
      {
        calendarId,
        windows: [
          { dayOfWeek: 2, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 2, startTime: '11:00', endTime: '13:00' },
        ],
      },
    ).expect(200);
    expect(invalid.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'OVERLAPPING_WINDOWS',
    });
    const after = await pool.query(
      `SELECT day_of_week, start_time, end_time, is_active
       FROM availability_windows
       WHERE calendar_id = $1
       ORDER BY day_of_week, start_time`,
      [calendarId],
    );
    expect(after.rows).toEqual(before.rows);

    const foreign = await mutation(
      organizationId,
      `mutation {
        replaceCalendarAvailability(
          calendarId: ${otherCalendarId},
          windows: []
        ) { id }
      }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('upserts and tenant-scopes date override deletion across GraphQL and REST', async () => {
    const upserted = await mutation(
      organizationId,
      `mutation UpsertCalendarDateOverride(
        $calendarId: Int!,
        $input: CalendarDateOverrideInput!
      ) {
        upsertCalendarDateOverride(
          calendarId: $calendarId,
          input: $input
        ) {
          id
          calendarId
          overrideDate
          isAvailable
          startTime
          endTime
          reason
        }
      }`,
      {
        calendarId,
        input: {
          overrideDate: '2099-02-02',
          isAvailable: true,
          startTime: '10:00',
          endTime: '14:30',
          reason: 'Extended hours',
        },
      },
    ).expect(200);
    expect(upserted.body.errors).toBeUndefined();
    expect(upserted.body.data.upsertCalendarDateOverride).toMatchObject({
      calendarId,
      overrideDate: '2099-02-02',
      isAvailable: true,
      startTime: '10:00:00',
      endTime: '14:30:00',
      reason: 'Extended hours',
    });
    const overrideId = upserted.body.data.upsertCalendarDateOverride.id;

    const legacyRead = await request(legacyApp)
      .get(`/api/calendars/${calendarId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    const legacyOverride = legacyRead.body.date_overrides.find(
      (override: { id: number }) => override.id === overrideId,
    );
    expect(legacyOverride).toMatchObject({
      id: overrideId,
      is_available: true,
      start_time: '10:00:00',
      end_time: '14:30:00',
    });
    expect(
      new Date(legacyOverride.override_date).toISOString().slice(0, 10),
    ).toBe('2099-02-02');

    await request(legacyApp)
      .post(`/api/calendars/${calendarId}/date-override`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .send({
        override_date: '2099-02-02',
        is_available: false,
        reason: 'Closed through REST',
      })
      .expect(200);
    const graphqlRead = await query(
      organizationId,
      `query Calendar($id: Int!) {
        calendar(id: $id) {
          dateOverrides {
            id overrideDate isAvailable startTime endTime reason
          }
        }
      }`,
      { id: calendarId },
    ).expect(200);
    expect(graphqlRead.body.data.calendar.dateOverrides).toContainEqual({
      id: overrideId,
      overrideDate: '2099-02-02',
      isAvailable: false,
      startTime: null,
      endTime: null,
      reason: 'Closed through REST',
    });

    const foreignDelete = await mutation(
      otherOrganizationId,
      `mutation {
        deleteCalendarDateOverride(
          calendarId: ${calendarId},
          overrideId: ${overrideId}
        )
      }`,
    ).expect(200);
    expect(foreignDelete.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const deleted = await mutation(
      organizationId,
      `mutation {
        deleteCalendarDateOverride(
          calendarId: ${calendarId},
          overrideId: ${overrideId}
        )
      }`,
    ).expect(200);
    expect(deleted.body).toEqual({
      data: { deleteCalendarDateOverride: true },
    });
  });

  it('deletes only an owned calendar without active future bookings', async () => {
    const deletable = await pool.query<{ id: number }>(
      `INSERT INTO calendars (
         organization_id, name, slug, timezone, assigned_to, created_by
       ) VALUES ($1, 'Deletable calendar', $2, 'America/Phoenix', $3, $3)
       RETURNING id`,
      [organizationId, `deletable-${Date.now()}-${process.pid}`, userId],
    );
    const deletableId = Number(deletable.rows[0].id);
    await pool.query(
      `INSERT INTO bookings (
         organization_id, calendar_id, title, start_time, end_time,
         timezone, status, source
       ) VALUES (
         $1, $2, 'Cancelled future booking',
         '2099-03-01T17:00:00Z', '2099-03-01T17:30:00Z',
         'America/Phoenix', 'cancelled', 'manual'
       )`,
      [organizationId, deletableId],
    );

    const foreign = await mutation(
      otherOrganizationId,
      `mutation { deleteCalendar(id: ${deletableId}) }`,
    ).expect(200);
    expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const blocked = await mutation(
      organizationId,
      `mutation { deleteCalendar(id: ${calendarId}) }`,
    ).expect(200);
    expect(blocked.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'UPCOMING_BOOKINGS',
    });

    const noCsrf = await query(
      organizationId,
      `mutation { deleteCalendar(id: ${deletableId}) }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const deleted = await mutation(
      organizationId,
      `mutation { deleteCalendar(id: ${deletableId}) }`,
    ).expect(200);
    expect(deleted.body).toEqual({ data: { deleteCalendar: true } });

    await request(legacyApp)
      .get(`/api/calendars/${deletableId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(404);
    const remaining = await pool.query(
      'SELECT id FROM bookings WHERE calendar_id = $1',
      [deletableId],
    );
    expect(remaining.rows).toHaveLength(0);
  });

  it('serializes retained booking creation against GraphQL calendar deletion', async () => {
    const calendar = await pool.query<{ id: number }>(
      `INSERT INTO calendars (
         organization_id, name, slug, timezone, assigned_to, created_by
       ) VALUES ($1, 'Calendar delete race', $2, 'America/Phoenix', $3, $3)
       RETURNING id`,
      [organizationId, `delete-race-${Date.now()}-${process.pid}`, userId],
    );
    const raceCalendarId = Number(calendar.rows[0].id);

    const [booking, deletion] = await Promise.all([
      request(legacyApp)
        .post('/api/bookings')
        .set('Cookie', `itemize_auth=${token}`)
        .set('x-organization-id', String(organizationId))
        .send({
          calendar_id: raceCalendarId,
          title: 'Concurrent booking',
          start_time: '2099-04-01T17:00:00Z',
          end_time: '2099-04-01T17:30:00Z',
          timezone: 'America/Phoenix',
        }),
      mutation(
        organizationId,
        `mutation { deleteCalendar(id: ${raceCalendarId}) }`,
      ),
    ]);

    expect([201, 404]).toContain(booking.status);
    expect(deletion.status).toBe(200);
    if (booking.status === 201) {
      expect(deletion.body.errors[0].extensions).toMatchObject({
        code: 'BAD_USER_INPUT',
        reason: 'UPCOMING_BOOKINGS',
      });
      await pool.query('DELETE FROM calendars WHERE id = $1', [raceCalendarId]);
    } else {
      expect(deletion.body).toEqual({ data: { deleteCalendar: true } });
    }
    const counts = await pool.query<{
      calendars: number;
      bookings: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM calendars WHERE id = $1) AS calendars,
         (SELECT COUNT(*)::int FROM bookings WHERE calendar_id = $1) AS bookings`,
      [raceCalendarId],
    );
    expect(counts.rows[0]).toEqual({ calendars: 0, bookings: 0 });
  });

  it('enforces mutation CSRF, window validation, and the organization calendar limit', async () => {
    const noCsrf = await query(
      organizationId,
      `mutation { updateCalendar(id: ${calendarId}, input: { name: "Blocked" }) { id } }`,
    ).expect(200);
    expect(noCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const availabilityNoCsrf = await query(
      organizationId,
      `mutation {
        replaceCalendarAvailability(calendarId: ${calendarId}, windows: []) {
          id
        }
      }`,
    ).expect(200);
    expect(availabilityNoCsrf.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const overlapping = await mutation(
      organizationId,
      `mutation CreateCalendar($input: CreateCalendarInput!) {
        createCalendar(input: $input) { id }
      }`,
      {
        input: {
          name: 'Overlap',
          availabilityWindows: [
            { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
            { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' },
          ],
        },
      },
    ).expect(200);
    expect(overlapping.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'OVERLAPPING_WINDOWS',
    });

    const count = await pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM calendars WHERE organization_id = $1',
      [organizationId],
    );
    await pool.query(
      'UPDATE organizations SET calendars_limit = $1 WHERE id = $2',
      [count.rows[0].count, organizationId],
    );
    const limited = await mutation(
      organizationId,
      `mutation { createCalendar(input: { name: "Limit blocked" }) { id } }`,
    ).expect(200);
    expect(limited.body.errors[0].extensions).toMatchObject({
      code: 'FORBIDDEN',
      reason: 'PLAN_LIMIT_REACHED',
    });
  });
});
