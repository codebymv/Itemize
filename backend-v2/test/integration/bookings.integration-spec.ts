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

describe('Booking read GraphQL PostgreSQL contract', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  let userId: number;
  let otherUserId: number;
  let organizationId: number;
  let otherOrganizationId: number;
  let calendarId: number;
  let otherCalendarId: number;
  let contactId: number;
  let otherContactId: number;
  let otherBookingId: number;
  let bookingIds: number[];
  let token: string;
  const jwt = new JwtService();

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for booking tests');
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
       VALUES ($1, 'Booking Member', 'email', true)
       RETURNING id`,
      [`booking-member-${suffix}@test.itemize`],
    );
    userId = Number(user.rows[0].id);
    const otherUser = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Foreign Booking Member', 'email', true)
       RETURNING id`,
      [`booking-foreign-member-${suffix}@test.itemize`],
    );
    otherUserId = Number(otherUser.rows[0].id);
    const organizations = await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Booking Primary', $1), ('Booking Other', $2)
       RETURNING id`,
      [`booking-primary-${suffix}`, `booking-other-${suffix}`],
    );
    [organizationId, otherOrganizationId] = organizations.rows.map((row) =>
      Number(row.id),
    );
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES
         ($1, $3, 'owner', NOW()),
         ($2, $3, 'owner', NOW()),
         ($2, $4, 'member', NOW())`,
      [organizationId, otherOrganizationId, userId, otherUserId],
    );
    await pool.query(
      'UPDATE users SET default_organization_id = $1 WHERE id = $2',
      [organizationId, userId],
    );

    const calendars = await pool.query<{ id: number }>(
      `INSERT INTO calendars (
         organization_id, name, slug, timezone, color, assigned_to, created_by
       ) VALUES
         ($1, 'Primary Calendar', $3, 'America/Phoenix', '#112233', $5, $5),
         ($2, 'Foreign Calendar', $4, 'America/Chicago', '#445566', $5, $5)
       RETURNING id`,
      [
        organizationId,
        otherOrganizationId,
        `booking-primary-${suffix}`,
        `booking-foreign-${suffix}`,
        userId,
      ],
    );
    calendarId = Number(calendars.rows[0].id);
    otherCalendarId = Number(calendars.rows[1].id);
    await pool.query(
      `UPDATE calendars
       SET min_notice_hours = 0,
           max_future_days = 50000,
           is_active = TRUE
       WHERE id = ANY($1::int[])`,
      [[calendarId, otherCalendarId]],
    );
    await pool.query(
      `INSERT INTO availability_windows (
         calendar_id, day_of_week, start_time, end_time, is_active
       )
       SELECT calendar_id, day, '00:00:00', '23:59:59', TRUE
       FROM unnest($1::int[]) calendar_id
       CROSS JOIN generate_series(0, 6) day`,
      [[calendarId, otherCalendarId]],
    );
    const contacts = await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, created_by
       ) VALUES
         ($1, 'Ada', 'Lovelace', $3, $5),
         ($2, 'Grace', 'Hopper', $4, $5)
       RETURNING id`,
      [
        organizationId,
        otherOrganizationId,
        `ada-${suffix}@test.itemize`,
        `grace-${suffix}@test.itemize`,
        userId,
      ],
    );
    contactId = Number(contacts.rows[0].id);
    otherContactId = Number(contacts.rows[1].id);

    const bookings = await pool.query<{ id: number }>(
      `INSERT INTO bookings (
         organization_id, calendar_id, contact_id, title,
         start_time, end_time, timezone, attendee_name, attendee_email,
         assigned_to, status, cancellation_token, custom_fields, source
       ) VALUES
         ($1, $2, $3, 'Newest confirmed', '2099-08-03T17:00:00Z', '2099-08-03T17:30:00Z', 'America/Phoenix', 'Ada Lovelace', $4, $5, 'confirmed', 'secret-newest', '{"channel":"partner"}', 'manual'),
         ($1, $2, $3, 'Pending', '2099-08-02T17:00:00Z', '2099-08-02T17:30:00Z', 'America/Phoenix', 'Ada Lovelace', $4, $5, 'pending', 'secret-pending', '{}', 'manual'),
         ($1, $2, $3, 'Older confirmed', '2099-08-01T17:00:00Z', '2099-08-01T17:30:00Z', 'America/Phoenix', 'Ada Lovelace', $4, $5, 'confirmed', 'secret-older', '{}', 'manual')
       RETURNING id`,
      [
        organizationId,
        calendarId,
        contactId,
        `ada-${suffix}@test.itemize`,
        userId,
      ],
    );
    bookingIds = bookings.rows.map((row) => Number(row.id));
    const foreign = await pool.query<{ id: number }>(
      `INSERT INTO bookings (
         organization_id, calendar_id, contact_id, title,
         start_time, end_time, timezone, assigned_to, status, source
       ) VALUES (
         $1, $2, $3, 'Foreign booking',
         '2099-08-04T17:00:00Z', '2099-08-04T17:30:00Z',
         'America/Chicago', $4, 'confirmed', 'manual'
       ) RETURNING id`,
      [otherOrganizationId, otherCalendarId, otherContactId, userId],
    );
    otherBookingId = Number(foreign.rows[0].id);

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

    const createBookingsRouter = require('../../../backend/src/routes/bookings.routes');
    const { authenticateJWT } = require('../../../backend/src/auth/middleware');
    legacyApp = express();
    legacyApp.use(cookieParser());
    legacyApp.use(express.json());
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
    if (pool && (userId || otherUserId)) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        [userId, otherUserId].filter(Boolean),
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

  const mutate = (
    organization: number,
    document: string,
    variables: Record<string, unknown> = {},
    includeCsrf = true,
  ) => {
    const csrf = 'booking-mutation-csrf';
    const pending = request(app.getHttpServer())
      .post('/graphql')
      .set(
        'Cookie',
        includeCsrf
          ? `itemize_auth=${token}; csrf-token=${csrf}`
          : `itemize_auth=${token}`,
      )
      .set('x-organization-id', String(organization));
    if (includeCsrf) pending.set('x-csrf-token', csrf);
    return pending.send({ query: document, variables });
  };

  const fields = `
    id organizationId calendarId contactId title startTime endTime timezone
    attendeeName attendeeEmail assignedToId assignedToName status customFields
    source calendarName calendarColor calendarSlug contactFirstName contactLastName
    contactEmail contactPhone createdAt updatedAt
  `;

  it('lists only the selected organization with deterministic paging and REST-compatible data', async () => {
    const graphql = await query(
      organizationId,
      `query BookingReads($page: PageInput) {
        bookings(page: $page) {
          nodes { ${fields} }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      { page: { page: 1, pageSize: 2 } },
    ).expect(200);
    const legacy = await request(legacyApp)
      .get('/api/bookings')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);

    expect(graphql.body.errors).toBeUndefined();
    expect(graphql.body.data.bookings.pageInfo).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(
      graphql.body.data.bookings.nodes.map((booking: { id: number }) =>
        Number(booking.id),
      ),
    ).toEqual([bookingIds[0], bookingIds[1]]);
    expect(legacy.body.bookings).toHaveLength(3);
    expect(graphql.body.data.bookings.nodes[0]).toMatchObject({
      title: legacy.body.bookings[0].title,
      calendarName: legacy.body.bookings[0].calendar_name,
      contactEmail: legacy.body.bookings[0].contact_email,
      assignedToName: legacy.body.bookings[0].assigned_to_name,
    });
  });

  it('applies strict status, timestamp, and pagination filters', async () => {
    const response = await query(
      organizationId,
      `query FilteredBookings($filter: BookingFilterInput, $page: PageInput) {
        bookings(filter: $filter, page: $page) {
          nodes { id status }
          pageInfo { page pageSize total totalPages }
        }
      }`,
      {
        filter: {
          calendarId,
          status: 'CONFIRMED',
          startDate: '2099-08-01T00:00:00.000Z',
          endDate: '2099-08-31T23:59:59.999Z',
        },
        page: { page: 2, pageSize: 1 },
      },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.bookings).toEqual({
      nodes: [{ id: bookingIds[2], status: 'CONFIRMED' }],
      pageInfo: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    });
  });

  it('returns tenant-qualified detail joins and omits cancellation capability from the schema', async () => {
    const detail = await query(
      organizationId,
      `query BookingRead($id: Int!) { booking(id: $id) { ${fields} } }`,
      { id: bookingIds[0] },
    ).expect(200);
    const schema = await query(
      organizationId,
      `{ __type(name: "Booking") { fields { name } } }`,
    ).expect(200);

    expect(detail.body.errors).toBeUndefined();
    expect(detail.body.data.booking).toMatchObject({
      id: bookingIds[0],
      organizationId,
      calendarName: 'Primary Calendar',
      contactFirstName: 'Ada',
      contactLastName: 'Lovelace',
      assignedToName: 'Booking Member',
      customFields: { channel: 'partner' },
    });
    expect(
      schema.body.data.__type.fields.map((field: { name: string }) => field.name),
    ).not.toContain('cancellationToken');
  });

  it('conceals a foreign booking identifier', async () => {
    const response = await query(
      organizationId,
      `query BookingRead($id: Int!) { booking(id: $id) { id } }`,
      { id: otherBookingId },
    ).expect(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('rejects reversed dates and oversized pages before database reads', async () => {
    const response = await query(
      organizationId,
      `query InvalidBookings($filter: BookingFilterInput, $page: PageInput) {
        bookings(filter: $filter, page: $page) { pageInfo { total } }
      }`,
      {
        filter: {
          startDate: '2099-08-02T00:00:00.000Z',
          endDate: '2099-08-01T00:00:00.000Z',
        },
        page: { page: 1, pageSize: 101 },
      },
    ).expect(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('creates a tenant-validated manual booking with REST parity and one versioned event', async () => {
    const response = await mutate(
      organizationId,
      `mutation CreateBooking($input: CreateBookingInput!) {
        createBooking(input: $input) {
          ${fields}
          cancellationReason
        }
      }`,
      {
        input: {
          calendarId,
          contactId,
          title: '  GraphQL manual booking  ',
          startTime: '2099-09-01T17:00:00.000Z',
          endTime: '2099-09-01T17:30:00.000Z',
          timezone: 'America/Phoenix',
          attendeeName: '  Ada Lovelace  ',
          attendeeEmail: 'ada@example.com',
          assignedToId: userId,
          internalNotes: '  Prepared  ',
          customFields: { channel: 'graphql' },
        },
      },
    ).expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.createBooking).toMatchObject({
      organizationId,
      calendarId,
      contactId,
      title: 'GraphQL manual booking',
      attendeeName: 'Ada Lovelace',
      assignedToId: userId,
      assignedToName: 'Booking Member',
      status: 'CONFIRMED',
      source: 'manual',
      customFields: { channel: 'graphql' },
    });
    const bookingId = Number(response.body.data.createBooking.id);
    const legacy = await request(legacyApp)
      .get(`/api/bookings/${bookingId}`)
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .expect(200);
    expect(legacy.body).toMatchObject({
      id: bookingId,
      title: 'GraphQL manual booking',
      attendee_name: 'Ada Lovelace',
      assigned_to: userId,
      internal_notes: 'Prepared',
      source: 'manual',
    });
    expect(typeof legacy.body.cancellation_token).toBe('string');
    expect(response.body.data.createBooking).not.toHaveProperty(
      'cancellationToken',
    );

    const events = await pool.query<{
      total: number;
      version: number;
      calendar_id: number;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         MAX((payload ->> 'version')::int)::int AS version,
         MAX((payload ->> 'calendar_id')::int)::int AS calendar_id
       FROM workflow_triggers
       WHERE organization_id = $1
         AND trigger_type = 'booking_created'
         AND entity_id = $2`,
      [organizationId, bookingId],
    );
    expect(events.rows[0]).toEqual({
      total: 1,
      version: 1,
      calendar_id: calendarId,
    });
  });

  it('conceals foreign create references and rejects foreign assignees', async () => {
    const document = `mutation CreateBooking($input: CreateBookingInput!) {
      createBooking(input: $input) { id }
    }`;
    const base = {
      calendarId,
      startTime: '2099-09-02T17:00:00.000Z',
      endTime: '2099-09-02T17:30:00.000Z',
    };
    const foreignCalendar = await mutate(organizationId, document, {
      input: { ...base, calendarId: otherCalendarId },
    }).expect(200);
    expect(foreignCalendar.body.data).toBeNull();
    expect(foreignCalendar.body.errors[0].extensions.code).toBe('NOT_FOUND');

    const foreignContact = await mutate(organizationId, document, {
      input: { ...base, contactId: otherContactId },
    }).expect(200);
    expect(foreignContact.body.data).toBeNull();
    expect(foreignContact.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_CONTACT',
    });

    const foreignAssignee = await mutate(organizationId, document, {
      input: { ...base, assignedToId: otherUserId },
    }).expect(200);
    expect(foreignAssignee.body.data).toBeNull();
    expect(foreignAssignee.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_ASSIGNEE',
    });
  });

  it('serializes simultaneous creates so only one booking claims a slot', async () => {
    const document = `mutation CreateBooking($input: CreateBookingInput!) {
      createBooking(input: $input) { id startTime endTime }
    }`;
    const variables = {
      input: {
        calendarId,
        startTime: '2099-09-03T17:00:00.000Z',
        endTime: '2099-09-03T17:30:00.000Z',
      },
    };
    const responses = await Promise.all([
      mutate(organizationId, document, variables).expect(200),
      mutate(organizationId, document, variables).expect(200),
    ]);
    expect(
      responses.filter((response) => response.body.data?.createBooking),
    ).toHaveLength(1);
    expect(
      responses.filter(
        (response) =>
          response.body.errors?.[0]?.extensions?.reason === 'SLOT_UNAVAILABLE',
      ),
    ).toHaveLength(1);
    const persisted = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM bookings
       WHERE organization_id = $1
         AND calendar_id = $2
         AND start_time = $3`,
      [organizationId, calendarId, variables.input.startTime],
    );
    expect(persisted.rows[0].total).toBe(1);
  });

  it('reschedules a retained booking with one versioned event and rejects overlap', async () => {
    const retained = await request(legacyApp)
      .post('/api/bookings')
      .set('Cookie', `itemize_auth=${token}`)
      .set('x-organization-id', String(organizationId))
      .send({
        calendar_id: calendarId,
        start_time: '2099-09-04T17:00:00.000Z',
        end_time: '2099-09-04T17:30:00.000Z',
        timezone: 'America/Phoenix',
      })
      .expect(201);
    const bookingId = Number(retained.body.id);
    const document = `mutation RescheduleBooking(
      $id: Int!,
      $input: RescheduleBookingInput!
    ) {
      rescheduleBooking(id: $id, input: $input) {
        id startTime endTime timezone status calendarName
      }
    }`;
    const rescheduled = await mutate(organizationId, document, {
      id: bookingId,
      input: {
        startTime: '2099-09-05T18:00:00.000Z',
        endTime: '2099-09-05T18:30:00.000Z',
        timezone: 'America/Chicago',
      },
    }).expect(200);
    expect(rescheduled.body.errors).toBeUndefined();
    expect(rescheduled.body.data.rescheduleBooking).toMatchObject({
      id: bookingId,
      startTime: '2099-09-05T18:00:00.000Z',
      endTime: '2099-09-05T18:30:00.000Z',
      timezone: 'America/Chicago',
      status: 'CONFIRMED',
      calendarName: 'Primary Calendar',
    });

    const events = await pool.query<{
      total: number;
      version: number;
      old_start: string;
      new_start: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         MAX((payload ->> 'version')::int)::int AS version,
         MAX(payload #>> '{oldTime,start}') AS old_start,
         MAX(payload #>> '{newTime,start}') AS new_start
       FROM workflow_triggers
       WHERE organization_id = $1
         AND trigger_type = 'booking_rescheduled'
         AND entity_id = $2`,
      [organizationId, bookingId],
    );
    expect(events.rows[0]).toMatchObject({ total: 1, version: 1 });
    expect(new Date(events.rows[0].old_start).toISOString()).toBe(
      '2099-09-04T17:00:00.000Z',
    );
    expect(new Date(events.rows[0].new_start).toISOString()).toBe(
      '2099-09-05T18:00:00.000Z',
    );

    const overlap = await mutate(organizationId, document, {
      id: bookingId,
      input: {
        startTime: '2099-08-02T17:00:00.000Z',
        endTime: '2099-08-02T17:30:00.000Z',
      },
    }).expect(200);
    expect(overlap.body.data).toBeNull();
    expect(overlap.body.errors[0].extensions).toMatchObject({
      code: 'CONFLICT',
      reason: 'SLOT_UNAVAILABLE',
    });
  });

  it('requires CSRF before create and reschedule writes', async () => {
    const create = await mutate(
      organizationId,
      `mutation CreateBooking($input: CreateBookingInput!) {
        createBooking(input: $input) { id }
      }`,
      {
        input: {
          calendarId,
          startTime: '2099-09-06T17:00:00.000Z',
          endTime: '2099-09-06T17:30:00.000Z',
        },
      },
      false,
    ).expect(200);
    expect(create.body.data).toBeNull();
    expect(create.body.errors[0].extensions.code).toBe('FORBIDDEN');

    const reschedule = await mutate(
      organizationId,
      `mutation RescheduleBooking(
        $id: Int!,
        $input: RescheduleBookingInput!
      ) {
        rescheduleBooking(id: $id, input: $input) { id }
      }`,
      {
        id: bookingIds[1],
        input: {
          startTime: '2099-09-07T17:00:00.000Z',
          endTime: '2099-09-07T17:30:00.000Z',
        },
      },
      false,
    ).expect(200);
    expect(reschedule.body.data).toBeNull();
    expect(reschedule.body.errors[0].extensions.code).toBe('FORBIDDEN');
  });

  it('requires CSRF before cancellation', async () => {
    const response = await mutate(
      organizationId,
      `mutation CancelBooking($id: Int!) {
        cancelBooking(id: $id) { id status }
      }`,
      { id: bookingIds[0] },
      false,
    ).expect(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const status = await pool.query<{ status: string }>(
      'SELECT status FROM bookings WHERE id = $1',
      [bookingIds[0]],
    );
    expect(status.rows[0].status).toBe('confirmed');
  });

  it('cancels once with one durable workflow event and rejects replay', async () => {
    const document = `mutation CancelBooking($id: Int!, $reason: String) {
      cancelBooking(id: $id, reason: $reason) {
        id status cancellationReason cancelledAt calendarName contactEmail
      }
    }`;
    const first = await mutate(organizationId, document, {
      id: bookingIds[0],
      reason: '  Integration gate  ',
    }).expect(200);
    expect(first.body.errors).toBeUndefined();
    expect(first.body.data.cancelBooking).toMatchObject({
      id: bookingIds[0],
      status: 'CANCELLED',
      cancellationReason: 'Integration gate',
      calendarName: 'Primary Calendar',
    });
    expect(first.body.data.cancelBooking.cancelledAt).toBeTruthy();

    const replay = await mutate(organizationId, document, {
      id: bookingIds[0],
      reason: 'Again',
    }).expect(200);
    expect(replay.body.data).toBeNull();
    expect(replay.body.errors[0].extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      reason: 'INVALID_BOOKING_STATUS',
    });
    const events = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM workflow_triggers
       WHERE organization_id = $1
         AND trigger_type = 'booking_cancelled'
         AND entity_id = $2`,
      [organizationId, bookingIds[0]],
    );
    expect(events.rows[0].total).toBe(1);
  });
});
