import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CalendarRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  slug: string;
  public_id: string;
  timezone: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_hours: number;
  max_future_days: number;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assignment_mode: string;
  confirmation_email: boolean;
  reminder_email: boolean;
  reminder_hours: number;
  color: string;
  is_active: boolean;
  created_by: number | null;
  upcoming_bookings: number;
  created_at: Date;
  updated_at: Date;
};

export type AvailabilityWindowRow = {
  id: number;
  calendar_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: Date;
};

export type CalendarDateOverrideRow = {
  id: number;
  calendar_id: number;
  override_date: string | Date;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: Date;
};

export type CalendarDetailRows = {
  calendar: CalendarRow;
  availabilityWindows: AvailabilityWindowRow[];
  dateOverrides: CalendarDateOverrideRow[];
};

export type CalendarAvailabilityWindowValue = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type CalendarDateOverrideValue = {
  overrideDate: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

export type CreateCalendarValues = {
  name: string;
  description: string | null;
  slug: string;
  timezone: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxFutureDays: number;
  assignedToId: number | null;
  assignmentMode: string;
  confirmationEmail: boolean;
  reminderEmail: boolean;
  reminderHours: number;
  color: string;
  isActive: boolean;
  availabilityWindows: CalendarAvailabilityWindowValue[];
};

export type UpdateCalendarValues = Partial<
  Omit<CreateCalendarValues, 'slug' | 'availabilityWindows'>
>;

export type CalendarLimit = { current: number; limit: number; plan: string };
export type CreateCalendarOutcome =
  | { kind: 'created'; value: CalendarDetailRows }
  | { kind: 'limit'; limit: CalendarLimit }
  | { kind: 'invalid_assignee' }
  | { kind: 'assignee_required' };
export type UpdateCalendarOutcome =
  | { kind: 'updated'; value: CalendarDetailRows }
  | { kind: 'not_found' }
  | { kind: 'invalid_assignee' }
  | { kind: 'assignee_required' };
export type DeleteCalendarOutcome =
  | { kind: 'deleted' }
  | { kind: 'not_found' }
  | { kind: 'upcoming_bookings' };
export type ReplaceCalendarAvailabilityOutcome =
  { kind: 'updated'; value: AvailabilityWindowRow[] } | { kind: 'not_found' };
export type UpsertCalendarDateOverrideOutcome =
  { kind: 'updated'; value: CalendarDateOverrideRow } | { kind: 'not_found' };
export type DeleteCalendarDateOverrideOutcome =
  { kind: 'deleted' } | { kind: 'not_found' };

const calendarSelection = `
  c.id,
  c.organization_id,
  c.name,
  c.description,
  c.slug,
  c.public_id,
  c.timezone,
  c.duration_minutes,
  c.buffer_before_minutes,
  c.buffer_after_minutes,
  c.min_notice_hours,
  c.max_future_days,
  c.assigned_to,
  assigned_user.name AS assigned_to_name,
  c.assignment_mode,
  c.confirmation_email,
  c.reminder_email,
  c.reminder_hours,
  c.color,
  c.is_active,
  c.created_by,
  (
    SELECT COUNT(*)::int
    FROM bookings booking
    WHERE booking.organization_id = c.organization_id
      AND booking.calendar_id = c.id
      AND booking.status = 'confirmed'
  ) AS upcoming_bookings,
  c.created_at,
  c.updated_at`;

const calendarJoins = `
  LEFT JOIN organization_members assignee_membership
    ON assignee_membership.organization_id = c.organization_id
   AND assignee_membership.user_id = c.assigned_to
  LEFT JOIN users assigned_user
    ON assigned_user.id = assignee_membership.user_id`;

@Injectable()
export class CalendarsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(organizationId: number): Promise<CalendarRow[]> {
    const result = await this.pool.query<CalendarRow>(
      `SELECT ${calendarSelection}
       FROM calendars c
       ${calendarJoins}
       WHERE c.organization_id = $1
       ORDER BY c.created_at DESC, c.id DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async findById(
    organizationId: number,
    calendarId: number,
  ): Promise<CalendarDetailRows | null> {
    const client = await this.pool.connect();
    try {
      return this.selectById(client, organizationId, calendarId);
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: CreateCalendarValues,
  ): Promise<CreateCalendarOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const limit = await this.calendarLimit(client, organizationId);
      if (limit.limit !== -1 && limit.current >= limit.limit) {
        return { kind: 'limit', limit };
      }
      if (
        values.assignmentMode === 'specific' &&
        values.assignedToId === null
      ) {
        return { kind: 'assignee_required' };
      }
      if (
        values.assignedToId !== null &&
        !(await this.isOrganizationMember(
          client,
          organizationId,
          values.assignedToId,
        ))
      ) {
        return { kind: 'invalid_assignee' };
      }
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO calendars (
           organization_id, name, description, slug, timezone,
           duration_minutes, buffer_before_minutes, buffer_after_minutes,
           min_notice_hours, max_future_days, assigned_to, assignment_mode,
           confirmation_email, reminder_email, reminder_hours, color,
           is_active, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15, $16,
           $17, $18
         )
         RETURNING id`,
        [
          organizationId,
          values.name,
          values.description,
          values.slug,
          values.timezone,
          values.durationMinutes,
          values.bufferBeforeMinutes,
          values.bufferAfterMinutes,
          values.minNoticeHours,
          values.maxFutureDays,
          values.assignedToId,
          values.assignmentMode,
          values.confirmationEmail,
          values.reminderEmail,
          values.reminderHours,
          values.color,
          values.isActive,
          userId,
        ],
      );
      await this.insertAvailabilityWindows(
        client,
        inserted.rows[0].id,
        values.availabilityWindows,
      );
      const created = await this.selectById(
        client,
        organizationId,
        inserted.rows[0].id,
      );
      if (!created) throw new Error('Created calendar could not be reloaded');
      return { kind: 'created', value: created };
    });
  }

  async update(
    organizationId: number,
    calendarId: number,
    values: UpdateCalendarValues,
  ): Promise<UpdateCalendarOutcome> {
    return this.transaction(async (client) => {
      const current = await client.query<{
        assigned_to: number | null;
        assignment_mode: string;
      }>(
        `SELECT assigned_to, assignment_mode
         FROM calendars
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [calendarId, organizationId],
      );
      if (!current.rows[0]) return { kind: 'not_found' };

      const assignedToId =
        values.assignedToId === undefined
          ? current.rows[0].assigned_to
          : values.assignedToId;
      const assignmentMode =
        values.assignmentMode === undefined
          ? current.rows[0].assignment_mode
          : values.assignmentMode;
      if (assignmentMode === 'specific' && assignedToId === null) {
        return { kind: 'assignee_required' };
      }
      if (
        assignedToId !== null &&
        !(await this.isOrganizationMember(client, organizationId, assignedToId))
      ) {
        return { kind: 'invalid_assignee' };
      }

      const columns: Record<keyof UpdateCalendarValues, string> = {
        name: 'name',
        description: 'description',
        timezone: 'timezone',
        durationMinutes: 'duration_minutes',
        bufferBeforeMinutes: 'buffer_before_minutes',
        bufferAfterMinutes: 'buffer_after_minutes',
        minNoticeHours: 'min_notice_hours',
        maxFutureDays: 'max_future_days',
        assignedToId: 'assigned_to',
        assignmentMode: 'assignment_mode',
        confirmationEmail: 'confirmation_email',
        reminderEmail: 'reminder_email',
        reminderHours: 'reminder_hours',
        color: 'color',
        isActive: 'is_active',
      };
      const assignments: string[] = [];
      const params: unknown[] = [calendarId, organizationId];
      for (const [key, value] of Object.entries(values) as [
        keyof UpdateCalendarValues,
        unknown,
      ][]) {
        params.push(value);
        assignments.push(`${columns[key]} = $${params.length}`);
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE calendars
           SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2`,
          params,
        );
      }
      const updated = await this.selectById(client, organizationId, calendarId);
      if (!updated) throw new Error('Updated calendar could not be reloaded');
      return { kind: 'updated', value: updated };
    });
  }

  async delete(
    organizationId: number,
    calendarId: number,
  ): Promise<DeleteCalendarOutcome> {
    return this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('calendar_booking'), $1::integer)",
        [calendarId],
      );
      const calendar = await client.query(
        `SELECT id
         FROM calendars
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [calendarId, organizationId],
      );
      if (!calendar.rows[0]) return { kind: 'not_found' };

      const bookings = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM bookings
         WHERE calendar_id = $1
           AND organization_id = $2
           AND status IN ('pending', 'confirmed')
           AND start_time > NOW()`,
        [calendarId, organizationId],
      );
      if (bookings.rows[0].count > 0) {
        return { kind: 'upcoming_bookings' };
      }

      const deleted = await client.query(
        `DELETE FROM calendars
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [calendarId, organizationId],
      );
      return deleted.rows[0] ? { kind: 'deleted' } : { kind: 'not_found' };
    });
  }

  async replaceAvailability(
    organizationId: number,
    calendarId: number,
    windows: CalendarAvailabilityWindowValue[],
  ): Promise<ReplaceCalendarAvailabilityOutcome> {
    return this.transaction(async (client) => {
      const calendar = await client.query(
        `SELECT id
         FROM calendars
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [calendarId, organizationId],
      );
      if (!calendar.rows[0]) return { kind: 'not_found' };

      await client.query(
        'DELETE FROM availability_windows WHERE calendar_id = $1',
        [calendarId],
      );
      await this.insertAvailabilityWindows(client, calendarId, windows);
      const result = await client.query<AvailabilityWindowRow>(
        `SELECT
           id,
           calendar_id,
           day_of_week,
           start_time,
           end_time,
           is_active,
           created_at
         FROM availability_windows
         WHERE calendar_id = $1
         ORDER BY day_of_week, start_time, end_time, id`,
        [calendarId],
      );
      return { kind: 'updated', value: result.rows };
    });
  }

  async upsertDateOverride(
    organizationId: number,
    calendarId: number,
    values: CalendarDateOverrideValue,
  ): Promise<UpsertCalendarDateOverrideOutcome> {
    return this.transaction(async (client) => {
      const calendar = await client.query(
        `SELECT id
         FROM calendars
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [calendarId, organizationId],
      );
      if (!calendar.rows[0]) return { kind: 'not_found' };

      const result = await client.query<CalendarDateOverrideRow>(
        `INSERT INTO calendar_date_overrides (
           calendar_id,
           override_date,
           is_available,
           start_time,
           end_time,
           reason
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (calendar_id, override_date)
         DO UPDATE SET
           is_available = EXCLUDED.is_available,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           reason = EXCLUDED.reason
         RETURNING
           id,
           calendar_id,
           override_date,
           is_available,
           start_time,
           end_time,
           reason,
           created_at`,
        [
          calendarId,
          values.overrideDate,
          values.isAvailable,
          values.startTime,
          values.endTime,
          values.reason,
        ],
      );
      return { kind: 'updated', value: result.rows[0] };
    });
  }

  async deleteDateOverride(
    organizationId: number,
    calendarId: number,
    overrideId: number,
  ): Promise<DeleteCalendarDateOverrideOutcome> {
    return this.transaction(async (client) => {
      const result = await client.query(
        `DELETE FROM calendar_date_overrides override
         USING calendars calendar
         WHERE override.id = $1
           AND override.calendar_id = $2
           AND calendar.id = override.calendar_id
           AND calendar.organization_id = $3
         RETURNING override.id`,
        [overrideId, calendarId, organizationId],
      );
      return result.rows[0] ? { kind: 'deleted' } : { kind: 'not_found' };
    });
  }

  private async selectById(
    client: PoolClient,
    organizationId: number,
    calendarId: number,
  ): Promise<CalendarDetailRows | null> {
    const calendar = await client.query<CalendarRow>(
      `SELECT ${calendarSelection}
       FROM calendars c
       ${calendarJoins}
       WHERE c.organization_id = $1 AND c.id = $2`,
      [organizationId, calendarId],
    );
    if (!calendar.rows[0]) return null;

    const availability = await client.query<AvailabilityWindowRow>(
      `SELECT
         id,
         calendar_id,
         day_of_week,
         start_time,
         end_time,
         is_active,
         created_at
       FROM availability_windows
       WHERE calendar_id = $1
       ORDER BY day_of_week, start_time, id`,
      [calendarId],
    );
    const overrides = await client.query<CalendarDateOverrideRow>(
      `SELECT
         id,
         calendar_id,
         override_date,
         is_available,
         start_time,
         end_time,
         reason,
         created_at
       FROM calendar_date_overrides
       WHERE calendar_id = $1 AND override_date >= CURRENT_DATE
       ORDER BY override_date, id`,
      [calendarId],
    );
    return {
      calendar: calendar.rows[0],
      availabilityWindows: availability.rows,
      dateOverrides: overrides.rows,
    };
  }

  private async insertAvailabilityWindows(
    client: PoolClient,
    calendarId: number,
    windows: CalendarAvailabilityWindowValue[],
  ): Promise<void> {
    if (windows.length === 0) return;
    const params: unknown[] = [];
    const rows = windows.map((window) => {
      params.push(
        calendarId,
        window.dayOfWeek,
        window.startTime,
        window.endTime,
        window.isActive,
      );
      const offset = params.length - 4;
      return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });
    await client.query(
      `INSERT INTO availability_windows (
         calendar_id, day_of_week, start_time, end_time, is_active
       ) VALUES ${rows.join(', ')}`,
      params,
    );
  }

  private async isOrganizationMember(
    client: PoolClient,
    organizationId: number,
    userId: number,
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1
       FROM organization_members
       WHERE organization_id = $1 AND user_id = $2
       FOR KEY SHARE`,
      [organizationId, userId],
    );
    return result.rows.length === 1;
  }

  private async calendarLimit(
    client: PoolClient,
    organizationId: number,
  ): Promise<CalendarLimit> {
    const result = await client.query<CalendarLimit>(
      `SELECT
         COUNT(c.id)::int AS current,
         COALESCE(o.calendars_limit, 3)::int AS limit,
         COALESCE(o.plan, 'free') AS plan
       FROM organizations o
       LEFT JOIN calendars c ON c.organization_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, o.calendars_limit, o.plan`,
      [organizationId],
    );
    if (!result.rows[0])
      throw new Error('Organization limit could not be loaded');
    return result.rows[0];
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
