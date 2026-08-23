import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

type SeededUser = {
  user: { id: number };
  org: { id: number };
};

describe('Public bookings retained HTTP parity (NestJS vs legacy origin)', () => {
  let app: NestExpressApplication;
  let legacyApp: Express;
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;
  let owner: SeededUser;

  // One-hour slots require a one-hour calendar: the booking write revalidates
  // the calendar duration through booking_slot_policy_reason.
  const insertCalendar = async (name: string, durationMinutes = 60) => {
    const suffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const inserted = await pool.query<{
      id: number;
      slug: string;
      public_id: string;
    }>(
      `INSERT INTO calendars (
         organization_id, name, slug, timezone, duration_minutes,
         min_notice_hours, max_future_days, assigned_to, created_by, is_active
       ) VALUES ($1, $2, $3, 'UTC', $4, 0, 365, $5, $5, TRUE)
       RETURNING id, slug, public_id`,
      [
        owner.org.id,
        name,
        `public-bookings-parity-${suffix}`,
        durationMinutes,
        owner.user.id,
      ],
    );
    const calendar = inserted.rows[0];
    await pool.query(
      `INSERT INTO availability_windows (
         calendar_id, day_of_week, start_time, end_time, is_active
       )
       SELECT $1, day, '00:00:00', '23:59:59', TRUE
       FROM generate_series(0, 6) day`,
      [calendar.id],
    );
    return calendar;
  };

  const futureSlot = (offsetHours: number) => {
    const start = new Date(Date.now() + offsetHours * 3600 * 1000);
    start.setUTCMinutes(0, 0, 0);
    let end = new Date(start.getTime() + 3600 * 1000);
    if (start.getUTCDate() !== end.getUTCDate()) {
      start.setUTCHours(20, 0, 0, 0);
      end = new Date(start.getTime() + 3600 * 1000);
    }
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for public bookings tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    const createBookingsRouter = require('../../../backend/src/routes/bookings.routes');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `public-bookings-owner-${Date.now()}@test.itemize`,
      'Bookings Owner',
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

    const noopLimit = (_req: Request, _res: Response, next: NextFunction) =>
      next();
    legacyApp = express();
    legacyApp.use(express.json());
    legacyApp.use('/api/bookings', createBookingsRouter(pool, noopLimit));
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      // The Nest app shutdown already ended the shared pool; reopen a short
      // lived one so the helper can clean up its seeded rows.
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  const bothGet = async (path: string) => {
    const [nest, legacy] = await Promise.all([
      request(app.getHttpServer()).get(path),
      request(legacyApp).get(path),
    ]);
    return { nest, legacy };
  };

  it('serves the public booking page identically by global ID and unambiguous slug', async () => {
    const calendar = await insertCalendar('Parity Page');
    for (const identifier of [calendar.public_id, calendar.slug]) {
      const { nest, legacy } = await bothGet(
        `/api/bookings/public/book/${identifier}`,
      );
      expect(nest.status).toBe(200);
      expect(legacy.status).toBe(200);
      expect(nest.body).toEqual(legacy.body);
      expect(nest.body.public_id).toBe(calendar.public_id);
      expect(Array.isArray(nest.body.availability)).toBe(true);
      expect(nest.body.availability).toHaveLength(7);
    }
  });

  it('conceals unknown and cross-organization ambiguous slugs identically', async () => {
    const unknown = await bothGet('/api/bookings/public/book/never-existed');
    expect(unknown.nest.status).toBe(404);
    expect(unknown.legacy.status).toBe(404);
    expect(unknown.nest.body).toEqual(unknown.legacy.body);

    const ambiguousSlug = `ambiguous-${Date.now()}`;
    const other = await dbHelper.seedUser(
      `public-bookings-other-${Date.now()}@test.itemize`,
      'Other Owner',
    );
    for (const seeded of [owner, other]) {
      await pool.query(
        `INSERT INTO calendars (
           organization_id, name, slug, timezone, duration_minutes,
           assigned_to, created_by, is_active
         ) VALUES ($1, 'Ambiguous', $2, 'UTC', 30, $3, $3, TRUE)`,
        [seeded.org.id, ambiguousSlug, seeded.user.id],
      );
    }
    const ambiguous = await bothGet(
      `/api/bookings/public/book/${ambiguousSlug}`,
    );
    expect(ambiguous.nest.status).toBe(404);
    expect(ambiguous.legacy.status).toBe(404);
    expect(ambiguous.nest.body).toEqual(ambiguous.legacy.body);
  });

  it('validates and serves slot ranges identically', async () => {
    const calendar = await insertCalendar('Parity Slots');
    const day = futureSlot(72).start_time.slice(0, 10);

    const valid = await bothGet(
      `/api/bookings/public/book/${calendar.public_id}/slots?start_date=${day}`,
    );
    expect(valid.nest.status).toBe(200);
    expect(valid.legacy.status).toBe(200);
    expect(valid.nest.body).toEqual(valid.legacy.body);
    expect(valid.nest.body.calendar.id).toBe(calendar.id);
    expect(valid.nest.body.slots.length).toBeGreaterThan(0);

    for (const query of [
      'start_date=2026-13-40',
      'start_date=2026-09-02&end_date=2026-09-01',
      'start_date=2026-09-01&end_date=2026-10-15',
    ]) {
      const { nest, legacy } = await bothGet(
        `/api/bookings/public/book/${calendar.public_id}/slots?${query}`,
      );
      expect(nest.status).toBe(400);
      expect(legacy.status).toBe(400);
      expect(nest.body).toEqual(legacy.body);
    }
  });

  it('rejects incomplete public bookings identically', async () => {
    const calendar = await insertCalendar('Parity Validation');
    for (const body of [
      { attendee_name: 'Sam' },
      {
        start_time: 'not-a-time',
        attendee_name: 'Sam',
        attendee_email: 'sam@example.com',
      },
    ]) {
      const [nest, legacy] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/bookings/public/book/${calendar.public_id}`)
          .send(body),
        request(legacyApp)
          .post(`/api/bookings/public/book/${calendar.public_id}`)
          .send(body),
      ]);
      expect(nest.status).toBe(400);
      expect(legacy.status).toBe(400);
      expect(nest.body).toEqual(legacy.body);
    }
  });

  it('creates equivalent bookings, reuses one canonical contact, and enqueues the trigger', async () => {
    const calendar = await insertCalendar('Parity Create');
    const email = `attendee-${Date.now()}@Example.com`;
    const nestSlot = futureSlot(48);
    const legacySlot = futureSlot(96);

    const nest = await request(app.getHttpServer())
      .post(`/api/bookings/public/book/${calendar.public_id}`)
      .send({
        ...nestSlot,
        attendee_name: 'Parity Attendee',
        attendee_email: email,
        notes: 'via nest',
      })
      .expect(201);
    const legacy = await request(legacyApp)
      .post(`/api/bookings/public/book/${calendar.public_id}`)
      .send({
        ...legacySlot,
        attendee_name: 'Parity Attendee',
        attendee_email: email,
        notes: 'via legacy',
      })
      .expect(201);

    for (const response of [nest, legacy]) {
      expect(response.body).toMatchObject({
        success: true,
        message: 'Booking confirmed! Check your email for confirmation details.',
      });
      expect(Object.keys(response.body.booking).sort()).toEqual([
        'attendee_email',
        'attendee_name',
        'cancellation_token',
        'end_time',
        'id',
        'start_time',
        'timezone',
      ]);
      expect(response.body.booking.cancellation_token).toMatch(/^[a-f0-9]{64}$/);
    }

    const rows = await pool.query(
      `SELECT id, status, source, contact_id, cancellation_token_hash,
              cancellation_token_expires_at, end_time
       FROM bookings
       WHERE calendar_id = $1
       ORDER BY id`,
      [calendar.id],
    );
    expect(rows.rows).toHaveLength(2);
    const byId = new Map(rows.rows.map((row) => [Number(row.id), row]));
    for (const [response, token] of [
      [nest, nest.body.booking.cancellation_token],
      [legacy, legacy.body.booking.cancellation_token],
    ] as const) {
      const row = byId.get(Number(response.body.booking.id));
      expect(row).toMatchObject({ status: 'confirmed', source: 'booking_page' });
      expect(row.cancellation_token_hash).toBe(
        crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
      );
      expect(new Date(row.cancellation_token_expires_at).getTime()).toBe(
        new Date(row.end_time).getTime() + 24 * 3600 * 1000,
      );
    }

    expect(rows.rows[0].contact_id).not.toBeNull();
    expect(rows.rows[0].contact_id).toBe(rows.rows[1].contact_id);
    const contact = await pool.query(
      'SELECT email FROM contacts WHERE id = $1',
      [rows.rows[0].contact_id],
    );
    expect(contact.rows[0].email).toBe(email.toLowerCase());

    const triggers = await pool.query(
      `SELECT trigger_type, payload
       FROM workflow_triggers
       WHERE event_key = ANY($1::text[])
       ORDER BY id`,
      [rows.rows.map((row) => `domain:booking_created:${row.id}`)],
    );
    expect(triggers.rows).toHaveLength(2);
    expect(triggers.rows[0].payload).toEqual({
      booking_id: Number(rows.rows[0].id),
      calendar_id: calendar.id,
    });
  });

  it('rejects a taken slot identically after the authoritative recheck', async () => {
    const calendar = await insertCalendar('Parity Conflict');
    const slot = futureSlot(120);
    const body = {
      ...slot,
      attendee_name: 'First Attendee',
      attendee_email: `first-${Date.now()}@test.itemize`,
    };
    await request(app.getHttpServer())
      .post(`/api/bookings/public/book/${calendar.public_id}`)
      .send(body)
      .expect(201);

    const [nest, legacy] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/bookings/public/book/${calendar.public_id}`)
        .send(body),
      request(legacyApp)
        .post(`/api/bookings/public/book/${calendar.public_id}`)
        .send(body),
    ]);
    expect(nest.status).toBe(409);
    expect(legacy.status).toBe(409);
    expect(nest.body).toEqual(legacy.body);
    expect(nest.body).toMatchObject({
      error: 'This time slot is no longer available',
    });
  });

  it('binds cancellation capabilities to their calendar and denies replay identically', async () => {
    const calendar = await insertCalendar('Parity Cancel');
    const otherCalendar = await insertCalendar('Parity Cancel Other');
    const created = await request(app.getHttpServer())
      .post(`/api/bookings/public/book/${calendar.public_id}`)
      .send({
        ...futureSlot(144),
        attendee_name: 'Cancel Attendee',
        attendee_email: `cancel-${Date.now()}@test.itemize`,
      })
      .expect(201);
    const token = created.body.booking.cancellation_token;

    const malformed = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/bookings/public/book/${calendar.public_id}/cancel/not-a-token`)
        .send({}),
      request(legacyApp)
        .post(`/api/bookings/public/book/${calendar.public_id}/cancel/not-a-token`)
        .send({}),
    ]);
    expect(malformed[0].status).toBe(404);
    expect(malformed[1].status).toBe(404);
    expect(malformed[0].body).toEqual(malformed[1].body);

    await request(app.getHttpServer())
      .post(`/api/bookings/public/book/${otherCalendar.public_id}/cancel/${token}`)
      .send({})
      .expect(404);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/bookings/public/book/${calendar.public_id}/cancel/${token}`)
      .send({ reason: 'Changed plans' })
      .expect(200);
    expect(cancelled.body).toEqual({
      success: true,
      message: 'Your booking has been cancelled.',
    });

    const row = await pool.query(
      `SELECT status, cancellation_reason, cancellation_token_hash
       FROM bookings
       WHERE id = $1`,
      [created.body.booking.id],
    );
    expect(row.rows[0]).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'Changed plans',
      cancellation_token_hash: null,
    });
    const trigger = await pool.query(
      'SELECT payload FROM workflow_triggers WHERE event_key = $1',
      [`domain:booking_cancelled:${created.body.booking.id}`],
    );
    expect(trigger.rows[0].payload).toEqual({
      booking_id: Number(created.body.booking.id),
      reason: 'Changed plans',
    });

    const replays = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/bookings/public/book/${calendar.public_id}/cancel/${token}`)
        .send({}),
      request(legacyApp)
        .post(`/api/bookings/public/book/${calendar.public_id}/cancel/${token}`)
        .send({}),
    ]);
    expect(replays[0].status).toBe(404);
    expect(replays[1].status).toBe(404);
    expect(replays[0].body).toEqual(replays[1].body);
  });

  it('cancels a legacy-issued capability through the legacy route with the same contract', async () => {
    const calendar = await insertCalendar('Parity Cancel Legacy');
    const created = await request(legacyApp)
      .post(`/api/bookings/public/book/${calendar.public_id}`)
      .send({
        ...futureSlot(168),
        attendee_name: 'Legacy Attendee',
        attendee_email: `legacy-cancel-${Date.now()}@test.itemize`,
      })
      .expect(201);
    const cancelled = await request(legacyApp)
      .post(
        `/api/bookings/public/book/${calendar.public_id}/cancel/${created.body.booking.cancellation_token}`,
      )
      .send({})
      .expect(200);
    expect(cancelled.body).toEqual({
      success: true,
      message: 'Your booking has been cancelled.',
    });
    const row = await pool.query(
      'SELECT cancellation_reason FROM bookings WHERE id = $1',
      [created.body.booking.id],
    );
    expect(row.rows[0].cancellation_reason).toBe('Cancelled by attendee');
  });
});
