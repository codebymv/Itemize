import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken } from '@/lib/api';
import {
  cancelBookingViaGraphql,
  createBookingViaGraphql,
  getBookingViaGraphql,
  getBookingsViaGraphql,
  rescheduleBookingViaGraphql,
} from './bookingsGraphql';
import {
  isBookingGraphqlMutationsEnabled,
  isBookingGraphqlReadsEnabled,
  isBookingSchedulingGraphqlMutationsEnabled,
} from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const booking = {
  id: 91,
  organizationId: 42,
  calendarId: 17,
  contactId: 11,
  title: 'Consultation',
  startTime: '2026-08-01T17:00:00.000Z',
  endTime: '2026-08-01T17:30:00.000Z',
  timezone: 'America/Phoenix',
  attendeeName: 'Ada Lovelace',
  attendeeEmail: 'ada@example.com',
  attendeePhone: null,
  assignedToId: 7,
  assignedToName: 'Owner',
  status: 'CONFIRMED',
  cancelledAt: null,
  cancellationReason: null,
  notes: null,
  internalNotes: 'Prepared',
  reminderSentAt: null,
  customFields: { channel: 'partner' },
  source: 'manual',
  calendarName: 'Consultations',
  calendarColor: '#3B82F6',
  calendarSlug: 'consultations',
  contactFirstName: 'Ada',
  contactLastName: 'Lovelace',
  contactEmail: 'ada@example.com',
  contactPhone: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T01:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('booking GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('booking-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps authenticated booking reads disabled by default', () => {
    vi.stubEnv('VITE_BOOKING_READS_GRAPHQL', 'false');
    expect(isBookingGraphqlReadsEnabled()).toBe(false);
    vi.stubEnv('VITE_BOOKING_READS_GRAPHQL', 'true');
    expect(isBookingGraphqlReadsEnabled()).toBe(true);
  });

  it('keeps authenticated booking cancellation independently disabled by default', () => {
    vi.stubEnv('VITE_BOOKING_MUTATIONS_GRAPHQL', 'false');
    expect(isBookingGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_BOOKING_MUTATIONS_GRAPHQL', 'true');
    expect(isBookingGraphqlMutationsEnabled()).toBe(true);
  });

  it('keeps authenticated booking scheduling mutations independently disabled by default', () => {
    vi.stubEnv('VITE_BOOKING_SCHEDULING_MUTATIONS_GRAPHQL', 'false');
    expect(isBookingSchedulingGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_BOOKING_SCHEDULING_MUTATIONS_GRAPHQL', 'true');
    expect(isBookingSchedulingGraphqlMutationsEnabled()).toBe(true);
  });

  it('maps filters, stable paging, joined fields, and retained shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        data: {
          bookings: {
            nodes: [booking],
            pageInfo: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
          },
        },
      }),
    );

    await expect(
      getBookingsViaGraphql({
        calendar_id: 17,
        assigned_to: 7,
        status: 'confirmed',
        start_date: '2026-08-01T00:00:00.000Z',
        end_date: '2026-08-31T23:59:59.999Z',
        page: 2,
        limit: 10,
        organization_id: 42,
      }),
    ).resolves.toEqual({
      bookings: [
        expect.objectContaining({
          id: 91,
          organization_id: 42,
          status: 'confirmed',
          calendar_name: 'Consultations',
          contact_email: 'ada@example.com',
          custom_fields: { channel: 'partner' },
        }),
      ],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    });
    const request = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(request.variables).toEqual({
      filter: {
        calendarId: 17,
        assignedToId: 7,
        status: 'CONFIRMED',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T23:59:59.999Z',
      },
      page: { page: 2, pageSize: 10 },
    });
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ 'x-organization-id': '42' }),
    });
  });

  it('maps a tenant-scoped detail without exposing cancellation capability', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { booking } }),
    );
    const result = await getBookingViaGraphql(91, 42);
    expect(result).toMatchObject({
      id: 91,
      internal_notes: 'Prepared',
      assigned_to_name: 'Owner',
    });
    expect(result).not.toHaveProperty('cancellation_token');
    const request = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(request.variables).toEqual({ id: 91 });
  });

  it('cancels through the CSRF-protected mutation and retains the booking shape', async () => {
    const cancelled = {
      ...booking,
      status: 'CANCELLED',
      cancelledAt: '2026-07-19T01:00:00.000Z',
      cancellationReason: 'Admin request',
    };
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { cancelBooking: cancelled } }),
    );

    await expect(
      cancelBookingViaGraphql(91, 'Admin request', 42),
    ).resolves.toMatchObject({
      id: 91,
      status: 'cancelled',
      cancelled_at: '2026-07-19T01:00:00.000Z',
      cancellation_reason: 'Admin request',
    });
    expect(fetchCsrfToken).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-csrf-token': 'booking-csrf',
      'x-organization-id': '42',
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      variables: { id: 91, reason: 'Admin request' },
    });
  });

  it('creates through a CSRF-protected mutation with retained input mapping', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { createBooking: booking } }),
    );
    const input = {
      calendar_id: 17,
      contact_id: 11,
      title: 'Consultation',
      start_time: '2026-08-01T17:00:00.000Z',
      end_time: '2026-08-01T17:30:00.000Z',
      timezone: 'America/Phoenix',
      attendee_name: 'Ada Lovelace',
      attendee_email: 'ada@example.com',
      attendee_phone: '520-555-0100',
      assigned_to: 7,
      notes: 'Client note',
      internal_notes: 'Prepared',
      custom_fields: { channel: 'partner' },
      organization_id: 42,
    };

    await expect(createBookingViaGraphql(input)).resolves.toMatchObject({
      id: 91,
      organization_id: 42,
      source: 'manual',
    });
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-csrf-token': 'booking-csrf',
      'x-organization-id': '42',
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      variables: {
        input: {
          calendarId: 17,
          contactId: 11,
          title: 'Consultation',
          startTime: '2026-08-01T17:00:00.000Z',
          endTime: '2026-08-01T17:30:00.000Z',
          timezone: 'America/Phoenix',
          attendeeName: 'Ada Lovelace',
          attendeeEmail: 'ada@example.com',
          attendeePhone: '520-555-0100',
          assignedToId: 7,
          notes: 'Client note',
          internalNotes: 'Prepared',
          customFields: { channel: 'partner' },
        },
      },
    });
  });

  it('reschedules through a CSRF-protected mutation and omits absent timezone', async () => {
    const rescheduled = {
      ...booking,
      startTime: '2026-08-02T17:00:00.000Z',
      endTime: '2026-08-02T17:30:00.000Z',
    };
    vi.mocked(fetch).mockResolvedValue(
      response({ data: { rescheduleBooking: rescheduled } }),
    );

    await expect(
      rescheduleBookingViaGraphql(
        91,
        {
          start_time: '2026-08-02T17:00:00.000Z',
          end_time: '2026-08-02T17:30:00.000Z',
        },
        42,
      ),
    ).resolves.toMatchObject({
      id: 91,
      start_time: '2026-08-02T17:00:00.000Z',
      end_time: '2026-08-02T17:30:00.000Z',
    });
    expect(
      JSON.parse(
        String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
      ).variables,
    ).toEqual({
      id: 91,
      input: {
        startTime: '2026-08-02T17:00:00.000Z',
        endTime: '2026-08-02T17:30:00.000Z',
      },
    });
  });
});
