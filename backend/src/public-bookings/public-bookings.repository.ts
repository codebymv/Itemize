import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type PublicCalendarRow = {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  timezone: string | null;
  duration_minutes: number;
  min_notice_hours: number | null;
  max_future_days: number | null;
  color: string | null;
  is_active: boolean;
  organization_name: string;
};

export type AvailabilityWindowRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type SlotPolicyCalendarRow = {
  id: number;
  duration_minutes: number;
  min_notice_hours: number | null;
  max_future_days: number | null;
  timezone: string | null;
};

export type PublicSlotRow = {
  start_time: Date;
  end_time: Date;
};

export type CreatePublicBookingValues = {
  startTime: string;
  endTime: string | null;
  timezone: string | null;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string | null;
  notes: string | null;
  customFields: Record<string, unknown>;
  cancellationTokenHash: string;
  idempotencyKey: string;
  requestFingerprint: string;
};

export type CreatedPublicBookingRow = {
  id: number;
  start_time: Date;
  end_time: Date;
  timezone: string;
  attendee_name: string;
  attendee_email: string;
};

export type CreatePublicBookingOutcome =
  | { kind: 'calendar_not_found' }
  | { kind: 'invalid_time_range' }
  | { kind: 'slot_unavailable'; reason: string }
  | { kind: 'idempotency_conflict' }
  | {
      kind: 'created';
      booking: CreatedPublicBookingRow;
      replayed: boolean;
    };

export type CancelPublicBookingOutcome =
  | { kind: 'not_found' }
  | { kind: 'cancelled' };

@Injectable()
export class PublicBookingsRepository {
  private readonly logger = new Logger(PublicBookingsRepository.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async publicCalendar(identifier: string): Promise<{
    calendar: PublicCalendarRow;
    availability: AvailabilityWindowRow[];
  } | null> {
    const client = await this.pool.connect();
    try {
      const calendarId = await this.resolvePublicCalendarId(client, identifier);
      if (calendarId === null) return null;
      const result = await client.query<PublicCalendarRow>(
        `SELECT
           c.id, c.name, c.description, c.slug, c.public_id, c.timezone,
           c.duration_minutes, c.min_notice_hours, c.max_future_days,
           c.color, c.is_active,
           o.name as organization_name
         FROM calendars c
         JOIN organizations o ON c.organization_id = o.id
         WHERE c.id = $1 AND c.is_active = TRUE`,
        [calendarId],
      );
      if (result.rows.length !== 1) return null;
      const availability = await client.query<AvailabilityWindowRow>(
        `SELECT day_of_week, start_time, end_time
         FROM availability_windows
         WHERE calendar_id = $1 AND is_active = TRUE
         ORDER BY day_of_week, start_time`,
        [result.rows[0].id],
      );
      return { calendar: result.rows[0], availability: availability.rows };
    } finally {
      client.release();
    }
  }

  async publicSlots(
    identifier: string,
    startDate: string,
    endDate: string,
  ): Promise<{ calendar: SlotPolicyCalendarRow; slots: PublicSlotRow[] } | null> {
    const client = await this.pool.connect();
    try {
      const calendarId = await this.resolvePublicCalendarId(client, identifier);
      if (calendarId === null) return null;
      const calendar = await client.query<SlotPolicyCalendarRow>(
        `SELECT id, duration_minutes, min_notice_hours, max_future_days, timezone
         FROM calendars
         WHERE id = $1 AND is_active = TRUE`,
        [calendarId],
      );
      if (calendar.rows.length !== 1) return null;
      const slots = await client.query<PublicSlotRow>(
        `SELECT start_time, end_time
         FROM booking_available_slots($1, $2::date, $3::date, CURRENT_TIMESTAMP)`,
        [calendar.rows[0].id, startDate, endDate],
      );
      return { calendar: calendar.rows[0], slots: slots.rows };
    } finally {
      client.release();
    }
  }

  async createPublicBooking(
    identifier: string,
    values: CreatePublicBookingValues,
  ): Promise<CreatePublicBookingOutcome> {
    return this.transaction(async (client) => {
      const resolvedCalendarId = await this.resolvePublicCalendarId(
        client,
        identifier,
      );
      if (resolvedCalendarId === null) return { kind: 'calendar_not_found' };
      const initial = await client.query<{
        id: number;
        organization_id: number;
        duration_minutes: number;
        assigned_to: number | null;
        timezone: string | null;
      }>(
        `SELECT id, organization_id, public_id, duration_minutes, assigned_to, min_notice_hours, timezone
         FROM calendars
         WHERE id = $1 AND is_active = TRUE`,
        [resolvedCalendarId],
      );
      if (initial.rows.length !== 1) return { kind: 'calendar_not_found' };
      let calendar = initial.rows[0];

      const endTime =
        values.endTime ||
        new Date(
          new Date(values.startTime).getTime() +
            calendar.duration_minutes * 60000,
        ).toISOString();
      if (!this.validTimeRange(values.startTime, endTime)) {
        return { kind: 'invalid_time_range' };
      }

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('calendar_booking'), $1::integer)",
        [calendar.id],
      );

      const currentCalendarId = await this.resolvePublicCalendarId(
        client,
        identifier,
      );
      if (currentCalendarId !== calendar.id) return { kind: 'calendar_not_found' };
      const current = await client.query<typeof calendar>(
        `SELECT id, organization_id, public_id, duration_minutes, assigned_to, min_notice_hours, timezone
         FROM calendars
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [calendar.id],
      );
      if (current.rows.length === 0) return { kind: 'calendar_not_found' };
      calendar = current.rows[0];

      const replay = await client.query<
        CreatedPublicBookingRow & { request_fingerprint: string }
      >(
        `SELECT
           id, start_time, end_time, timezone, attendee_name, attendee_email,
           request_fingerprint
         FROM bookings
         WHERE calendar_id = $1 AND idempotency_key = $2`,
        [calendar.id, values.idempotencyKey],
      );
      if (replay.rows.length > 0) {
        if (replay.rows[0].request_fingerprint !== values.requestFingerprint) {
          return { kind: 'idempotency_conflict' };
        }
        const { request_fingerprint: _fingerprint, ...booking } = replay.rows[0];
        return { kind: 'created', booking, replayed: true };
      }

      const policy = await client.query<{ reason: string | null }>(
        `SELECT booking_slot_policy_reason(
           $1, $2, $3, $4, $5, CURRENT_TIMESTAMP
         ) AS reason`,
        [calendar.id, values.startTime, endTime, null, true],
      );
      const reason = policy.rows[0]?.reason ?? null;
      if (reason) return { kind: 'slot_unavailable', reason };

      const contactId = await this.findOrCreateContact(
        client,
        calendar.organization_id,
        values,
      );

      const inserted = await client.query<CreatedPublicBookingRow>(
        `INSERT INTO bookings (
           organization_id, calendar_id, contact_id,
           start_time, end_time, timezone,
           attendee_name, attendee_email, attendee_phone,
           assigned_to, notes, custom_fields,
           cancellation_token_hash, cancellation_token_expires_at, source,
           idempotency_key, request_fingerprint
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13, $5::timestamptz + INTERVAL '1 day', 'booking_page', $14, $15
         )
         RETURNING id, start_time, end_time, timezone, attendee_name, attendee_email`,
        [
          calendar.organization_id,
          calendar.id,
          contactId,
          values.startTime,
          endTime,
          values.timezone || calendar.timezone || 'America/New_York',
          values.attendeeName,
          values.attendeeEmail,
          values.attendeePhone,
          calendar.assigned_to,
          values.notes,
          JSON.stringify(values.customFields),
          values.cancellationTokenHash,
          values.idempotencyKey,
          values.requestFingerprint,
        ],
      );
      const booking = inserted.rows[0];
      await this.enqueueTrigger(client, {
        organizationId: calendar.organization_id,
        contactId,
        triggerType: 'booking_created',
        entityId: booking.id,
        eventKey: `domain:booking_created:${booking.id}`,
        payload: { booking_id: booking.id, calendar_id: calendar.id },
      });
      return { kind: 'created', booking, replayed: false };
    });
  }

  async cancelPublicBooking(
    identifier: string,
    tokenHash: string,
    reason: string,
  ): Promise<CancelPublicBookingOutcome> {
    return this.transaction(async (client) => {
      const calendarId = await this.resolvePublicCalendarId(client, identifier);
      if (calendarId === null) return { kind: 'not_found' };
      const updated = await client.query<{
        id: number;
        contact_id: number | null;
        organization_id: number;
      }>(
        `UPDATE bookings SET
           status = 'cancelled',
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $1,
           cancellation_token_hash = NULL,
           cancellation_token_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE bookings.calendar_id = $2
           AND bookings.cancellation_token_hash = $3
           AND bookings.cancellation_token_expires_at > CURRENT_TIMESTAMP
           AND bookings.status = 'confirmed'
         RETURNING id, contact_id, organization_id`,
        [reason, calendarId, tokenHash],
      );
      if (updated.rows.length === 0) return { kind: 'not_found' };
      const booking = updated.rows[0];
      await this.enqueueTrigger(client, {
        organizationId: booking.organization_id,
        contactId: booking.contact_id,
        triggerType: 'booking_cancelled',
        entityId: booking.id,
        eventKey: `domain:booking_cancelled:${booking.id}`,
        payload: { booking_id: booking.id, reason },
      });
      return { kind: 'cancelled' };
    });
  }

  private async resolvePublicCalendarId(
    client: PoolClient,
    identifier: string,
  ): Promise<number | null> {
    const byPublicId = await client.query<{ id: number }>(
      `SELECT id
       FROM calendars
       WHERE public_id = $1 AND is_active = TRUE`,
      [identifier],
    );
    if (byPublicId.rows.length === 1) return byPublicId.rows[0].id;
    const bySlug = await client.query<{ id: number }>(
      `SELECT id
       FROM calendars
       WHERE slug = $1 AND is_active = TRUE
       ORDER BY id
       LIMIT 2`,
      [identifier],
    );
    return bySlug.rows.length === 1 ? bySlug.rows[0].id : null;
  }

  private async findOrCreateContact(
    client: PoolClient,
    organizationId: number,
    values: CreatePublicBookingValues,
  ): Promise<number | null> {
    try {
      const normalizedEmail =
        String(values.attendeeEmail).trim().toLowerCase() || null;
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('contact-email'), hashtext($1::text || ':' || $2))",
        [organizationId, normalizedEmail],
      );
      const existing = await client.query<{ id: number }>(
        `SELECT id
         FROM contacts
         WHERE organization_id = $1 AND email = $2
         ORDER BY id
         LIMIT 1`,
        [organizationId, normalizedEmail],
      );
      if (existing.rows.length > 0) return existing.rows[0].id;
      const nameParts = values.attendeeName.trim().split(' ');
      const created = await client.query<{ id: number }>(
        `INSERT INTO contacts (organization_id, first_name, last_name, email, phone, source)
         VALUES ($1, $2, $3, $4, $5, 'form')
         RETURNING id`,
        [
          organizationId,
          nameParts[0] || '',
          nameParts.slice(1).join(' ') || '',
          normalizedEmail,
          values.attendeePhone,
        ],
      );
      return created.rows[0].id;
    } catch (error) {
      // Attendee contact enrichment is best-effort; the booking itself must
      // survive a contact conflict exactly as the retained route does.
      this.logger.warn(
        `Could not create/find contact: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async enqueueTrigger(
    client: PoolClient,
    values: {
      organizationId: number;
      contactId: number | null;
      triggerType: 'booking_created' | 'booking_cancelled';
      entityId: number;
      eventKey: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO workflow_triggers (
         workflow_id, organization_id, contact_id, trigger_type,
         entity_type, entity_id, payload, status, event_key,
         source, occurred_at, next_attempt_at
       ) VALUES (
         NULL, $1, $2, $3,
         'booking', $4, $5::jsonb, 'queued', $6,
         'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )
       ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
      [
        values.organizationId,
        values.contactId,
        values.triggerType,
        values.entityId,
        JSON.stringify(values.payload),
        values.eventKey,
      ],
    );
  }

  private validTimeRange(startTime: string, endTime: string): boolean {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start
    );
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
