import { PoolClient } from 'pg';
import { brandedTransactionalEmail, transactionalEmailAssetOrigin } from '../common/branded-transactional-email';

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
    end_time: Date; timezone: string; calendar_name: string; organization_name: string; organizer_email: string | null;
  }>(`SELECT b.attendee_email, b.contact_id, b.start_time, b.end_time, b.timezone,
       c.name AS calendar_name, o.name AS organization_name,
       COALESCE(NULLIF(TRIM(business.email), ''), NULLIF(TRIM(settings.business_email), '')) AS organizer_email
     FROM bookings b
     JOIN calendars c ON c.id=b.calendar_id AND c.organization_id=b.organization_id
     JOIN organizations o ON o.id=b.organization_id
     LEFT JOIN businesses business ON business.organization_id=o.id AND business.is_active=TRUE
       AND business.id::text=o.settings->>'defaultBusinessId'
     LEFT JOIN payment_settings settings ON settings.organization_id=o.id
     WHERE b.id=$1 AND b.organization_id=$2 AND c.confirmation_email=TRUE
       AND NULLIF(TRIM(b.attendee_email), '') IS NOT NULL`, [bookingId, organizationId]);
  const booking = result.rows[0];
  if (!booking) return;
  let timezone = booking.timezone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    // Older public bookings accepted arbitrary timezone strings. Preserve
    // their lifecycle operations and render an explicitly labelled UTC time.
    timezone = 'UTC';
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, dateStyle: 'full', timeStyle: 'short',
  });
  const organizerEmail = booking.organizer_email && booking.organizer_email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(booking.organizer_email) ? booking.organizer_email : null;
  const contactInstruction = organizerEmail
    ? `For appointment changes, contact the organizer at ${organizerEmail}.`
    : 'For appointment changes, use the contact details provided when arranging this appointment.';
  const subject = `Booking ${event}: ${booking.calendar_name}`;
  const bodyText = [
    `Your appointment with ${booking.organization_name} is ${event}.`,
    booking.calendar_name,
    `Start: ${formatter.format(booking.start_time)}`,
    `End: ${formatter.format(booking.end_time)}`,
    `Timezone: ${timezone}`,
    event === 'cancelled' ? 'This appointment has been released.'
      : contactInstruction,
  ].join('\n');
  await client.query(`INSERT INTO workflow_side_effect_outbox
      (idempotency_key, organization_id, enrollment_run_at, effect_type, payload)
    VALUES ($1, $2, CURRENT_TIMESTAMP, 'email', $3::jsonb)
    ON CONFLICT (idempotency_key) DO NOTHING`, [
    `booking-notification:${eventKey}`, organizationId,
    JSON.stringify({ to: booking.attendee_email, subject, bodyText,
      bodyHtml: brandedTransactionalEmail({
        assetOrigin: transactionalEmailAssetOrigin(),
        previewText: `Your appointment with ${booking.organization_name} is ${event}.`,
        heading: `Booking ${event}`,
        bodyHtml: bodyText.split('\n').map(line => {
          const content = organizerEmail && line === contactInstruction
            ? `For appointment changes, contact the organizer at <a href="mailto:${escapeHtml(encodeURIComponent(organizerEmail).replace('%40', '@'))}">${escapeHtml(organizerEmail)}</a>.`
            : escapeHtml(line);
          return `<p style="margin:0 0 16px">${content}</p>`;
        }).join(''),
      }),
      contactId: booking.contact_id, bookingId, bookingEvent: event }),
  ]);
}
