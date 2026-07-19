import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { BookingStatus } from './booking.enums';

export type BookingRow = {
  id: number;
  organization_id: number;
  calendar_id: number;
  contact_id: number | null;
  title: string | null;
  start_time: Date;
  end_time: Date;
  timezone: string;
  attendee_name: string | null;
  attendee_email: string | null;
  attendee_phone: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  status: BookingStatus;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  notes: string | null;
  internal_notes: string | null;
  reminder_sent_at: Date | null;
  custom_fields: Record<string, unknown> | null;
  source: string;
  calendar_name: string | null;
  calendar_color: string | null;
  calendar_slug: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: Date;
  updated_at: Date;
};

export type BookingCriteria = {
  organizationId: number;
  calendarId?: number;
  contactId?: number;
  assignedToId?: number;
  status?: BookingStatus;
  startDate?: Date;
  endDate?: Date;
  pageSize: number;
  offset: number;
};

const bookingSelection = `
  b.id,
  b.organization_id,
  b.calendar_id,
  b.contact_id,
  b.title,
  b.start_time,
  b.end_time,
  b.timezone,
  b.attendee_name,
  b.attendee_email,
  b.attendee_phone,
  b.assigned_to,
  assigned_user.name AS assigned_to_name,
  b.status,
  b.cancelled_at,
  b.cancellation_reason,
  b.notes,
  b.internal_notes,
  b.reminder_sent_at,
  b.custom_fields,
  b.source,
  calendar.name AS calendar_name,
  calendar.color AS calendar_color,
  calendar.slug AS calendar_slug,
  contact.first_name AS contact_first_name,
  contact.last_name AS contact_last_name,
  contact.email AS contact_email,
  contact.phone AS contact_phone,
  b.created_at,
  b.updated_at`;

const bookingJoins = `
  LEFT JOIN calendars calendar
    ON calendar.id = b.calendar_id
   AND calendar.organization_id = b.organization_id
  LEFT JOIN contacts contact
    ON contact.id = b.contact_id
   AND contact.organization_id = b.organization_id
  LEFT JOIN organization_members assignee_membership
    ON assignee_membership.organization_id = b.organization_id
   AND assignee_membership.user_id = b.assigned_to
  LEFT JOIN users assigned_user
    ON assigned_user.id = assignee_membership.user_id`;

@Injectable()
export class BookingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: BookingCriteria,
  ): Promise<{ rows: BookingRow[]; total: number }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['b.organization_id = $1'];
    const add = (column: string, value: unknown, operator = '=') => {
      parameters.push(value);
      clauses.push(`${column} ${operator} $${parameters.length}`);
    };
    if (criteria.calendarId !== undefined)
      add('b.calendar_id', criteria.calendarId);
    if (criteria.contactId !== undefined)
      add('b.contact_id', criteria.contactId);
    if (criteria.assignedToId !== undefined)
      add('b.assigned_to', criteria.assignedToId);
    if (criteria.status !== undefined) add('b.status', criteria.status);
    if (criteria.startDate !== undefined)
      add('b.start_time', criteria.startDate, '>=');
    if (criteria.endDate !== undefined)
      add('b.start_time', criteria.endDate, '<=');
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM bookings b WHERE ${where}`,
      parameters,
    );
    const rows = await this.pool.query<BookingRow>(
      `SELECT ${bookingSelection}
       FROM bookings b
       ${bookingJoins}
       WHERE ${where}
       ORDER BY b.start_time DESC, b.id DESC
       LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
      [...parameters, criteria.pageSize, criteria.offset],
    );
    return { rows: rows.rows, total: count.rows[0]?.total ?? 0 };
  }

  async findById(
    organizationId: number,
    bookingId: number,
  ): Promise<BookingRow | null> {
    const result = await this.pool.query<BookingRow>(
      `SELECT ${bookingSelection}
       FROM bookings b
       ${bookingJoins}
       WHERE b.organization_id = $1 AND b.id = $2`,
      [organizationId, bookingId],
    );
    return result.rows[0] ?? null;
  }
}
