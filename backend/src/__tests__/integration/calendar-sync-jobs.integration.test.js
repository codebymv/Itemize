const TestDbHelper = require('./test-db-helper');
const { encryptCalendarToken } = require('../../utils/calendarTokenEncryption');
const {
  enqueueCalendarSyncJob,
} = require('../../services/calendarSyncJobs');
const {
  runCalendarSyncJobs,
  syncCalendarExternalBusyIntervals,
} = require('../../jobs/calendar-sync-jobs');

describe('Calendar sync job PostgreSQL contract', () => {
  let dbHelper;
  let identity;

  beforeAll(async () => {
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
    identity = await dbHelper.seedUser(
      `calendar-sync-${Date.now()}@example.com`,
      'Calendar Sync'
    );
  });

  afterAll(async () => {
    await dbHelper.teardown();
  });

  async function insertConnection(direction = 'both', selectedCalendars = ['primary']) {
    const result = await dbHelper.pool.query(`
      INSERT INTO calendar_connections (
        user_id, organization_id, provider, provider_account_id,
        provider_email, access_token, token_expires_at,
        sync_enabled, sync_direction, selected_calendars
      ) VALUES (
        $1, $2, 'google', $3, 'sync@example.com', $4,
        CURRENT_TIMESTAMP + INTERVAL '1 hour', TRUE, $5, $6::jsonb
      )
      RETURNING *
    `, [
      identity.user.id,
      identity.org.id,
      `sync-provider-${Date.now()}-${Math.random()}`,
      encryptCalendarToken('test-access-token', 'access'),
      direction,
      JSON.stringify(selectedCalendars),
    ]);
    return result.rows[0];
  }

  test('coalesces idempotent requests and leases one bidirectional execution', async () => {
    const connection = await insertConnection('both');
    const request = {
      connectionId: connection.id,
      userId: identity.user.id,
      organizationId: identity.org.id,
      idempotencyKey: 'integration-request-1',
    };
    const first = await enqueueCalendarSyncJob(dbHelper.pool, request);
    const replay = await enqueueCalendarSyncJob(dbHelper.pool, request);
    const coalesced = await enqueueCalendarSyncJob(dbHelper.pool, {
      ...request,
      idempotencyKey: 'integration-request-2',
    });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(coalesced.created).toBe(false);
    expect(String(replay.job.id)).toBe(String(first.job.id));
    expect(String(coalesced.job.id)).toBe(String(first.job.id));

    const pushSync = jest.fn().mockResolvedValue({ created: 1, failed: 0 });
    const pullSync = jest.fn().mockResolvedValue({ imported: 2, removed: 0 });
    const loadConnection = jest.fn().mockResolvedValue({
      ...connection,
      sync_enabled: true,
    });
    const summaries = await Promise.all([
      runCalendarSyncJobs(dbHelper.pool, {
        batchSize: 1,
        workerId: 'calendar-worker-a',
        loadConnection,
        pushSync,
        pullSync,
      }),
      runCalendarSyncJobs(dbHelper.pool, {
        batchSize: 1,
        workerId: 'calendar-worker-b',
        loadConnection,
        pushSync,
        pullSync,
      }),
    ]);

    expect(summaries.reduce((total, summary) => total + summary.claimed, 0)).toBe(1);
    expect(pushSync).toHaveBeenCalledTimes(1);
    expect(pullSync).toHaveBeenCalledTimes(1);
    const stored = await dbHelper.pool.query(
      'SELECT status, result, attempt_count FROM calendar_sync_jobs WHERE id = $1',
      [first.job.id]
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'succeeded',
      attempt_count: 1,
      result: {
        push: { created: 1, failed: 0 },
        pull: { imported: 2, removed: 0 },
      },
    });
    const replayAfterCompletion = await enqueueCalendarSyncJob(dbHelper.pool, {
      ...request,
      idempotencyKey: 'integration-request-2',
    });
    expect(replayAfterCompletion.created).toBe(false);
    expect(String(replayAfterCompletion.job.id)).toBe(String(first.job.id));
  });

  test('retries with redacted errors and dead-letters at the attempt limit', async () => {
    const connection = await insertConnection('push');
    const queued = await enqueueCalendarSyncJob(dbHelper.pool, {
      connectionId: connection.id,
      userId: identity.user.id,
      organizationId: identity.org.id,
      idempotencyKey: 'retry-request',
    });
    const options = {
      batchSize: 1,
      maxAttempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 1,
      loadConnection: jest.fn().mockResolvedValue({
        ...connection,
        sync_enabled: true,
      }),
      pushSync: jest.fn().mockRejectedValue(
        new Error('provider rejected Bearer ya29.super-secret-token')
      ),
      pullSync: jest.fn(),
    };

    const first = await runCalendarSyncJobs(dbHelper.pool, {
      ...options,
      workerId: 'retry-worker-one',
    });
    expect(first).toMatchObject({ claimed: 1, retry: 1, deadLetter: 0 });
    await dbHelper.pool.query(
      'UPDATE calendar_sync_jobs SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1',
      [queued.job.id]
    );
    const second = await runCalendarSyncJobs(dbHelper.pool, {
      ...options,
      workerId: 'retry-worker-two',
    });
    expect(second).toMatchObject({ claimed: 1, retry: 0, deadLetter: 1 });

    const stored = await dbHelper.pool.query(
      'SELECT status, attempt_count, last_error, claimed_by, lease_expires_at FROM calendar_sync_jobs WHERE id = $1',
      [queued.job.id]
    );
    expect(stored.rows[0].status).toBe('dead_letter');
    expect(stored.rows[0].attempt_count).toBe(2);
    expect(stored.rows[0].last_error).toContain('[redacted]');
    expect(stored.rows[0].last_error).not.toContain('super-secret-token');
    expect(stored.rows[0].claimed_by).toBeNull();
    expect(stored.rows[0].lease_expires_at).toBeNull();
  });

  test('normalizes external events and removes stale busy intervals', async () => {
    const connection = await insertConnection('pull');
    const calendar = await dbHelper.pool.query(`
      INSERT INTO calendars (
        organization_id, name, slug, timezone, max_future_days,
        assigned_to, created_by, is_active
      ) VALUES ($1, 'Synced calendar', $2, 'UTC', 30, $3, $3, TRUE)
      RETURNING id
    `, [
      identity.org.id,
      `synced-calendar-${Date.now()}`,
      identity.user.id,
    ]);
    const now = new Date('2027-03-01T00:00:00.000Z');
    const listEvents = jest.fn().mockResolvedValue([
      {
        id: 'external-busy',
        start: '2027-03-02T10:00:00.000Z',
        end: '2027-03-02T11:00:00.000Z',
        status: 'confirmed',
      },
      {
        id: 'itemize-owned',
        start: '2027-03-02T12:00:00.000Z',
        end: '2027-03-02T13:00:00.000Z',
        extendedProperties: { private: { itemize_booking_id: '1' } },
      },
      {
        id: 'invalid-range',
        start: '2027-03-02T14:00:00.000Z',
        end: '2027-03-02T13:00:00.000Z',
      },
    ]);

    const imported = await syncCalendarExternalBusyIntervals(
      dbHelper.pool,
      connection,
      { now, listEvents }
    );
    expect(imported).toMatchObject({
      providerCalendars: 1,
      internalCalendars: 1,
      imported: 1,
      removed: 0,
    });
    const busy = await dbHelper.pool.query(`
      SELECT external_event_id, start_time, end_time
      FROM calendar_external_busy_intervals
      WHERE connection_id = $1 AND calendar_id = $2
    `, [connection.id, calendar.rows[0].id]);
    expect(busy.rows).toHaveLength(1);
    expect(busy.rows[0].external_event_id).toBe('external-busy');

    listEvents.mockResolvedValue([]);
    const replaced = await syncCalendarExternalBusyIntervals(
      dbHelper.pool,
      connection,
      { now, listEvents }
    );
    expect(replaced.removed).toBe(1);
    const remaining = await dbHelper.pool.query(
      'SELECT COUNT(*)::int AS count FROM calendar_external_busy_intervals WHERE connection_id = $1',
      [connection.id]
    );
    expect(remaining.rows[0].count).toBe(0);

    listEvents.mockResolvedValue([{
      id: 'stale-worker-event',
      start: '2027-03-03T10:00:00.000Z',
      end: '2027-03-03T11:00:00.000Z',
    }]);
    await expect(syncCalendarExternalBusyIntervals(
      dbHelper.pool,
      connection,
      {
        now,
        listEvents,
        claimFence: {
          id: 999999,
          attemptCount: 1,
          claimedBy: 'expired-worker',
        },
      }
    )).rejects.toMatchObject({ code: 'CALENDAR_SYNC_STALE_CLAIM' });
    const afterStaleWorker = await dbHelper.pool.query(
      'SELECT COUNT(*)::int AS count FROM calendar_external_busy_intervals WHERE connection_id = $1',
      [connection.id]
    );
    expect(afterStaleWorker.rows[0].count).toBe(0);
  });
});
