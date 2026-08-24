/**
 * Google Calendar event operations for the sync worker — faithful port
 * of the event functions in backend/src/services/googleCalendarService.js
 * (deterministic event ids, all-day zoned start resolution, paged
 * listing with the 10-page guard, reminder overrides, and extended
 * properties). Uses the scoped @googleapis/calendar package: the
 * monolithic googleapis package OOMs ts-jest.
 */
import { calendar } from '@googleapis/calendar';
import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'googleapis-common';
import * as crypto from 'crypto';

export const GOOGLE_CALENDAR_EVENTS_PROVIDER = Symbol(
  'GOOGLE_CALENDAR_EVENTS_PROVIDER',
);

export type SyncConnectionCredentials = {
  id: number;
  access_token: string;
  refresh_token: string | null;
};

export type BookingRow = {
  id: number;
  organization_id: number;
  title: string | null;
  notes: string | null;
  start_time: Date | string;
  end_time: Date | string;
  timezone: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  status: string;
};

export type ExternalCalendarEvent = {
  id: string | null | undefined;
  summary?: string | null;
  description?: string | null;
  start: string | Date | null | undefined;
  end: string | Date | null | undefined;
  timezone?: string;
  attendees?: unknown[];
  htmlLink?: string | null;
  status?: string | null;
  extendedProperties?: {
    private?: Record<string, string> | null;
  } | null;
};

export interface GoogleCalendarEventsProvider {
  listEvents(
    connection: SyncConnectionCredentials,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<ExternalCalendarEvent[]>;
  createEventFromBooking(
    connection: SyncConnectionCredentials,
    booking: BookingRow,
    calendarId: string,
  ): Promise<void>;
  updateEvent(
    connection: SyncConnectionCredentials,
    eventId: string,
    booking: BookingRow,
    calendarId: string,
  ): Promise<void>;
  deleteEvent(
    connection: SyncConnectionCredentials,
    eventId: string,
    calendarId: string,
  ): Promise<void>;
}

export const deterministicGoogleEventId = (
  connectionId: number,
  bookingId: number,
): string =>
  crypto
    .createHash('sha256')
    .update(`itemize:${connectionId}:${bookingId}`)
    .digest('hex');

export const safeProviderError = (error: unknown): string =>
  String(
    (error as { message?: unknown })?.message ||
      error ||
      'Provider operation failed',
  )
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bya29\.[A-Za-z0-9._-]+\b/g, '[redacted-token]')
    .slice(0, 300);

export const zonedDateStart = (
  dateValue: unknown,
  timeZone: string,
): string | unknown => {
  const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue;
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant += target - represented;
  }
  return new Date(instant).toISOString();
};

@Injectable()
export class SdkGoogleCalendarEventsProvider
  implements GoogleCalendarEventsProvider
{
  async listEvents(
    connection: SyncConnectionCredentials,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<ExternalCalendarEvent[]> {
    const api = this.client(connection);
    const events: ExternalCalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const { data } = await api.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
      });
      for (const event of data.items || []) {
        const timeZone = event.start?.timeZone || data.timeZone || 'UTC';
        events.push({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start:
            event.start?.dateTime ||
            (zonedDateStart(event.start?.date, timeZone) as string),
          end:
            event.end?.dateTime ||
            (zonedDateStart(event.end?.date, timeZone) as string),
          timezone: timeZone,
          attendees: event.attendees || [],
          htmlLink: event.htmlLink,
          status: event.status,
          extendedProperties: event.extendedProperties as {
            private?: Record<string, string> | null;
          } | null,
        });
      }
      pageToken = data.nextPageToken ?? undefined;
      if (!pageToken) return events;
    }
    const error = new Error('Calendar event page limit exceeded');
    (error as Error & { code?: string }).code = 'CALENDAR_EVENT_PAGE_LIMIT';
    throw error;
  }

  async createEventFromBooking(
    connection: SyncConnectionCredentials,
    booking: BookingRow,
    calendarId: string,
  ): Promise<void> {
    const api = this.client(connection);
    await api.events.insert({
      calendarId,
      sendUpdates: 'none',
      requestBody: {
        id: deterministicGoogleEventId(connection.id, booking.id),
        summary: booking.title || `Booking with ${booking.attendee_name}`,
        description: booking.notes || 'Booking via Itemize.cloud',
        start: {
          dateTime: new Date(booking.start_time).toISOString(),
          timeZone: booking.timezone ?? undefined,
        },
        end: {
          dateTime: new Date(booking.end_time).toISOString(),
          timeZone: booking.timezone ?? undefined,
        },
        attendees: booking.attendee_email
          ? [{ email: booking.attendee_email }]
          : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
        extendedProperties: {
          private: {
            itemize_booking_id: String(booking.id),
            itemize_organization_id: String(booking.organization_id),
          },
        },
      },
    });
  }

  async updateEvent(
    connection: SyncConnectionCredentials,
    eventId: string,
    booking: BookingRow,
    calendarId: string,
  ): Promise<void> {
    const api = this.client(connection);
    await api.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: booking.title || `Booking with ${booking.attendee_name}`,
        description: booking.notes || 'Booking via Itemize.cloud',
        start: {
          dateTime: new Date(booking.start_time).toISOString(),
          timeZone: booking.timezone ?? undefined,
        },
        end: {
          dateTime: new Date(booking.end_time).toISOString(),
          timeZone: booking.timezone ?? undefined,
        },
      },
    });
  }

  async deleteEvent(
    connection: SyncConnectionCredentials,
    eventId: string,
    calendarId: string,
  ): Promise<void> {
    const api = this.client(connection);
    await api.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'none',
    });
  }

  private client(connection: SyncConnectionCredentials) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured');
    }
    const auth = new OAuth2Client(clientId, clientSecret);
    auth.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token ?? undefined,
    });
    return calendar({ version: 'v3', auth });
  }
}
