import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import express, { Express, NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { enqueueBookingNotification } from '../../src/bookings/booking-notification';
import { BookingsRepository } from '../../src/bookings/bookings.repository';
import { PG_POOL } from '../../src/database/database.module';

type SeededUser = {
  user: { id: number };
  org: { id: number };
};

describe('Public bookings protocol (legacy behavior pinned)', () => {
  let app: NestExpressApplication;
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
    const TestDbHelper = require('../../../db/test-support/test-db-helper');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;
    owner = await dbHelper.seedUser(
      `public-bookings-owner-${Date.now()}@test.itemize`,
      'Bookings Owner',
    );
    await pool.query('UPDATE organizations SET contacts_limit=5000 WHERE id=$1', [owner.org.id]);

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
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      // The Nest app shutdown already ended the shared pool; reopen a short
      // lived one so the helper can clean up its seeded rows.
      const TestDbHelper = require('../../../db/test-support/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  const getPath = async (path: string) => request(app.getHttpServer()).get(path);
  const createRequest = (identifier: string, idempotencyKey = crypto.randomUUID()) =>
    request(app.getHttpServer())
      .post(`/api/bookings/public/book/${identifier}`)
      .set('idempotency-key', idempotencyKey);

  it('serves the public booking page identically by global ID and unambiguous slug', async () => {
    const calendar = await insertCalendar('Parity Page');
    for (const identifier of [calendar.public_id, calendar.slug]) {
      const nest = await getPath(
        `/api/bookings/public/book/${identifier}`,
      );
      expect(nest.status).toBe(200);
      expect(nest.body.public_id).toBe(calendar.public_id);
      expect(Array.isArray(nest.body.availability)).toBe(true);
      expect(nest.body.availability).toHaveLength(7);
    }
  });

  it('conceals unknown and cross-organization ambiguous slugs identically', async () => {
    const unknown = await getPath('/api/bookings/public/book/never-existed');
    expect(unknown.status).toBe(404);
        

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
    const ambiguous = await getPath(
      `/api/bookings/public/book/${ambiguousSlug}`,
    );
    expect(ambiguous.status).toBe(404);
        
  });

  it('stops new public intake after paid access ends but preserves existing cancellation', async () => {
    const calendar = await insertCalendar('Entitlement expiry');
    const body = { ...futureSlot(96), attendee_name: 'Entitlement QA', attendee_email: 'entitlement@test.itemize', timezone: 'UTC' };
    const created = await createRequest(calendar.public_id).send(body).expect(201);
    try {
      for (const state of [
        { plan: 'free', status: 'active', end: null },
        { plan: 'starter', status: 'past_due', end: null },
        { plan: 'starter', status: 'trialing', end: new Date(Date.now() - 1000) },
      ]) {
        await pool.query('UPDATE organizations SET plan=$2,subscription_status=$3,trial_ends_at=$4 WHERE id=$1', [owner.org.id,state.plan,state.status,state.end]);
        await request(app.getHttpServer()).get(`/api/bookings/public/book/${calendar.public_id}`).expect(404);
        await request(app.getHttpServer()).get(`/api/bookings/public/book/${calendar.public_id}/slots?start_date=${body.start_time.slice(0,10)}`).expect(404);
        await createRequest(calendar.public_id).send({ ...body, ...futureSlot(120) }).expect(404);
      }
      await request(app.getHttpServer()).post(`/api/bookings/public/book/${calendar.public_id}/status`).send({ token: created.body.booking.cancellation_token }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/public/book/${calendar.public_id}/cancel/${created.body.booking.cancellation_token}`).send({}).expect(200);
      expect(Number((await pool.query('SELECT count(*) FROM bookings WHERE calendar_id=$1', [calendar.id])).rows[0].count)).toBe(1);
    } finally {
      await pool.query("UPDATE organizations SET plan='starter',subscription_status='trialing',trial_ends_at=NOW()+INTERVAL '14 days' WHERE id=$1", [owner.org.id]);
    }
    await request(app.getHttpServer()).get(`/api/bookings/public/book/${calendar.public_id}`).expect(200);
  });

  it('reads current times only with the matching unexpired capability', async () => {
    const calendar = await insertCalendar('Status owner');
    const other = await insertCalendar('Other status calendar');
    const created = await createRequest(calendar.public_id).send({
      ...futureSlot(72), attendee_name: 'Status QA', attendee_email: 'status@test.itemize', timezone: ' UTC ',
    }).expect(201);
    expect(created.body.booking.timezone).toBe('UTC');
    const token = created.body.booking.cancellation_token;
    const read = (identifier = calendar.public_id, capability = token) => request(app.getHttpServer())
      .post(`/api/bookings/public/book/${identifier}/status`).send({ token: capability });
    const initial = await read().expect(200);
    expect(Object.keys(initial.body).sort()).toEqual(['end_time', 'start_time', 'status', 'timezone']);
    await read(other.public_id).expect(404);
    await read(calendar.public_id, 'ff'.repeat(32)).expect(404);
    const next = futureSlot(120);
    const repository = app.get(BookingsRepository);
    expect((await repository.reschedule(owner.org.id, created.body.booking.id, new Date(next.start_time), new Date(next.end_time), 'America/Phoenix')).kind).toBe('rescheduled');
    const updated = await read().expect(200);
    expect(updated.body).toEqual({ ...next, status: 'confirmed', timezone: 'America/Phoenix' });
    await pool.query("UPDATE bookings SET cancellation_token_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [created.body.booking.id]);
    await read().expect(404);
    await pool.query("UPDATE bookings SET cancellation_token_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 day' WHERE id = $1", [created.body.booking.id]);
    await request(app.getHttpServer()).post(`/api/bookings/public/book/${calendar.public_id}/cancel/${token}`).send({}).expect(200);
    await read().expect(404);
  });

  it('validates and serves slot ranges identically', async () => {
    const calendar = await insertCalendar('Parity Slots');
    const day = futureSlot(72).start_time.slice(0, 10);

    const valid = await getPath(
      `/api/bookings/public/book/${calendar.public_id}/slots?start_date=${day}`,
    );
    expect(valid.status).toBe(200);
        
    expect(valid.body.calendar.id).toBe(calendar.id);
    expect(valid.body.slots.length).toBeGreaterThan(0);

    for (const query of [
      'start_date=2026-13-40',
      'start_date=2026-09-02&end_date=2026-09-01',
      'start_date=2026-09-01&end_date=2026-10-15',
    ]) {
      const nest = await getPath(
        `/api/bookings/public/book/${calendar.public_id}/slots?${query}`,
      );
      expect(nest.status).toBe(400);
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
      const nest = await createRequest(calendar.public_id).send(body);
      expect(nest.status).toBe(400);
    }
  });

  it('creates equivalent bookings, reuses one canonical contact, and enqueues the trigger', async () => {
    const calendar = await insertCalendar('Parity Create');
    const email = `attendee-${Date.now()}@Example.com`;
    const nestSlot = futureSlot(48);
    const legacySlot = futureSlot(96);

    const firstKey = crypto.randomUUID();
    const firstBody = {
      ...nestSlot,
      attendee_name: 'Parity Attendee',
      attendee_email: email,
      notes: 'via nest',
    };
    const nest = await createRequest(calendar.public_id, firstKey)
      .send(firstBody)
      .expect(201);
    const replay = await createRequest(calendar.public_id, firstKey)
      .send(firstBody)
      .expect(201);
    expect(replay.body).toMatchObject({
      replayed: true,
      booking: {
        id: nest.body.booking.id,
        cancellation_token: nest.body.booking.cancellation_token,
      },
    });
    await createRequest(calendar.public_id, firstKey)
      .send({
        ...firstBody,
        notes: 'different payload',
      })
      .expect(409);
    const legacy = await createRequest(calendar.public_id)
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
        message: 'Booking confirmed.',
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
    await createRequest(calendar.public_id)
      .send(body)
      .expect(201);

    const nest = await createRequest(calendar.public_id).send(body);
    expect(nest.status).toBe(409);
    expect(nest.body).toMatchObject({
      error: 'This time slot is no longer available',
    });
  });

  it('binds cancellation capabilities to their calendar and denies replay identically', async () => {
    const calendar = await insertCalendar('Parity Cancel');
    const otherCalendar = await insertCalendar('Parity Cancel Other');
    const created = await createRequest(calendar.public_id)
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
      request(app.getHttpServer())
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
      request(app.getHttpServer())
        .post(`/api/bookings/public/book/${calendar.public_id}/cancel/${token}`)
        .send({}),
    ]);
    expect(replays[0].status).toBe(404);
    expect(replays[1].status).toBe(404);
    expect(replays[0].body).toEqual(replays[1].body);
  });

  it('cancels a legacy-issued capability through the legacy route with the same contract', async () => {
    const calendar = await insertCalendar('Parity Cancel Legacy');
    const created = await createRequest(calendar.public_id)
      .send({
        ...futureSlot(168),
        attendee_name: 'Legacy Attendee',
        attendee_email: `legacy-cancel-${Date.now()}@test.itemize`,
      })
      .expect(201);
    const cancelled = await request(app.getHttpServer())
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
  it('queues durable, escaped booking emails once per lifecycle change and respects calendar preference', async () => {
    const calendar = await insertCalendar('QA <booking> & notification');
    await pool.query('UPDATE calendars SET confirmation_email=TRUE WHERE id=$1', [calendar.id]);
    const key = crypto.randomUUID();
    const body = { ...futureSlot(192), attendee_name: 'QA Attendee', attendee_email: 'qa@example.com', timezone: 'America/Phoenix' };
    const created = await createRequest(calendar.public_id, key).send(body).expect(201);
    const bookingId = created.body.booking.id;
    await createRequest(calendar.public_id, key).send(body).expect(201);
    const notifications = async () => (await pool.query(
      "SELECT payload FROM workflow_side_effect_outbox WHERE organization_id=$1 AND payload->>'bookingId'=$2 ORDER BY id",
      [owner.org.id, String(bookingId)],
    )).rows;
    let rows = await notifications();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ to: 'qa@example.com', bookingEvent: 'confirmed', bookingId });
    expect(rows[0].payload.bodyHtml).toContain('QA &lt;booking&gt; &amp; notification');
    for (const marker of ['<!doctype html>', 'https://itemize.cloud/cover.png', '#2563eb', '#f1f5f9', "font-family:'Raleway'", 'Sent securely with Itemize.']) {
      expect(rows[0].payload.bodyHtml).toContain(marker);
    }
    expect(rows[0].payload.bodyText).toContain('Timezone: America/Phoenix');
    expect(rows[0].payload.bodyText).toContain(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix', dateStyle: 'full', timeStyle: 'short',
    }).format(new Date(body.start_time)));
    const originalPayload = rows[0].payload;
    const repository = new BookingsRepository(pool);
    const next = futureSlot(216);
    expect((await repository.reschedule(owner.org.id, bookingId, new Date(next.start_time), new Date(next.end_time), 'America/Phoenix')).kind).toBe('rescheduled');
    await repository.reschedule(owner.org.id, bookingId, new Date(next.start_time), new Date(next.end_time), 'America/Phoenix');
    rows = await notifications();
    expect(rows.map(row => row.payload.bookingEvent)).toEqual(['confirmed', 'rescheduled']);
    expect(rows[0].payload).toEqual(originalPayload);
    await request(app.getHttpServer()).post(`/api/bookings/public/book/${calendar.public_id}/cancel/${created.body.booking.cancellation_token}`).send({}).expect(200);
    expect((await notifications()).map(row => row.payload.bookingEvent)).toEqual(['confirmed', 'rescheduled', 'cancelled']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await enqueueBookingNotification(client, owner.org.id, bookingId, 'confirmed', 'rolled-back');
      await client.query('ROLLBACK');
      await enqueueBookingNotification(client, -1, bookingId, 'confirmed', 'foreign-org');
    } finally { client.release(); }
    expect(await notifications()).toHaveLength(3);
    await pool.query("UPDATE bookings SET timezone='legacy-invalid-zone' WHERE id=$1", [bookingId]);
    const legacyClient = await pool.connect();
    try { await enqueueBookingNotification(legacyClient, owner.org.id, bookingId, 'cancelled', 'legacy-zone'); } finally { legacyClient.release(); }
    expect((await notifications())[3].payload.bodyText).toContain('Timezone: UTC');
    await pool.query('UPDATE calendars SET confirmation_email=FALSE WHERE id=$1', [calendar.id]);
    const disabled = await createRequest(calendar.public_id).send({ ...body, ...futureSlot(240) }).expect(201);
    expect((await pool.query("SELECT id FROM workflow_side_effect_outbox WHERE payload->>'bookingId'=$1", [String(disabled.body.booking.id)])).rows).toHaveLength(0);
  });

  it('preserves bookings at contact capacity and reuses an existing contact', async () => {
    const calendar = await insertCalendar('Contact quota');
    const existing = (await pool.query("INSERT INTO contacts (organization_id,first_name,email) VALUES ($1,'Existing',$2) RETURNING id,email", [owner.org.id, `quota-existing-${Date.now()}@test.itemize`])).rows[0];
    const saved = (await pool.query('SELECT contacts_limit FROM organizations WHERE id=$1', [owner.org.id])).rows[0].contacts_limit;
    const before = Number((await pool.query('SELECT COUNT(*)::int AS n FROM contacts WHERE organization_id=$1', [owner.org.id])).rows[0].n);
    try {
      await pool.query('UPDATE organizations SET contacts_limit=$2 WHERE id=$1', [owner.org.id, before]);
      const [fresh, linked] = await Promise.all([
        createRequest(calendar.public_id).send({ ...futureSlot(480), attendee_name: 'New lead', attendee_email: `quota-new-${Date.now()}@test.itemize`, timezone: 'UTC' }),
        createRequest(calendar.public_id).send({ ...futureSlot(504), attendee_name: 'Existing lead', attendee_email: existing.email, timezone: 'UTC' }),
      ]);
      expect(fresh.status).toBe(201); expect(linked.status).toBe(201);
      const rows = await pool.query('SELECT id, contact_id, attendee_email FROM bookings WHERE id=ANY($1::int[]) ORDER BY id', [[fresh.body.booking.id, linked.body.booking.id]]);
      expect(rows.rows.find(row => row.id === fresh.body.booking.id)).toMatchObject({ contact_id: null, attendee_email: expect.stringContaining('quota-new-') });
      expect(rows.rows.find(row => row.id === linked.body.booking.id)).toMatchObject({ contact_id: existing.id });
      expect((await pool.query('SELECT COUNT(*)::int AS n FROM contacts WHERE organization_id=$1', [owner.org.id])).rows[0].n).toBe(before);
    } finally { await pool.query('UPDATE organizations SET contacts_limit=$2 WHERE id=$1', [owner.org.id, saved]); }
  });

});
