/**
 * Faithful port of the legacy calendar sync worker
 * (backend/src/jobs/calendar-sync-jobs.js): SKIP LOCKED claims with a
 * worker-id + attempt-count fence, push sync (bookings to Google with
 * deterministic ids, 409 create fallback, 404-tolerant delete, and the
 * calendar_sync_events ledger), pull sync (busy-interval replacement
 * windows with the stale-claim fence), bounded exponential backoff,
 * dead letters, and token/URL redaction. The booking and sync-event
 * column projections mirror backend/src/routes/calendar-columns.js.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  GOOGLE_CALENDAR_OAUTH_PROVIDER,
  GoogleCalendarOAuthProvider,
} from '../calendar-oauth/google-calendar-oauth.provider';
import {
  loadGoogleCalendarConnection,
  LoadedCalendarConnection,
} from './calendar-connection-credentials';
import {
  ExternalCalendarEvent,
  GOOGLE_CALENDAR_EVENTS_PROVIDER,
  GoogleCalendarEventsProvider,
  deterministicGoogleEventId,
  safeProviderError,
} from './google-calendar-events.provider';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 3_600_000;
const MAX_PULL_HORIZON_DAYS = 366;

const BOOKING_COLUMNS = [
  'id',
  'organization_id',
  'calendar_id',
  'contact_id',
  'title',
  'start_time',
  'end_time',
  'timezone',
  'attendee_name',
  'attendee_email',
  'attendee_phone',
  'assigned_to',
  'status',
  'cancelled_at',
  'cancellation_reason',
  'notes',
  'internal_notes',
  'reminder_sent_at',
  'custom_fields',
  'source',
  'created_at',
  'updated_at',
];

const CALENDAR_SYNC_EVENT_COLUMNS = [
  'id',
  'connection_id',
  'booking_id',
  'external_event_id',
  'external_calendar_id',
  'sync_direction',
  'last_synced_at',
  'external_updated_at',
  'event_hash',
  'created_at',
  'updated_at',
];

const bookingColumns = (alias: string): string =>
  BOOKING_COLUMNS.map((column) => `${alias}.${column}`).join(', ');
const calendarSyncEventColumns = (): string =>
  CALENDAR_SYNC_EVENT_COLUMNS.join(', ');

export function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

export function calendarSyncBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export function redactCalendarSyncError(error: unknown): string {
  return String(
    (error as { message?: unknown })?.message || error || 'Calendar sync failed',
  )
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bBasic\s+\S+/gi, 'Basic [redacted]')
    .replace(
      /\b(?:access|refresh)[_-]?token\b\s*[:=]\s*["']?[^"',\s}]+/gi,
      '[redacted-token]',
    )
    .replace(/\bya29\.[A-Za-z0-9._-]+\b/g, '[redacted-token]')
    .slice(0, 500);
}

export type NormalizedExternalEvent = {
  id: string;
  start: Date;
  end: Date;
};

export function normalizeExternalEvent(
  event: ExternalCalendarEvent | null | undefined,
): NormalizedExternalEvent | null {
  if (!event?.id || event.status === 'cancelled') return null;
  if (event.extendedProperties?.private?.itemize_booking_id) return null;
  const start = new Date(event.start as string);
  const end = new Date(event.end as string);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return null;
  }
  return {
    id: String(event.id).slice(0, 255),
    start,
    end,
  };
}

export type CalendarSyncClaim = {
  id: number | string;
  organization_id: number;
  connection_id: number;
  direction: string;
  selected_calendars: string[] | null;
  attempt_count: number;
};

export type PushSummary = {
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  errors: Array<{ bookingId: number; error: string }>;
};

export type PullSummary = {
  providerCalendars: number;
  internalCalendars: number;
  imported: number;
  removed: number;
};

export type CalendarSyncRun = {
  claimed: number;
  succeeded: number;
  retry: number;
  deadLetter: number;
};

export type CalendarSyncWorkerOptions = {
  batchSize?: unknown;
  leaseSeconds?: unknown;
  maxAttempts?: unknown;
  baseDelayMs?: unknown;
  maxDelayMs?: unknown;
  workerId?: string;
  now?: Date;
  loadConnection?: (
    pool: Pool,
    scope: {
      connectionId: number;
      userId: number;
      organizationId: number;
      requireActive: boolean;
    },
  ) => Promise<LoadedCalendarConnection | null>;
  pushSync?: (
    pool: Pool,
    connection: LoadedCalendarConnection,
  ) => Promise<PushSummary>;
  pullSync?: (
    pool: Pool,
    connection: LoadedCalendarConnection,
    options: {
      listEvents?: GoogleCalendarEventsProvider['listEvents'];
      now?: Date;
      claimFence?: {
        id: number | string;
        attemptCount: number;
        claimedBy: string;
      };
    },
  ) => Promise<PullSummary>;
  listEvents?: GoogleCalendarEventsProvider['listEvents'];
};

type ResolvedOptions = Required<
  Pick<
    CalendarSyncWorkerOptions,
    'workerId' | 'now' | 'loadConnection' | 'pushSync' | 'pullSync' | 'listEvents'
  >
> & {
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

@Injectable()
export class CalendarSyncJobsService {
  private readonly logger = new Logger(CalendarSyncJobsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(GOOGLE_CALENDAR_EVENTS_PROVIDER)
    private readonly events: GoogleCalendarEventsProvider,
    @Inject(GOOGLE_CALENDAR_OAUTH_PROVIDER)
    private readonly oauth: GoogleCalendarOAuthProvider,
  ) {}

  async run(
    suppliedOptions: CalendarSyncWorkerOptions = {},
  ): Promise<CalendarSyncRun> {
    const options = this.resolveOptions(suppliedOptions);
    const summary: CalendarSyncRun = {
      claimed: 0,
      succeeded: 0,
      retry: 0,
      deadLetter: 0,
    };
    for (let index = 0; index < options.batchSize; index += 1) {
      const claim = await this.claim(options);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const result = await this.processClaim(claim, options);
        if (await this.markSuccess(claim, result, options)) {
          summary.succeeded += 1;
        }
      } catch (error) {
        const outcome = await this.markFailure(claim, error, options);
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.retry += 1;
        this.logger.warn(
          `Calendar sync deferred jobId=${Number(claim.id)} outcome=${outcome} error=${redactCalendarSyncError(error)}`,
        );
      }
    }
    return summary;
  }

  private resolveOptions(options: CalendarSyncWorkerOptions): ResolvedOptions {
    const resolved: ResolvedOptions = {
      batchSize: boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
      leaseSeconds: boundedInteger(
        options.leaseSeconds,
        DEFAULT_LEASE_SECONDS,
        1,
        3600,
      ),
      maxAttempts: boundedInteger(
        options.maxAttempts,
        DEFAULT_MAX_ATTEMPTS,
        1,
        20,
      ),
      baseDelayMs: boundedInteger(
        options.baseDelayMs,
        DEFAULT_BASE_DELAY_MS,
        1,
        DEFAULT_MAX_DELAY_MS,
      ),
      maxDelayMs: boundedInteger(
        options.maxDelayMs,
        DEFAULT_MAX_DELAY_MS,
        1,
        DEFAULT_MAX_DELAY_MS,
      ),
      workerId: options.workerId || crypto.randomUUID(),
      now: options.now instanceof Date ? options.now : new Date(),
      loadConnection:
        options.loadConnection ||
        ((pool, scope) =>
          loadGoogleCalendarConnection(pool, scope, {
            refreshAccessToken: (refreshToken) =>
              this.oauth.refreshAccessToken(refreshToken),
            needsTokenRefresh: (tokenExpiresAt) =>
              this.oauth.needsTokenRefresh(tokenExpiresAt),
          })),
      pushSync:
        options.pushSync ||
        ((pool, connection) => this.syncConnectionPush(pool, connection)),
      pullSync:
        options.pullSync ||
        ((pool, connection, pullOptions) =>
          this.syncExternalBusyIntervals(pool, connection, pullOptions)),
      listEvents:
        options.listEvents ||
        ((connection, calendarId, timeMin, timeMax) =>
          this.events.listEvents(connection, calendarId, timeMin, timeMax)),
    };
    if (resolved.maxDelayMs < resolved.baseDelayMs) {
      resolved.maxDelayMs = resolved.baseDelayMs;
    }
    return resolved;
  }

  private async claim(
    options: ResolvedOptions,
  ): Promise<CalendarSyncClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<CalendarSyncClaim>(
        `WITH candidate AS (
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
         RETURNING job.*`,
        [options.leaseSeconds, options.workerId],
      );
      return result.rows[0] || null;
    });
  }

  async syncConnectionPush(
    pool: Pool,
    connection: LoadedCalendarConnection,
  ): Promise<PushSummary> {
    const aggregate: PushSummary = {
      created: 0,
      updated: 0,
      deleted: 0,
      failed: 0,
      errors: [],
    };
    for (let page = 0; page < 10; page += 1) {
      const candidates = await pool.query(
        `SELECT ${bookingColumns('booking')}
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
         LIMIT 100`,
        [connection.id, connection.organization_id],
      );
      if (candidates.rows.length === 0) return aggregate;

      const result = await this.syncBookingsToGoogle(
        pool,
        connection,
        candidates.rows,
      );
      for (const key of ['created', 'updated', 'deleted', 'failed'] as const) {
        aggregate[key] += Number(result[key]) || 0;
      }
      aggregate.errors.push(...(result.errors || []));
      if (result.failed > 0) {
        const detail = result.errors?.[0]?.error;
        throw new Error(
          `${result.failed} calendar event delivery operation(s) failed${detail ? `: ${detail}` : ''}`,
        );
      }
      if (candidates.rows.length < 100) return aggregate;
    }
    throw new Error('Calendar push batch limit exceeded');
  }

  /**
   * Faithful port of googleCalendarService.syncBookingsToGoogle:
   * deterministic event ids, 409 create-conflict fallback to patch,
   * 404-tolerant cancellation delete, and the calendar_sync_events
   * upsert ledger.
   */
  async syncBookingsToGoogle(
    pool: Pool,
    connection: LoadedCalendarConnection,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookings: any[],
  ): Promise<PushSummary> {
    const results: PushSummary = {
      created: 0,
      updated: 0,
      deleted: 0,
      failed: 0,
      errors: [],
    };

    for (const booking of bookings) {
      try {
        const existingSync = await pool.query(
          `SELECT ${calendarSyncEventColumns()} FROM calendar_sync_events WHERE connection_id = $1 AND booking_id = $2`,
          [connection.id, booking.id],
        );

        if (existingSync.rows.length > 0) {
          const syncEvent = existingSync.rows[0];
          if (booking.status === 'cancelled') {
            try {
              await this.events.deleteEvent(
                connection,
                syncEvent.external_event_id,
                syncEvent.external_calendar_id,
              );
            } catch (error) {
              const status =
                (error as { response?: { status?: number }; code?: number })
                  ?.response?.status ||
                (error as { code?: number })?.code;
              if (Number(status) !== 404) throw error;
            }
            await pool.query(
              'DELETE FROM calendar_sync_events WHERE id = $1 AND connection_id = $2',
              [syncEvent.id, connection.id],
            );
            results.deleted++;
            continue;
          }

          await this.events.updateEvent(
            connection,
            syncEvent.external_event_id,
            booking,
            syncEvent.external_calendar_id,
          );
          await pool.query(
            'UPDATE calendar_sync_events SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1',
            [syncEvent.id],
          );
          results.updated++;
        } else {
          if (booking.status === 'cancelled') continue;
          const calendarId = connection.selected_calendars?.[0] || 'primary';
          const eventId = deterministicGoogleEventId(connection.id, booking.id);
          try {
            await this.events.createEventFromBooking(
              connection,
              booking,
              calendarId,
            );
          } catch (error) {
            const status =
              (error as { response?: { status?: number }; code?: number })
                ?.response?.status || (error as { code?: number })?.code;
            if (Number(status) !== 409) throw error;
            await this.events.updateEvent(
              connection,
              eventId,
              booking,
              calendarId,
            );
          }

          await pool.query(
            `INSERT INTO calendar_sync_events
             (connection_id, booking_id, external_event_id, external_calendar_id, sync_direction)
             VALUES ($1, $2, $3, $4, 'push')
             ON CONFLICT (connection_id, booking_id)
             WHERE booking_id IS NOT NULL
             DO UPDATE SET
                 external_event_id = EXCLUDED.external_event_id,
                 external_calendar_id = EXCLUDED.external_calendar_id,
                 sync_direction = 'push',
                 last_synced_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP`,
            [connection.id, booking.id, eventId, calendarId],
          );

          results.created++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          bookingId: booking.id,
          error: safeProviderError(error),
        });
      }
    }

    return results;
  }

  async syncExternalBusyIntervals(
    pool: Pool,
    connection: LoadedCalendarConnection,
    options: {
      listEvents?: GoogleCalendarEventsProvider['listEvents'];
      now?: Date;
      claimFence?: {
        id: number | string;
        attemptCount: number;
        claimedBy: string;
      };
    } = {},
  ): Promise<PullSummary> {
    const now = options.now instanceof Date ? options.now : new Date();
    const listEvents =
      options.listEvents ||
      ((conn, calendarId, timeMin, timeMax) =>
        this.events.listEvents(conn, calendarId, timeMin, timeMax));
    const calendarsResult = await pool.query<{
      id: number;
      max_future_days: number | string | null;
    }>(
      `SELECT id, max_future_days
       FROM calendars
       WHERE organization_id = $1
         AND assigned_to = $2
         AND is_active = TRUE
       ORDER BY id`,
      [connection.organization_id, connection.user_id],
    );
    if (calendarsResult.rows.length === 0) {
      return {
        providerCalendars: 0,
        internalCalendars: 0,
        imported: 0,
        removed: 0,
      };
    }

    const horizonDays = Math.min(
      MAX_PULL_HORIZON_DAYS,
      Math.max(
        1,
        ...calendarsResult.rows.map((row) => Number(row.max_future_days) || 1),
      ),
    );
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const timeMax = new Date(
      now.getTime() + (horizonDays + 1) * 24 * 60 * 60 * 1000,
    );
    const providerCalendarIds =
      Array.isArray(connection.selected_calendars) &&
      connection.selected_calendars.length > 0
        ? [...new Set(connection.selected_calendars.map(String))]
        : ['primary'];
    let imported = 0;
    let removed = 0;

    for (const externalCalendarId of providerCalendarIds) {
      const rawEvents = await listEvents(
        connection,
        externalCalendarId,
        timeMin,
        timeMax,
      );
      const events = (Array.isArray(rawEvents) ? rawEvents : [])
        .map(normalizeExternalEvent)
        .filter((event): event is NormalizedExternalEvent => Boolean(event));
      await this.transaction(async (client) => {
        if (options.claimFence) {
          const fence = await client.query(
            `SELECT 1
             FROM calendar_sync_jobs
             WHERE id = $1
               AND status = 'processing'
               AND attempt_count = $2
               AND claimed_by = $3
               AND lease_expires_at > CURRENT_TIMESTAMP
             FOR UPDATE`,
            [
              options.claimFence.id,
              options.claimFence.attemptCount,
              options.claimFence.claimedBy,
            ],
          );
          if (fence.rows.length === 0) {
            const error = new Error(
              'Calendar sync job lease is no longer current',
            );
            (error as Error & { code?: string }).code =
              'CALENDAR_SYNC_STALE_CLAIM';
            throw error;
          }
        }
        for (const calendar of calendarsResult.rows) {
          removed += await this.replaceBusyWindow(client, {
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

  private async replaceBusyWindow(
    client: PoolClient,
    scope: {
      organizationId: number;
      calendarId: number;
      connectionId: number;
      externalCalendarId: string;
      events: NormalizedExternalEvent[];
      timeMin: Date;
      timeMax: Date;
    },
  ): Promise<number> {
    for (const event of scope.events) {
      await client.query(
        `INSERT INTO calendar_external_busy_intervals (
           organization_id, calendar_id, connection_id, external_calendar_id,
           external_event_id, start_time, end_time
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (
           calendar_id, connection_id, external_calendar_id, external_event_id
         ) DO UPDATE SET
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           updated_at = CURRENT_TIMESTAMP`,
        [
          scope.organizationId,
          scope.calendarId,
          scope.connectionId,
          scope.externalCalendarId,
          event.id,
          event.start,
          event.end,
        ],
      );
    }

    const eventIds = scope.events.map((event) => event.id);
    const stale =
      eventIds.length > 0
        ? await client.query(
            `DELETE FROM calendar_external_busy_intervals
             WHERE calendar_id = $1
               AND connection_id = $2
               AND external_calendar_id = $3
               AND start_time < $4
               AND end_time > $5
               AND NOT (external_event_id = ANY($6::text[]))`,
            [
              scope.calendarId,
              scope.connectionId,
              scope.externalCalendarId,
              scope.timeMax,
              scope.timeMin,
              eventIds,
            ],
          )
        : await client.query(
            `DELETE FROM calendar_external_busy_intervals
             WHERE calendar_id = $1
               AND connection_id = $2
               AND external_calendar_id = $3
               AND start_time < $4
               AND end_time > $5`,
            [
              scope.calendarId,
              scope.connectionId,
              scope.externalCalendarId,
              scope.timeMax,
              scope.timeMin,
            ],
          );
    return stale.rowCount ?? 0;
  }

  private async processClaim(
    claim: CalendarSyncClaim,
    options: ResolvedOptions,
  ): Promise<Record<string, unknown>> {
    const owner = await this.pool.query<{ user_id: number }>(
      `SELECT user_id
       FROM calendar_connections
       WHERE id = $1 AND organization_id = $2`,
      [claim.connection_id, claim.organization_id],
    );
    if (owner.rows.length === 0) {
      throw new Error('Calendar connection no longer exists');
    }
    const connection = await options.loadConnection(this.pool, {
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

    const result: Record<string, unknown> = {};
    if (claim.direction === 'push' || claim.direction === 'both') {
      result.push = await options.pushSync(this.pool, connection);
    }
    if (claim.direction === 'pull' || claim.direction === 'both') {
      result.pull = await options.pullSync(this.pool, connection, {
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

  private async markSuccess(
    claim: CalendarSyncClaim,
    result: Record<string, unknown>,
    options: ResolvedOptions,
  ): Promise<boolean> {
    const updated = await this.pool.query(
      `UPDATE calendar_sync_jobs SET
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
       RETURNING id`,
      [
        claim.id,
        claim.attempt_count,
        options.workerId,
        claim.organization_id,
        JSON.stringify(result),
      ],
    );
    if (updated.rowCount === 1) {
      await this.pool.query(
        `UPDATE calendar_connections SET
           last_sync_at = CURRENT_TIMESTAMP,
           error_message = NULL,
           error_count = 0,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [claim.connection_id, claim.organization_id],
      );
    }
    return updated.rowCount === 1;
  }

  private async markFailure(
    claim: CalendarSyncClaim,
    error: unknown,
    options: ResolvedOptions,
  ): Promise<'dead_letter' | 'retry'> {
    const deadLetter = Number(claim.attempt_count) >= options.maxAttempts;
    const delayMs = calendarSyncBackoffMs(
      Number(claim.attempt_count),
      options.baseDelayMs,
      options.maxDelayMs,
    );
    const safeError = redactCalendarSyncError(error);
    const updated = await this.pool.query(
      `UPDATE calendar_sync_jobs SET
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
       RETURNING id`,
      [
        claim.id,
        claim.attempt_count,
        options.workerId,
        claim.organization_id,
        deadLetter ? 'dead_letter' : 'retry',
        delayMs,
        safeError,
      ],
    );
    if (updated.rowCount === 1) {
      await this.pool.query(
        `UPDATE calendar_connections SET
           error_message = $3,
           error_count = error_count + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [claim.connection_id, claim.organization_id, safeError],
      );
    }
    return deadLetter ? 'dead_letter' : 'retry';
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
