const crypto = require('crypto');
const { withTransaction } = require('../utils/db');

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SYNC_DIRECTIONS = new Set(['push', 'pull', 'both']);

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === '') {
    return crypto.randomUUID();
  }
  const normalized = String(value).trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    const error = new Error('Idempotency-Key must be 1-128 safe ASCII characters');
    error.code = 'INVALID_IDEMPOTENCY_KEY';
    throw error;
  }
  return normalized;
}

function normalizeSelectedCalendars(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter(calendarId => typeof calendarId === 'string')
      .map(calendarId => calendarId.trim())
      .filter(calendarId => calendarId.length > 0 && calendarId.length <= 255)
  )].slice(0, 100);
}

async function enqueueCalendarSyncJob(pool, request) {
  const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey);
  return withTransaction(pool, async client => {
    const connectionResult = await client.query(`
      SELECT id, organization_id, user_id, sync_enabled, sync_direction,
             selected_calendars, is_active
      FROM calendar_connections
      WHERE id = $1
        AND user_id = $2
        AND organization_id = $3
        AND provider = 'google'
      FOR UPDATE
    `, [request.connectionId, request.userId, request.organizationId]);
    if (connectionResult.rows.length === 0) return null;

    const connection = connectionResult.rows[0];
    if (!connection.is_active || !connection.sync_enabled) {
      const error = new Error('Calendar connection sync is disabled');
      error.code = 'CALENDAR_SYNC_DISABLED';
      throw error;
    }
    if (!SYNC_DIRECTIONS.has(connection.sync_direction)) {
      const error = new Error('Calendar connection has an unsupported sync direction');
      error.code = 'CALENDAR_SYNC_DIRECTION_INVALID';
      throw error;
    }

    const prior = await client.query(`
      SELECT *
      FROM calendar_sync_jobs
      WHERE connection_id = $1
        AND (
          idempotency_key = $2::varchar
          OR idempotency_keys ? $2::text
        )
      ORDER BY created_at, id
      LIMIT 1
    `, [connection.id, idempotencyKey]);
    if (prior.rows.length === 1) {
      return { job: prior.rows[0], created: false };
    }

    const active = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM calendar_sync_jobs
        WHERE connection_id = $1
          AND status IN ('queued', 'processing', 'retry')
        ORDER BY created_at, id
        LIMIT 1
      )
      UPDATE calendar_sync_jobs job SET
        idempotency_keys = CASE
          WHEN job.idempotency_keys ? $2::text THEN job.idempotency_keys
          ELSE job.idempotency_keys || to_jsonb($2::text)
        END,
        updated_at = CURRENT_TIMESTAMP
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.*
    `, [connection.id, idempotencyKey]);
    if (active.rows.length === 1) {
      return { job: active.rows[0], created: false };
    }

    const selectedCalendars = normalizeSelectedCalendars(connection.selected_calendars);
    const inserted = await client.query(`
      INSERT INTO calendar_sync_jobs (
        organization_id, connection_id, requested_by_user_id,
        idempotency_key, idempotency_keys, direction, selected_calendars
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
      RETURNING *
    `, [
      connection.organization_id,
      connection.id,
      request.userId,
      idempotencyKey,
      JSON.stringify([idempotencyKey]),
      connection.sync_direction,
      JSON.stringify(selectedCalendars),
    ]);
    return { job: inserted.rows[0], created: true };
  });
}

function publicCalendarSyncJob(job) {
  return {
    id: Number(job.id),
    connection_id: Number(job.connection_id),
    direction: job.direction,
    status: job.status,
    attempt_count: Number(job.attempt_count),
    next_attempt_at: job.next_attempt_at,
    result: job.result || null,
    last_error: job.last_error || null,
    completed_at: job.completed_at || null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

module.exports = {
  enqueueCalendarSyncJob,
  normalizeIdempotencyKey,
  normalizeSelectedCalendars,
  publicCalendarSyncJob,
};
