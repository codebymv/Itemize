import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type CalendarRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  slug: string;
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

const calendarSelection = `
  c.id,
  c.organization_id,
  c.name,
  c.description,
  c.slug,
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
    } finally {
      client.release();
    }
  }
}
