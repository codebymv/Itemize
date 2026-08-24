import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/database.module';
import { CalendarSyncJobsService } from '../../src/calendar-sync-jobs/calendar-sync-jobs.service';
import {
  GOOGLE_CALENDAR_EVENTS_PROVIDER,
} from '../../src/calendar-sync-jobs/google-calendar-events.provider';

type JobRow = {
  status: string;
  attempt_count: number;
  last_error: string | null;
  claimed_by: string | null;
  result: Record<string, unknown> | null;
  completed_at: Date | null;
};

type EventOp = { op: string; eventId?: string; calendarId: string; bookingId?: number };

describe('Calendar sync worker parity (NestJS vs legacy)', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let nestJobs: CalendarSyncJobsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let legacyJobs: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbHelper: any;

  const eventOps: EventOp[] = [];
  let createConflict = false;
  const fakeEventsProvider = {
    listEvents: jest.fn(async () => []),
    createEventFromBooking: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_connection: any, booking: any, calendarId: string) => {
        if (createConflict) {
          createConflict = false;
          const error = new Error('duplicate id') as Error & { code?: number };
          error.code = 409;
          throw error;
        }
        eventOps.push({ op: 'create', calendarId, bookingId: booking.id });
      },
    ),
    updateEvent: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_connection: any, eventId: string, booking: any, calendarId: string) => {
        eventOps.push({ op: 'update', eventId, calendarId, bookingId: booking.id });
      },
    ),
    deleteEvent: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_connection: any, eventId: string, calendarId: string) => {
        eventOps.push({ op: 'delete', eventId, calendarId });
      },
    ),
  };

  const seedFixture = async (label: string, { maxFutureDays = 30 } = {}) => {
    const user = await dbHelper.seedUser(
      `calendar-sync-${label}-${Date.now()}-${Math.random()}@test.itemize`,
      `Calendar Sync ${label}`,
    );
    const connection = (
      await pool.query<{ id: number }>(
        `INSERT INTO calendar_connections (
           user_id, organization_id, provider, provider_email,
           access_token, refresh_token, sync_enabled, sync_direction,
           selected_calendars, is_active
         ) VALUES ($1, $2, 'google', 'sync@example.test',
                   'enc:v1:test-key:QQ:QQ:QQ', 'enc:v1:test-key:QQ:QQ:QQ',
                   TRUE, 'both', $3::jsonb, TRUE)
         RETURNING id`,
        [user.user.id, user.org.id, JSON.stringify(['primary'])],
      )
    ).rows[0];
    const calendar = (
      await pool.query<{ id: number }>(
        `INSERT INTO calendars (
           organization_id, name, slug, assigned_to, max_future_days, is_active, created_by
         ) VALUES ($1, $2, $3, $4, $5, TRUE, $4)
         RETURNING id`,
        [
          user.org.id,
          `Sync calendar ${label}`,
          `sync-${label}-${Date.now()}`,
          user.user.id,
          maxFutureDays,
        ],
      )
    ).rows[0];
    return { user, connectionId: connection.id, calendarId: calendar.id };
  };

  const seedJob = async (
    fixture: { user: { org: { id: number } }; connectionId: number },
    direction: string,
    { attemptCount = 0 } = {},
  ) => {
    const row = (
      await pool.query<{ id: number }>(
        `INSERT INTO calendar_sync_jobs (
           organization_id, connection_id, direction, selected_calendars,
           status, attempt_count, next_attempt_at
         ) VALUES ($1, $2, $3, $4::jsonb, 'queued', $5,
                   CURRENT_TIMESTAMP - INTERVAL '1 second')
         RETURNING id`,
        [
          fixture.user.org.id,
          fixture.connectionId,
          direction,
          JSON.stringify(['primary']),
          attemptCount,
        ],
      )
    ).rows[0];
    return row.id;
  };

  const jobRow = async (id: number): Promise<JobRow> =>
    (
      await pool.query<JobRow>(
        `SELECT status, attempt_count, last_error, claimed_by, result, completed_at
         FROM calendar_sync_jobs WHERE id = $1`,
        [id],
      )
    ).rows[0];

  // A pass-through connection loader used on BOTH sides: the token
  // decrypt/refresh path is owned by the credentials module and covered
  // by the calendar OAuth cross-runtime crypto specs.
  const passthroughLoader =
    (fixture: { user: { org: { id: number }; user: { id: number } }; connectionId: number }) =>
    async () => ({
      id: fixture.connectionId,
      user_id: fixture.user.user.id,
      organization_id: fixture.user.org.id,
      provider: 'google',
      access_token: 'plain-access',
      refresh_token: 'plain-refresh',
      token_expires_at: new Date(Date.now() + 3_600_000),
      sync_enabled: true,
      sync_direction: 'both',
      selected_calendars: ['primary'],
      is_active: true,
      error_message: null,
      error_count: 0,
      token_generation: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  const externalEvents = () => [
    {
      id: 'busy-1',
      start: '2026-09-01T10:00:00.000Z',
      end: '2026-09-01T11:00:00.000Z',
      status: 'confirmed',
    },
    {
      id: 'cancelled-1',
      start: '2026-09-01T12:00:00.000Z',
      end: '2026-09-01T13:00:00.000Z',
      status: 'cancelled',
    },
    {
      id: 'itemize-1',
      start: '2026-09-01T14:00:00.000Z',
      end: '2026-09-01T15:00:00.000Z',
      extendedProperties: { private: { itemize_booking_id: '5' } },
    },
    {
      id: 'inverted-1',
      start: '2026-09-01T17:00:00.000Z',
      end: '2026-09-01T16:00:00.000Z',
    },
  ];

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for calendar sync tests');
    }
    process.env.JWT_SECRET ||= 'docker-integration-test-secret';
    process.env.DATABASE_URL ||= 'postgresql://unused/test';

    /* eslint-disable @typescript-eslint/no-var-requires */
    const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
    legacyJobs = require('../../../backend/src/jobs/calendar-sync-jobs');
    /* eslint-enable @typescript-eslint/no-var-requires */
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    pool = dbHelper.pool;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .overrideProvider(GOOGLE_CALENDAR_EVENTS_PROVIDER)
      .useValue(fakeEventsProvider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    await app.init();
    nestJobs = app.get(CalendarSyncJobsService);

    // Neutralize any claimable jobs left by other suites.
    await pool.query(
      `UPDATE calendar_sync_jobs SET status = 'succeeded'
       WHERE status IN ('queued', 'retry')`,
    );
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbHelper) {
      const TestDbHelper = require('../../../backend/src/__tests__/integration/test-db-helper');
      const cleanup = new TestDbHelper();
      await cleanup.setup();
      cleanup._userIds = dbHelper._userIds;
      cleanup._orgIds = dbHelper._orgIds;
      await cleanup.teardown();
    }
  }, 60000);

  it('pulls external busy intervals identically, filtering and replacing stale rows', async () => {
    const outcomes: Array<{
      job: JobRow;
      intervals: Array<Record<string, unknown>>;
      connection: Record<string, unknown>;
    }> = [];
    for (const runner of ['legacy', 'nest']) {
      const fixture = await seedFixture(`pull-${runner}`);
      // A stale interval inside the replacement window must be deleted.
      await pool.query(
        `INSERT INTO calendar_external_busy_intervals (
           organization_id, calendar_id, connection_id, external_calendar_id,
           external_event_id, start_time, end_time
         ) VALUES ($1, $2, $3, 'primary', 'stale-1',
                   CURRENT_TIMESTAMP + INTERVAL '2 days',
                   CURRENT_TIMESTAMP + INTERVAL '2 days 1 hour')`,
        [fixture.user.org.id, fixture.calendarId, fixture.connectionId],
      );
      const jobId = await seedJob(fixture, 'pull');
      const listEvents = jest.fn(async () => externalEvents());
      const options = {
        workerId: `parity-${runner}`,
        loadConnection: passthroughLoader(fixture),
        listEvents,
      };
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runCalendarSyncJobs(pool, options)
          : await nestJobs.run(options);
      expect(summary).toEqual({ claimed: 1, succeeded: 1, retry: 0, deadLetter: 0 });
      expect(listEvents).toHaveBeenCalledTimes(1);

      const intervals = (
        await pool.query(
          `SELECT external_event_id, start_time, end_time
           FROM calendar_external_busy_intervals
           WHERE calendar_id = $1
           ORDER BY external_event_id`,
          [fixture.calendarId],
        )
      ).rows;
      const connection = (
        await pool.query(
          `SELECT (last_sync_at IS NOT NULL) AS synced, error_message, error_count
           FROM calendar_connections WHERE id = $1`,
          [fixture.connectionId],
        )
      ).rows[0];
      outcomes.push({ job: await jobRow(jobId), intervals, connection });
    }

    const [legacy, nest] = outcomes;
    expect(nest.intervals).toEqual(legacy.intervals);
    expect(nest.intervals.map((row) => row.external_event_id)).toEqual(['busy-1']);
    expect(nest.job.status).toBe('succeeded');
    expect(legacy.job.status).toBe('succeeded');
    expect(nest.job.result).toEqual(legacy.job.result);
    expect(nest.job.result).toEqual({
      pull: { providerCalendars: 1, internalCalendars: 1, imported: 1, removed: 1 },
    });
    expect(nest.connection).toEqual(legacy.connection);
    expect(nest.connection.synced).toBe(true);
  });

  it('defers provider failures identically with redacted errors and connection error counts', async () => {
    const outcomes: Array<{ job: JobRow; connection: Record<string, unknown> }> = [];
    for (const runner of ['legacy', 'nest']) {
      const fixture = await seedFixture(`fail-${runner}`);
      const jobId = await seedJob(fixture, 'pull');
      const options = {
        workerId: `parity-${runner}`,
        loadConnection: passthroughLoader(fixture),
        listEvents: jest.fn(async () => {
          throw new Error('Bearer ya29.secret-token expired');
        }),
      };
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runCalendarSyncJobs(pool, options)
          : await nestJobs.run(options);
      expect(summary).toEqual({ claimed: 1, succeeded: 0, retry: 1, deadLetter: 0 });
      const connection = (
        await pool.query(
          'SELECT error_message, error_count FROM calendar_connections WHERE id = $1',
          [fixture.connectionId],
        )
      ).rows[0];
      outcomes.push({ job: await jobRow(jobId), connection });
    }
    const [legacy, nest] = outcomes;
    expect(nest.job.status).toBe('retry');
    expect(legacy.job.status).toBe('retry');
    expect(nest.job.last_error).toBe(legacy.job.last_error);
    expect(nest.job.last_error).not.toContain('ya29.secret-token');
    expect(nest.connection).toEqual(legacy.connection);
    expect(nest.connection.error_count).toBe(1);
  });

  it('dead-letters exhausted jobs identically', async () => {
    const outcomes: JobRow[] = [];
    for (const runner of ['legacy', 'nest']) {
      const fixture = await seedFixture(`dead-${runner}`);
      const jobId = await seedJob(fixture, 'pull', { attemptCount: 4 });
      const options = {
        workerId: `parity-${runner}`,
        loadConnection: passthroughLoader(fixture),
        listEvents: jest.fn(async () => {
          throw new Error('provider unavailable');
        }),
      };
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runCalendarSyncJobs(pool, options)
          : await nestJobs.run(options);
      expect(summary).toEqual({ claimed: 1, succeeded: 0, retry: 0, deadLetter: 1 });
      outcomes.push(await jobRow(jobId));
    }
    const [legacy, nest] = outcomes;
    expect(nest.status).toBe('dead_letter');
    expect(legacy.status).toBe('dead_letter');
    expect(nest.attempt_count).toBe(5);
    expect(legacy.attempt_count).toBe(5);
    expect(nest.completed_at).not.toBeNull();
    expect(legacy.completed_at).not.toBeNull();
  });

  it('fails disabled connections identically', async () => {
    const outcomes: JobRow[] = [];
    for (const runner of ['legacy', 'nest']) {
      const fixture = await seedFixture(`disabled-${runner}`);
      await pool.query(
        'UPDATE calendar_connections SET sync_enabled = FALSE WHERE id = $1',
        [fixture.connectionId],
      );
      const jobId = await seedJob(fixture, 'pull');
      const loader = passthroughLoader(fixture);
      const options = {
        workerId: `parity-${runner}`,
        loadConnection: async () => ({ ...(await loader()), sync_enabled: false }),
        listEvents: jest.fn(async () => []),
      };
      const summary =
        runner === 'legacy'
          ? await legacyJobs.runCalendarSyncJobs(pool, options)
          : await nestJobs.run(options);
      expect(summary.retry).toBe(1);
      outcomes.push(await jobRow(jobId));
    }
    const [legacy, nest] = outcomes;
    expect(nest.last_error).toBe(legacy.last_error);
    expect(nest.last_error).toBe('Calendar connection sync is disabled or inactive');
  });

  it('pushes bookings through the NestJS event pipeline with the sync-event ledger', async () => {
    const fixture = await seedFixture('push-nest');
    const seedBooking = async (status: string, hoursOut: number) =>
      (
        await pool.query<{ id: number }>(
          `INSERT INTO bookings (
             organization_id, calendar_id, title, start_time, end_time,
             timezone, attendee_name, attendee_email, status
           ) VALUES ($1, $2, 'Sync booking',
                     CURRENT_TIMESTAMP + ($3 || ' hours')::interval,
                     CURRENT_TIMESTAMP + (($3::int + 1) || ' hours')::interval,
                     'UTC', 'Attendee', 'attendee@example.test', $4)
           RETURNING id`,
          [fixture.user.org.id, fixture.calendarId, String(hoursOut), status],
        )
      ).rows[0].id;

    const createdBooking = await seedBooking('confirmed', 24);
    const conflictBooking = await seedBooking('confirmed', 48);
    const cancelledBooking = await seedBooking('cancelled', 72);
    await pool.query(
      `INSERT INTO calendar_sync_events
         (connection_id, booking_id, external_event_id, external_calendar_id, sync_direction)
       VALUES ($1, $2, 'existing-evt', 'primary', 'push')`,
      [fixture.connectionId, cancelledBooking],
    );

    const jobId = await seedJob(fixture, 'push');
    eventOps.length = 0;
    createConflict = true; // first create throws 409 → update fallback
    const summary = await nestJobs.run({
      workerId: 'parity-nest-push',
      loadConnection: passthroughLoader(fixture),
    });
    expect(summary).toEqual({ claimed: 1, succeeded: 1, retry: 0, deadLetter: 0 });

    const job = await jobRow(jobId);
    expect(job.status).toBe('succeeded');
    expect(job.result).toEqual({
      push: { created: 2, updated: 0, deleted: 1, failed: 0, errors: [] },
    });

    const creates = eventOps.filter((op) => op.op === 'create');
    const conflictUpdates = eventOps.filter((op) => op.op === 'update');
    const deletes = eventOps.filter((op) => op.op === 'delete');
    // The first booking by start_time hits the injected 409 and falls
    // back to a patch; the second create succeeds cleanly. Both count
    // as 'created' in the summary, exactly like the legacy path.
    expect(conflictUpdates.map((op) => op.bookingId)).toEqual([createdBooking]);
    expect(creates.map((op) => op.bookingId)).toEqual([conflictBooking]);
    expect(deletes).toEqual([
      { op: 'delete', eventId: 'existing-evt', calendarId: 'primary' },
    ]);

    const ledger = (
      await pool.query(
        `SELECT booking_id, external_calendar_id, sync_direction
         FROM calendar_sync_events WHERE connection_id = $1 ORDER BY booking_id`,
        [fixture.connectionId],
      )
    ).rows;
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => Number(row.booking_id)).sort((a, b) => a - b)).toEqual(
      [createdBooking, conflictBooking].sort((a, b) => a - b),
    );
    expect(ledger.every((row) => row.sync_direction === 'push')).toBe(true);
  });
});
