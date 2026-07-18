const TestDbHelper = require('./test-db-helper');
const { runRealtimeOutboxJobs } = require('../../jobs/realtime-outbox-jobs');
const { enqueueRealtimeEvent } = require('../../services/realtimeOutbox');
const { withTransaction } = require('../../utils/db');

describe('Realtime outbox PostgreSQL boundary', () => {
  let dbHelper;

  beforeAll(async () => {
    dbHelper = new TestDbHelper();
    await dbHelper.setup();
  }, 30000);

  afterAll(async () => dbHelper.teardown(), 30000);

  const event = (suffix, overrides = {}) => ({
    eventKey: `realtime-outbox:${suffix}:${Date.now()}:${Math.random()}`,
    aggregateType: 'list',
    aggregateId: 42,
    channel: 'user_canvas',
    recipientKey: '7',
    eventName: 'userListUpdated',
    eventType: 'LIST_UPDATE',
    payload: { id: 42, title: 'Release checklist' },
    ...overrides,
  });

  test('rolls an event back with its domain transaction', async () => {
    const pending = event('rollback');
    await expect(withTransaction(dbHelper.pool, async client => {
      await enqueueRealtimeEvent(client, pending);
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');

    const stored = await dbHelper.pool.query(
      'SELECT id FROM realtime_event_outbox WHERE event_key = $1',
      [pending.eventKey]
    );
    expect(stored.rows).toHaveLength(0);
  });

  test('deduplicates identical event keys and rejects conflicting reuse', async () => {
    const pending = event('idempotency');
    const first = await enqueueRealtimeEvent(dbHelper.pool, pending);
    const replay = await enqueueRealtimeEvent(dbHelper.pool, {
      ...pending,
      payload: { title: 'Release checklist', id: 42 },
    });

    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    await expect(enqueueRealtimeEvent(dbHelper.pool, {
      ...pending,
      eventType: 'ITEM_ADDED',
    })).rejects.toMatchObject({ code: 'REALTIME_EVENT_KEY_CONFLICT' });

    await dbHelper.pool.query(
      `UPDATE realtime_event_outbox SET status = 'sent', delivered_at = CURRENT_TIMESTAMP
       WHERE event_key = $1`,
      [pending.eventKey]
    );
  });

  test('allows only one competing socket worker to deliver a queued event', async () => {
    const pending = event('competing-workers');
    await enqueueRealtimeEvent(dbHelper.pool, pending);
    const deliver = jest.fn().mockResolvedValue(undefined);

    const results = await Promise.all([
      runRealtimeOutboxJobs(dbHelper.pool, null, {
        batchSize: 1,
        deliver,
        workerId: 'socket-host-a',
      }),
      runRealtimeOutboxJobs(dbHelper.pool, null, {
        batchSize: 1,
        deliver,
        workerId: 'socket-host-b',
      }),
    ]);

    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    const stored = await dbHelper.pool.query(
      `SELECT status, attempt_count, claimed_by, delivered_at
       FROM realtime_event_outbox WHERE event_key = $1`,
      [pending.eventKey]
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'sent',
      attempt_count: 1,
      claimed_by: null,
    });
    expect(stored.rows[0].delivered_at).toBeTruthy();
  });

  test('retries transient delivery failure and then marks the event sent', async () => {
    const pending = event('retry');
    await enqueueRealtimeEvent(dbHelper.pool, pending);
    const failed = await runRealtimeOutboxJobs(dbHelper.pool, null, {
      batchSize: 1,
      baseDelayMs: 1,
      deliver: jest.fn().mockRejectedValue(new Error('socket adapter unavailable')),
      maxAttempts: 2,
      workerId: 'socket-host-retry',
    });
    expect(failed).toMatchObject({ claimed: 1, retry: 1, sent: 0 });

    await dbHelper.pool.query(
      `UPDATE realtime_event_outbox SET next_attempt_at = CURRENT_TIMESTAMP
       WHERE event_key = $1`,
      [pending.eventKey]
    );
    const delivered = await runRealtimeOutboxJobs(dbHelper.pool, null, {
      batchSize: 1,
      deliver: jest.fn().mockResolvedValue(undefined),
      maxAttempts: 2,
      workerId: 'socket-host-retry',
    });
    expect(delivered).toMatchObject({ claimed: 1, retry: 0, sent: 1 });

    const stored = await dbHelper.pool.query(
      `SELECT status, attempt_count, last_error
       FROM realtime_event_outbox WHERE event_key = $1`,
      [pending.eventKey]
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'sent',
      attempt_count: 2,
      last_error: null,
    });
  });

  test('dead-letters an exhausted event without persisting secrets', async () => {
    const pending = event('dead-letter');
    await enqueueRealtimeEvent(dbHelper.pool, pending);
    const failed = await runRealtimeOutboxJobs(dbHelper.pool, null, {
      batchSize: 1,
      deliver: jest.fn().mockRejectedValue(
        new Error('Authorization: Bearer secret-token sk_live_123456')
      ),
      maxAttempts: 1,
      workerId: 'socket-host-dead-letter',
    });

    expect(failed).toMatchObject({ claimed: 1, deadLetter: 1, retry: 0, sent: 0 });
    const stored = await dbHelper.pool.query(
      `SELECT status, attempt_count, claimed_by, lease_expires_at, last_error
       FROM realtime_event_outbox WHERE event_key = $1`,
      [pending.eventKey]
    );
    expect(stored.rows[0]).toMatchObject({
      status: 'dead_letter',
      attempt_count: 1,
      claimed_by: null,
      lease_expires_at: null,
    });
    expect(stored.rows[0].last_error).toContain('[redacted-authorization]');
    expect(stored.rows[0].last_error).toContain('[redacted-secret]');
    expect(stored.rows[0].last_error).not.toContain('secret-token');
    expect(stored.rows[0].last_error).not.toContain('sk_live_123456');
  });

  test('recovers an expired lease once', async () => {
    const pending = event('expired-lease');
    await enqueueRealtimeEvent(dbHelper.pool, pending);
    await dbHelper.pool.query(`
      UPDATE realtime_event_outbox SET
        status = 'processing',
        attempt_count = 1,
        claimed_by = 'crashed-socket-host',
        lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE event_key = $1
    `, [pending.eventKey]);

    const deliver = jest.fn().mockResolvedValue(undefined);
    const results = await Promise.all([
      runRealtimeOutboxJobs(dbHelper.pool, null, {
        batchSize: 1,
        deliver,
        workerId: 'replacement-a',
      }),
      runRealtimeOutboxJobs(dbHelper.pool, null, {
        batchSize: 1,
        deliver,
        workerId: 'replacement-b',
      }),
    ]);

    expect(results.reduce((total, result) => total + result.sent, 0)).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    const stored = await dbHelper.pool.query(
      `SELECT status, attempt_count FROM realtime_event_outbox
       WHERE event_key = $1`,
      [pending.eventKey]
    );
    expect(stored.rows[0]).toMatchObject({ status: 'sent', attempt_count: 2 });
  });
});
