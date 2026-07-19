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
  let organizationId: number;
  let otherOrganizationId: number;
  let calendarId: number;
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
       VALUES ($1, $3, 'owner', NOW()), ($2, $3, 'owner', NOW())`,
      [organizationId, otherOrganizationId, userId],
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
    const otherCalendarId = Number(calendars.rows[1].id);
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
    const contactId = Number(contacts.rows[0].id);
    const otherContactId = Number(contacts.rows[1].id);

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
});
