import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CalendarConnectionRow = {
  id: number;
  provider: string;
  provider_email: string | null;
  sync_enabled: boolean;
  sync_direction: string;
  last_sync_at: Date | null;
  is_active: boolean;
  error_message: string | null;
  error_count: number;
  selected_calendars: unknown;
  created_at: Date;
  updated_at: Date;
};

export type CalendarSyncJobRow = {
  id: string | number;
  connection_id: number;
  direction: string;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
  result: Record<string, unknown> | null;
  last_error: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CalendarSyncStatsRow = {
  total_synced: string | number;
  pushed: string | number;
  pulled: string | number;
  last_event_sync: Date | null;
};

export type UpdateCalendarConnectionValues = {
  syncEnabled?: boolean;
  syncDirection?: string;
  selectedCalendars?: string[];
};

export type EnqueueCalendarSyncOutcome =
  | { kind: 'not_found' }
  | { kind: 'disabled' }
  | { kind: 'invalid_direction' }
  | { kind: 'queued'; created: boolean; job: CalendarSyncJobRow };

export type CalendarSyncStatusRows = {
  connection: CalendarConnectionRow;
  stats: CalendarSyncStatsRow;
  jobs: CalendarSyncJobRow[];
};

const connectionSelection = `
  id,
  provider,
  provider_email,
  sync_enabled,
  sync_direction,
  last_sync_at,
  is_active,
  error_message,
  error_count,
  selected_calendars,
  created_at,
  updated_at`;

const jobSelection = `
  id,
  connection_id,
  direction,
  status,
  attempt_count,
  next_attempt_at,
  result,
  last_error,
  completed_at,
  created_at,
  updated_at`;

@Injectable()
export class CalendarIntegrationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    organizationId: number,
    userId: number,
  ): Promise<CalendarConnectionRow[]> {
    const result = await this.pool.query<CalendarConnectionRow>(
      `SELECT ${connectionSelection}
       FROM calendar_connections
       WHERE organization_id = $1 AND user_id = $2
       ORDER BY created_at DESC, id DESC`,
      [organizationId, userId],
    );
    return result.rows;
  }

  async update(
    organizationId: number,
    userId: number,
    connectionId: number,
    values: UpdateCalendarConnectionValues,
  ): Promise<CalendarConnectionRow | null> {
    return this.transaction(async (client) => {
      const owned = await client.query(
        `SELECT id
         FROM calendar_connections
         WHERE id = $1 AND organization_id = $2 AND user_id = $3
         FOR UPDATE`,
        [connectionId, organizationId, userId],
      );
      if (!owned.rows[0]) return null;

      const assignments: string[] = [];
      const parameters: unknown[] = [connectionId, organizationId, userId];
      const set = (column: string, value: unknown, cast = '') => {
        parameters.push(value);
        assignments.push(`${column} = $${parameters.length}${cast}`);
      };
      if (values.syncEnabled !== undefined) {
        set('sync_enabled', values.syncEnabled);
      }
      if (values.syncDirection !== undefined) {
        set('sync_direction', values.syncDirection);
      }
      if (values.selectedCalendars !== undefined) {
        set('selected_calendars', JSON.stringify(values.selectedCalendars), '::jsonb');
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE calendar_connections
           SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2 AND user_id = $3`,
          parameters,
        );
      }
      return this.selectConnection(
        client,
        organizationId,
        userId,
        connectionId,
      );
    });
  }

  async delete(
    organizationId: number,
    userId: number,
    connectionId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM calendar_connections
       WHERE id = $1 AND organization_id = $2 AND user_id = $3
       RETURNING id`,
      [connectionId, organizationId, userId],
    );
    return result.rows.length === 1;
  }

  async enqueue(
    organizationId: number,
    userId: number,
    connectionId: number,
    idempotencyKey?: string,
  ): Promise<EnqueueCalendarSyncOutcome> {
    return this.transaction(async (client) => {
      const connection = await client.query<{
        id: number;
        organization_id: number;
        sync_enabled: boolean;
        sync_direction: string;
        selected_calendars: unknown;
        is_active: boolean;
      }>(
        `SELECT id, organization_id, sync_enabled, sync_direction,
                selected_calendars, is_active
         FROM calendar_connections
         WHERE id = $1
           AND organization_id = $2
           AND user_id = $3
           AND provider = 'google'
         FOR UPDATE`,
        [connectionId, organizationId, userId],
      );
      if (!connection.rows[0]) return { kind: 'not_found' };
      const current = connection.rows[0];
      if (!current.is_active || !current.sync_enabled) {
        return { kind: 'disabled' };
      }
      if (!['push', 'pull', 'both'].includes(current.sync_direction)) {
        return { kind: 'invalid_direction' };
      }

      const key = idempotencyKey ?? randomUUID();
      const prior = await client.query<CalendarSyncJobRow>(
        `SELECT ${jobSelection}
         FROM calendar_sync_jobs
         WHERE connection_id = $1
           AND (
             idempotency_key = $2::varchar
             OR idempotency_keys ? $2::text
           )
         ORDER BY created_at, id
         LIMIT 1`,
        [current.id, key],
      );
      if (prior.rows[0]) {
        return { kind: 'queued', created: false, job: prior.rows[0] };
      }

      const active = await client.query<CalendarSyncJobRow>(
        `WITH candidate AS (
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
             ELSE job.idempotency_keys || jsonb_build_array($2::text)
           END,
           updated_at = CURRENT_TIMESTAMP
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING ${jobSelection
           .split('\n')
           .map((line) => (line.trim() ? `job.${line.trim()}` : line))
           .join('\n')}`,
        [current.id, key],
      );
      if (active.rows[0]) {
        return { kind: 'queued', created: false, job: active.rows[0] };
      }

      const selectedCalendars = Array.isArray(current.selected_calendars)
        ? current.selected_calendars.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const inserted = await client.query<CalendarSyncJobRow>(
        `INSERT INTO calendar_sync_jobs (
           organization_id,
           connection_id,
           requested_by_user_id,
           idempotency_key,
           idempotency_keys,
           direction,
           selected_calendars
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
         RETURNING ${jobSelection}`,
        [
          organizationId,
          current.id,
          userId,
          key,
          JSON.stringify([key]),
          current.sync_direction,
          JSON.stringify(selectedCalendars),
        ],
      );
      return { kind: 'queued', created: true, job: inserted.rows[0] };
    });
  }

  async syncStatus(
    organizationId: number,
    userId: number,
    connectionId: number,
  ): Promise<CalendarSyncStatusRows | null> {
    const client = await this.pool.connect();
    try {
      const connection = await this.selectConnection(
        client,
        organizationId,
        userId,
        connectionId,
      );
      if (!connection) return null;
      const [stats, jobs] = await Promise.all([
        client.query<CalendarSyncStatsRow>(
          `SELECT
             COUNT(*) AS total_synced,
             COUNT(*) FILTER (WHERE sync_direction = 'push') AS pushed,
             COUNT(*) FILTER (WHERE sync_direction = 'pull') AS pulled,
             MAX(last_synced_at) AS last_event_sync
           FROM calendar_sync_events
           WHERE connection_id = $1`,
          [connectionId],
        ),
        client.query<CalendarSyncJobRow>(
          `SELECT ${jobSelection}
           FROM calendar_sync_jobs
           WHERE connection_id = $1 AND organization_id = $2
           ORDER BY created_at DESC, id DESC
           LIMIT 10`,
          [connectionId, organizationId],
        ),
      ]);
      return {
        connection,
        stats: stats.rows[0],
        jobs: jobs.rows,
      };
    } finally {
      client.release();
    }
  }

  private async selectConnection(
    client: PoolClient,
    organizationId: number,
    userId: number,
    connectionId: number,
  ): Promise<CalendarConnectionRow | null> {
    const result = await client.query<CalendarConnectionRow>(
      `SELECT ${connectionSelection}
       FROM calendar_connections
       WHERE id = $1 AND organization_id = $2 AND user_id = $3`,
      [connectionId, organizationId, userId],
    );
    return result.rows[0] ?? null;
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
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
