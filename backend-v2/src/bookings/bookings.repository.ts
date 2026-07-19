import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
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

export type CancelBookingOutcome =
  | { kind: 'cancelled'; row: BookingRow }
  | { kind: 'not_found' }
  | { kind: 'invalid_status' };

export type CreateBookingValues = {
  calendarId: number;
  contactId: number | null;
  title: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  assignedToId: number | null;
  notes: string | null;
  internalNotes: string | null;
  customFields: Record<string, unknown>;
};

export type CreateBookingOutcome =
  | { kind: 'created'; row: BookingRow }
  | { kind: 'calendar_not_found' }
  | { kind: 'invalid_contact' }
  | { kind: 'invalid_assignee' }
  | { kind: 'slot_unavailable' };

export type RescheduleBookingOutcome =
  | { kind: 'rescheduled'; row: BookingRow }
  | { kind: 'not_found' }
  | { kind: 'invalid_status' }
  | { kind: 'slot_unavailable' };

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

  async create(
    organizationId: number,
    values: CreateBookingValues,
  ): Promise<CreateBookingOutcome> {
    return this.transaction(async (client) => {
      await this.lockCalendarBookings(client, values.calendarId);
      const calendar = await client.query<{
        assigned_to: number | null;
      }>(
        `SELECT assigned_to
         FROM calendars
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, values.calendarId],
      );
      if (!calendar.rows[0]) return { kind: 'calendar_not_found' };

      if (values.contactId !== null) {
        const contact = await client.query(
          `SELECT id
           FROM contacts
           WHERE organization_id = $1 AND id = $2
           FOR KEY SHARE`,
          [organizationId, values.contactId],
        );
        if (!contact.rows[0]) return { kind: 'invalid_contact' };
      }

      const assignedToId =
        values.assignedToId ?? calendar.rows[0].assigned_to ?? null;
      if (assignedToId !== null) {
        const assignee = await client.query(
          `SELECT user_id
           FROM organization_members
           WHERE organization_id = $1 AND user_id = $2
           FOR KEY SHARE`,
          [organizationId, assignedToId],
        );
        if (!assignee.rows[0]) return { kind: 'invalid_assignee' };
      }

      if (
        !(await this.slotAvailable(
          client,
          organizationId,
          values.calendarId,
          values.startTime,
          values.endTime,
        ))
      ) {
        return { kind: 'slot_unavailable' };
      }

      const inserted = await client.query<BookingRow>(
        `INSERT INTO bookings (
           organization_id, calendar_id, contact_id, title,
           start_time, end_time, timezone,
           attendee_name, attendee_email, attendee_phone,
           assigned_to, notes, internal_notes, custom_fields,
           cancellation_token, source
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10,
           $11, $12, $13, $14::jsonb,
           $15, 'manual'
         )
         RETURNING *`,
        [
          organizationId,
          values.calendarId,
          values.contactId,
          values.title,
          values.startTime,
          values.endTime,
          values.timezone,
          values.attendeeName,
          values.attendeeEmail,
          values.attendeePhone,
          assignedToId,
          values.notes,
          values.internalNotes,
          JSON.stringify(values.customFields),
          randomBytes(32).toString('hex'),
        ],
      );
      const booking = inserted.rows[0];
      await client.query(
        `INSERT INTO workflow_triggers (
           workflow_id, organization_id, contact_id, trigger_type,
           entity_type, entity_id, payload, status, event_key,
           source, occurred_at, next_attempt_at
         ) VALUES (
           NULL, $1, $2, 'booking_created',
           'booking', $3, $4::jsonb, 'queued', $5,
           'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
        [
          organizationId,
          booking.contact_id,
          booking.id,
          JSON.stringify({
            booking_id: booking.id,
            calendar_id: values.calendarId,
            version: 1,
          }),
          `domain:booking_created:${booking.id}`,
        ],
      );
      const row = await this.findByIdWith(client, organizationId, booking.id);
      if (!row) throw new Error('Booking disappeared inside creation');
      return { kind: 'created', row };
    });
  }

  async cancel(
    organizationId: number,
    bookingId: number,
    reason: string | null,
  ): Promise<CancelBookingOutcome> {
    return this.transaction(async (client) => {
      const current = await client.query<{ status: BookingStatus }>(
        `SELECT status
         FROM bookings
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, bookingId],
      );
      if (!current.rows[0]) return { kind: 'not_found' };
      if (
        current.rows[0].status !== BookingStatus.PENDING &&
        current.rows[0].status !== BookingStatus.CONFIRMED
      ) {
        return { kind: 'invalid_status' };
      }

      const updated = await client.query<BookingRow>(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1 AND id = $2
         RETURNING *`,
        [organizationId, bookingId, reason],
      );
      const booking = updated.rows[0];
      await client.query(
        `INSERT INTO workflow_triggers (
           workflow_id, organization_id, contact_id, trigger_type,
           entity_type, entity_id, payload, status, event_key,
           source, occurred_at, next_attempt_at
         ) VALUES (
           NULL, $1, $2, 'booking_cancelled',
           'booking', $3, $4::jsonb, 'queued', $5,
           'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
        [
          organizationId,
          booking.contact_id,
          bookingId,
          JSON.stringify({
            booking_id: bookingId,
            reason: reason ?? 'No reason provided',
            version: 1,
          }),
          `domain:booking_cancelled:${bookingId}`,
        ],
      );
      const row = await this.findByIdWith(client, organizationId, bookingId);
      if (!row) throw new Error('Booking disappeared inside cancellation');
      return { kind: 'cancelled', row };
    });
  }

  async reschedule(
    organizationId: number,
    bookingId: number,
    startTime: Date,
    endTime: Date,
    timezone: string | null,
  ): Promise<RescheduleBookingOutcome> {
    return this.transaction(async (client) => {
      const target = await client.query<{ calendar_id: number }>(
        `SELECT calendar_id
         FROM bookings
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, bookingId],
      );
      if (!target.rows[0]) return { kind: 'not_found' };
      const calendarId = Number(target.rows[0].calendar_id);

      await this.lockCalendarBookings(client, calendarId);
      const calendar = await client.query(
        `SELECT id
         FROM calendars
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, calendarId],
      );
      if (!calendar.rows[0]) return { kind: 'not_found' };

      const current = await client.query<BookingRow>(
        `SELECT *
         FROM bookings
         WHERE organization_id = $1 AND id = $2 AND calendar_id = $3
         FOR UPDATE`,
        [organizationId, bookingId, calendarId],
      );
      const previous = current.rows[0];
      if (!previous) return { kind: 'not_found' };
      if (
        previous.status !== BookingStatus.PENDING &&
        previous.status !== BookingStatus.CONFIRMED
      ) {
        return { kind: 'invalid_status' };
      }

      if (
        !(await this.slotAvailable(
          client,
          organizationId,
          calendarId,
          startTime,
          endTime,
          bookingId,
        ))
      ) {
        return { kind: 'slot_unavailable' };
      }

      const updated = await client.query<BookingRow>(
        `UPDATE bookings
         SET start_time = $3,
             end_time = $4,
             timezone = COALESCE($5, timezone),
             updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1 AND id = $2
         RETURNING *`,
        [organizationId, bookingId, startTime, endTime, timezone],
      );
      const booking = updated.rows[0];
      await client.query(
        `INSERT INTO workflow_triggers (
           workflow_id, organization_id, contact_id, trigger_type,
           entity_type, entity_id, payload, status, event_key,
           source, occurred_at, next_attempt_at
         ) VALUES (
           NULL, $1, $2, 'booking_rescheduled',
           'booking', $3, $4::jsonb, 'queued', $5,
           'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )`,
        [
          organizationId,
          booking.contact_id,
          bookingId,
          JSON.stringify({
            booking_id: bookingId,
            newTime: { end: endTime, start: startTime },
            oldTime: {
              end: previous.end_time,
              start: previous.start_time,
            },
            version: 1,
          }),
          `domain:booking_rescheduled:${bookingId}:${randomUUID()}`,
        ],
      );
      const row = await this.findByIdWith(client, organizationId, bookingId);
      if (!row) throw new Error('Booking disappeared inside rescheduling');
      return { kind: 'rescheduled', row };
    });
  }

  private async findByIdWith(
    client: PoolClient,
    organizationId: number,
    bookingId: number,
  ): Promise<BookingRow | null> {
    const result = await client.query<BookingRow>(
      `SELECT ${bookingSelection}
       FROM bookings b
       ${bookingJoins}
       WHERE b.organization_id = $1 AND b.id = $2`,
      [organizationId, bookingId],
    );
    return result.rows[0] ?? null;
  }

  private lockCalendarBookings(
    client: PoolClient,
    calendarId: number,
  ): Promise<unknown> {
    return client.query(
      "SELECT pg_advisory_xact_lock(hashtext('calendar_booking'), $1::integer)",
      [calendarId],
    );
  }

  private async slotAvailable(
    client: PoolClient,
    organizationId: number,
    calendarId: number,
    startTime: Date,
    endTime: Date,
    excludeBookingId: number | null = null,
  ): Promise<boolean> {
    const result = await client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM bookings
       WHERE organization_id = $1
         AND calendar_id = $2
         AND status IN ('pending', 'confirmed')
         AND start_time < $4
         AND end_time > $3
         AND ($5::integer IS NULL OR id <> $5)`,
      [
        organizationId,
        calendarId,
        startTime,
        endTime,
        excludeBookingId,
      ],
    );
    return Number(result.rows[0]?.total ?? 0) === 0;
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
