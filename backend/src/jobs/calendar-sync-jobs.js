const crypto = require('crypto');
const { bookingColumns } = require('../routes/calendar-columns');
const { loadGoogleCalendarConnection } = require('../services/calendarConnectionCredentials');
const googleCalendarService = require('../services/googleCalendarService');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 3_600_000;
const MAX_PULL_HORIZON_DAYS = 366;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function calendarSyncBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactCalendarSyncError(error) {
  return String(error?.message || error || 'Calendar sync failed')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bBasic\s+\S+/gi, 'Basic [redacted]')
    .replace(/\b(?:access|refresh)[_-]?token\b\s*[:=]\s*["']?[^"',\s}]+/gi, '[redacted-token]')
    .replace(/\bya29\.[A-Za-z0-9._-]+\b/g, '[redacted-token]')
    .slice(0, 500);
}

function calendarSyncWorkerOptions(options = {}) {
  const normalized = {
    batchSize: boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(options.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    baseDelayMs: boundedInteger(options.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    maxDelayMs: boundedInteger(options.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    workerId: options.workerId || crypto.randomUUID(),
    now: options.now instanceof Date ? options.now : new Date(),
    loadConnection: options.loadConnection || loadGoogleCalendarConnection,
    pushSync: options.pushSync || syncCalendarConnectionPush,
    pullSync: options.pullSync || syncCalendarExternalBusyIntervals,
    listEvents: options.listEvents || googleCalendarService.listEvents,
  };
  if (normalized.maxDelayMs < normalized.baseDelayMs) {
    normalized.maxDelayMs = normalized.baseDelayMs;
  }
  return normalized;
}

async function claimCalendarSyncJob(pool, options) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM calendar_sync_jobs
        WHERE (
            status IN ('queued', 'retry')
            AND next_attempt_at <= CURRENT_TIMESTAMP
          ) OR (
            status = 'processing'
            AND lease_expires_at <= CURRENT_TIMESTAMP
          )
        ORDER BY next_attempt_at, created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE calendar_sync_jobs job SET
        status = 'processing',
        attempt_count = attempt_count + 1,
        lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        claimed_by = $2,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `, [options.leaseSeconds, options.workerId]);
    return result.rows[0] || null;
  });
}

async function syncCalendarConnectionPush(pool, connection) {
  const aggregate = { created: 0, updated: 0, deleted: 0, failed: 0, errors: [] };
  for (let page = 0; page < 10; page += 1) {
    const candidates = await pool.query(`
      SELECT ${bookingColumns('booking')}
      FROM bookings booking
      LEFT JOIN calendar_sync_events sync_event
        ON sync_event.connection_id = $1
       AND sync_event.booking_id = booking.id
      WHERE booking.organization_id = $2
        AND (
          (
            booking.status IN ('confirmed', 'pending')
            AND booking.start_time >= CURRENT_TIMESTAMP
            AND (
              sync_event.id IS NULL
              OR sync_event.last_synced_at < booking.updated_at
            )
          )
          OR (
            booking.status = 'cancelled'
            AND sync_event.id IS NOT NULL
          )
        )
      ORDER BY booking.start_time, booking.id
      LIMIT 100
    `, [connection.id, connection.organization_id]);
    if (candidates.rows.length === 0) return aggregate;

    const result = await googleCalendarService.syncBookingsToGoogle(
      pool,
      connection,
      candidates.rows
    );
    for (const key of ['created', 'updated', 'deleted', 'failed']) {
      aggregate[key] += Number(result[key]) || 0;
    }
    aggregate.errors.push(...(result.errors || []));
    if (result.failed > 0) {
      const detail = result.errors?.[0]?.error;
      throw new Error(
        `${result.failed} calendar event delivery operation(s) failed${detail ? `: ${detail}` : ''}`
      );
    }
    if (candidates.rows.length < 100) return aggregate;
  }
  throw new Error('Calendar push batch limit exceeded');
}

function normalizeExternalEvent(event) {
  if (!event?.id || event.status === 'cancelled') return null;
  if (event.extendedProperties?.private?.itemize_booking_id) return null;
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (!Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime())
    || end <= start) {
    return null;
  }
  return {
    id: String(event.id).slice(0, 255),
    start,
    end,
  };
}

async function replaceBusyWindow(client, scope) {
  for (const event of scope.events) {
    await client.query(`
      INSERT INTO calendar_external_busy_intervals (
        organization_id, calendar_id, connection_id, external_calendar_id,
        external_event_id, start_time, end_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (
        calendar_id, connection_id, external_calendar_id, external_event_id
      ) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        updated_at = CURRENT_TIMESTAMP
    `, [
      scope.organizationId,
      scope.calendarId,
      scope.connectionId,
      scope.externalCalendarId,
      event.id,
      event.start,
      event.end,
    ]);
  }

  const eventIds = scope.events.map(event => event.id);
  const stale = eventIds.length > 0
    ? await client.query(`
        DELETE FROM calendar_external_busy_intervals
        WHERE calendar_id = $1
          AND connection_id = $2
          AND external_calendar_id = $3
          AND start_time < $4
          AND end_time > $5
          AND NOT (external_event_id = ANY($6::text[]))
      `, [
        scope.calendarId,
        scope.connectionId,
        scope.externalCalendarId,
        scope.timeMax,
        scope.timeMin,
        eventIds,
      ])
    : await client.query(`
        DELETE FROM calendar_external_busy_intervals
        WHERE calendar_id = $1
          AND connection_id = $2
          AND external_calendar_id = $3
          AND start_time < $4
          AND end_time > $5
      `, [
        scope.calendarId,
        scope.connectionId,
        scope.externalCalendarId,
        scope.timeMax,
        scope.timeMin,
      ]);
  return stale.rowCount;
}

async function syncCalendarExternalBusyIntervals(pool, connection, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const listEvents = options.listEvents || googleCalendarService.listEvents;
  const calendarsResult = await pool.query(`
    SELECT id, max_future_days
    FROM calendars
    WHERE organization_id = $1
      AND assigned_to = $2
      AND is_active = TRUE
    ORDER BY id
  `, [connection.organization_id, connection.user_id]);
  if (calendarsResult.rows.length === 0) {
    return { providerCalendars: 0, internalCalendars: 0, imported: 0, removed: 0 };
  }

  const horizonDays = Math.min(
    MAX_PULL_HORIZON_DAYS,
    Math.max(1, ...calendarsResult.rows.map(row => Number(row.max_future_days) || 1))
  );
  const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + (horizonDays + 1) * 24 * 60 * 60 * 1000);
  const providerCalendarIds = Array.isArray(connection.selected_calendars)
    && connection.selected_calendars.length > 0
    ? [...new Set(connection.selected_calendars.map(String))]
    : ['primary'];
  let imported = 0;
  let removed = 0;

  for (const externalCalendarId of providerCalendarIds) {
    const rawEvents = await listEvents(connection, externalCalendarId, timeMin, timeMax);
    const events = (Array.isArray(rawEvents) ? rawEvents : [])
      .map(normalizeExternalEvent)
      .filter(Boolean);
    await withTransaction(pool, async client => {
      if (options.claimFence) {
        const fence = await client.query(`
          SELECT 1
          FROM calendar_sync_jobs
          WHERE id = $1
            AND status = 'processing'
            AND attempt_count = $2
            AND claimed_by = $3
            AND lease_expires_at > CURRENT_TIMESTAMP
          FOR UPDATE
        `, [
          options.claimFence.id,
          options.claimFence.attemptCount,
          options.claimFence.claimedBy,
        ]);
        if (fence.rows.length === 0) {
          const error = new Error('Calendar sync job lease is no longer current');
          error.code = 'CALENDAR_SYNC_STALE_CLAIM';
          throw error;
        }
      }
      for (const calendar of calendarsResult.rows) {
        removed += await replaceBusyWindow(client, {
          organizationId: connection.organization_id,
          calendarId: calendar.id,
          connectionId: connection.id,
          externalCalendarId,
          events,
          timeMin,
          timeMax,
        });
        imported += events.length;
      }
    });
  }

  return {
    providerCalendars: providerCalendarIds.length,
    internalCalendars: calendarsResult.rows.length,
    imported,
    removed,
  };
}

async function markCalendarSyncSuccess(pool, claim, result, options) {
  const updated = await pool.query(`
    UPDATE calendar_sync_jobs SET
      status = 'succeeded',
      result = $5::jsonb,
      last_error = NULL,
      lease_expires_at = NULL,
      claimed_by = NULL,
      completed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
      AND claimed_by = $3
      AND organization_id = $4
    RETURNING id
  `, [
    claim.id,
    claim.attempt_count,
    options.workerId,
    claim.organization_id,
    JSON.stringify(result),
  ]);
  if (updated.rowCount === 1) {
    await pool.query(`
      UPDATE calendar_connections SET
        last_sync_at = CURRENT_TIMESTAMP,
        error_message = NULL,
        error_count = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND organization_id = $2
    `, [claim.connection_id, claim.organization_id]);
  }
  return updated.rowCount === 1;
}

async function markCalendarSyncFailure(pool, claim, error, options) {
  const deadLetter = Number(claim.attempt_count) >= options.maxAttempts;
  const delayMs = calendarSyncBackoffMs(
    Number(claim.attempt_count),
    options.baseDelayMs,
    options.maxDelayMs
  );
  const safeError = redactCalendarSyncError(error);
  const updated = await pool.query(`
    UPDATE calendar_sync_jobs SET
      status = $5::varchar,
      next_attempt_at = CASE
        WHEN $5::varchar = 'dead_letter' THEN next_attempt_at
        ELSE CURRENT_TIMESTAMP + ($6::bigint * INTERVAL '1 millisecond')
      END,
      lease_expires_at = NULL,
      claimed_by = NULL,
      last_error = $7,
      completed_at = CASE
        WHEN $5::varchar = 'dead_letter' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
      AND claimed_by = $3
      AND organization_id = $4
    RETURNING id
  `, [
    claim.id,
    claim.attempt_count,
    options.workerId,
    claim.organization_id,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    safeError,
  ]);
  if (updated.rowCount === 1) {
    await pool.query(`
      UPDATE calendar_connections SET
        error_message = $3,
        error_count = error_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND organization_id = $2
    `, [claim.connection_id, claim.organization_id, safeError]);
  }
  return deadLetter ? 'dead_letter' : 'retry';
}

async function processCalendarSyncClaim(pool, claim, options) {
  const owner = await pool.query(`
    SELECT user_id
    FROM calendar_connections
    WHERE id = $1 AND organization_id = $2
  `, [claim.connection_id, claim.organization_id]);
  if (owner.rows.length === 0) {
    throw new Error('Calendar connection no longer exists');
  }
  const connection = await options.loadConnection(pool, {
    connectionId: claim.connection_id,
    userId: owner.rows[0].user_id,
    organizationId: claim.organization_id,
    requireActive: true,
  });
  if (!connection || !connection.sync_enabled) {
    throw new Error('Calendar connection sync is disabled or inactive');
  }
  connection.sync_direction = claim.direction;
  connection.selected_calendars = claim.selected_calendars;

  const result = {};
  if (claim.direction === 'push' || claim.direction === 'both') {
    result.push = await options.pushSync(pool, connection);
  }
  if (claim.direction === 'pull' || claim.direction === 'both') {
    result.pull = await options.pullSync(pool, connection, {
      listEvents: options.listEvents,
      now: options.now,
      claimFence: {
        id: claim.id,
        attemptCount: claim.attempt_count,
        claimedBy: options.workerId,
      },
    });
  }
  return result;
}

async function runCalendarSyncJobs(pool, suppliedOptions = {}) {
  const options = calendarSyncWorkerOptions(suppliedOptions);
  const summary = {
    claimed: 0,
    succeeded: 0,
    retry: 0,
    deadLetter: 0,
  };
  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimCalendarSyncJob(pool, options);
    if (!claim) break;
    summary.claimed += 1;
    try {
      const result = await processCalendarSyncClaim(pool, claim, options);
      if (await markCalendarSyncSuccess(pool, claim, result, options)) {
        summary.succeeded += 1;
      }
    } catch (error) {
      const outcome = await markCalendarSyncFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else summary.retry += 1;
      logger.warn('[Calendar sync jobs] Sync deferred', {
        jobId: Number(claim.id),
        outcome,
        error: redactCalendarSyncError(error),
      });
    }
  }
  return summary;
}

module.exports = {
  calendarSyncBackoffMs,
  claimCalendarSyncJob,
  normalizeExternalEvent,
  redactCalendarSyncError,
  runCalendarSyncJobs,
  syncCalendarConnectionPush,
  syncCalendarExternalBusyIntervals,
};
