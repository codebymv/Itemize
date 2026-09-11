import { PoolClient } from 'pg';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** Queue the immutable notification in the same transaction as the booking change. */
export async function enqueueBookingNotification(
  client: PoolClient,
  organizationId: number,
  bookingId: number,
  event: 'confirmed' | 'rescheduled' | 'cancelled',
  eventKey: string,
): Promise<void> {
  const result = await client.query<{
    attendee_email: string; contact_id: number | null; start_time: Date;
    end_time: Date; timezone: string; calendar_name: string; organization_name: string;
  }>(`SELECT b.attendee_email, b.contact_id, b.start_time, b.end_time, b.timezone,
       c.name AS calendar_name, o.name AS organization_name
     FROM bookings b
     JOIN calendars c ON c.id=b.calendar_id AND c.organization_id=b.organization_id
     JOIN organizations o ON o.id=b.organization_id
     WHERE b.id=$1 AND b.organization_id=$2 AND c.confirmation_email=TRUE
       AND NULLIF(TRIM(b.attendee_email), '') IS NOT NULL`, [bookingId, organizationId]);
  const booking = result.rows[0];
  if (!booking) return;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: booking.timezone, dateStyle: 'full', timeStyle: 'short',
  });
  const subject = `Booking ${event}: ${booking.calendar_name}`;
  const bodyText = [
    `Your appointment with ${booking.organization_name} is ${event}.`,
    booking.calendar_name,
    `Start: ${formatter.format(booking.start_time)}`,
    `End: ${formatter.format(booking.end_time)}`,
    `Timezone: ${booking.timezone}`,
    event === 'cancelled' ? 'This appointment has been released.'
      : 'Contact the organizer if you need to change this appointment.',
  ].join('\n');
  await client.query(`INSERT INTO workflow_side_effect_outbox
      (idempotency_key, organization_id, enrollment_run_at, effect_type, payload)
    VALUES ($1, $2, CURRENT_TIMESTAMP, 'email', $3::jsonb)
    ON CONFLICT (idempotency_key) DO NOTHING`, [
    `booking-notification:${eventKey}`, organizationId,
    JSON.stringify({ to: booking.attendee_email, subject, bodyText,
      bodyHtml: bodyText.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join(''),
      contactId: booking.contact_id, bookingId, bookingEvent: event }),
  ]);
}
