import type { Booking, BookingsResponse, JsonRecord } from '@/types';
import type { BookingsQueryParams } from './calendarsApi';
import { graphqlRequest } from './graphqlClient';

type GraphqlBooking = {
  id: number;
  organizationId: number;
  calendarId: number;
  contactId: number | null;
  title: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  status: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  internalNotes: string | null;
  reminderSentAt: string | null;
  customFields: JsonRecord;
  source: string;
  calendarName: string | null;
  calendarColor: string | null;
  calendarSlug: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

const fields = `
  id organizationId calendarId contactId title startTime endTime timezone
  attendeeName attendeeEmail attendeePhone assignedToId assignedToName status
  cancelledAt cancellationReason notes internalNotes reminderSentAt customFields
  source calendarName calendarColor calendarSlug contactFirstName contactLastName
  contactEmail contactPhone createdAt updatedAt
`;

const bookingsQuery = `
  query BookingReads($filter: BookingFilterInput, $page: PageInput) {
    bookings(filter: $filter, page: $page) {
      nodes { ${fields} }
      pageInfo { page pageSize total totalPages }
    }
  }
`;

const bookingQuery = `
  query BookingRead($id: Int!) {
    booking(id: $id) { ${fields} }
  }
`;

const optional = <TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Partial<Record<TKey, TValue>> =>
  value === null ? {} : ({ [key]: value } as Record<TKey, TValue>);

const mapBooking = (booking: GraphqlBooking): Booking => ({
  id: booking.id,
  organization_id: booking.organizationId,
  calendar_id: booking.calendarId,
  ...optional('contact_id', booking.contactId),
  ...optional('title', booking.title),
  start_time: booking.startTime,
  end_time: booking.endTime,
  timezone: booking.timezone,
  ...optional('attendee_name', booking.attendeeName),
  ...optional('attendee_email', booking.attendeeEmail),
  ...optional('attendee_phone', booking.attendeePhone),
  ...optional('assigned_to', booking.assignedToId),
  ...optional('assigned_to_name', booking.assignedToName),
  status: booking.status.toLowerCase() as Booking['status'],
  ...optional('cancelled_at', booking.cancelledAt),
  ...optional('cancellation_reason', booking.cancellationReason),
  ...optional('notes', booking.notes),
  ...optional('internal_notes', booking.internalNotes),
  ...optional('reminder_sent_at', booking.reminderSentAt),
  custom_fields: booking.customFields ?? {},
  source: booking.source as Booking['source'],
  ...optional('calendar_name', booking.calendarName),
  ...optional('calendar_color', booking.calendarColor),
  ...optional('contact_first_name', booking.contactFirstName),
  ...optional('contact_last_name', booking.contactLastName),
  ...optional('contact_email', booking.contactEmail),
  created_at: booking.createdAt,
  updated_at: booking.updatedAt,
});

export const getBookingsViaGraphql = async (
  params: BookingsQueryParams = {},
): Promise<BookingsResponse> => {
  const filter = {
    ...(params.calendar_id === undefined
      ? {}
      : { calendarId: params.calendar_id }),
    ...(params.contact_id === undefined ? {} : { contactId: params.contact_id }),
    ...(params.assigned_to === undefined
      ? {}
      : { assignedToId: params.assigned_to }),
    ...(params.status === undefined
      ? {}
      : { status: params.status.toUpperCase() }),
    ...(params.start_date === undefined ? {} : { startDate: params.start_date }),
    ...(params.end_date === undefined ? {} : { endDate: params.end_date }),
  };
  const page = { page: params.page ?? 1, pageSize: params.limit ?? 50 };
  const data = await graphqlRequest<
    {
      bookings: {
        nodes: GraphqlBooking[];
        pageInfo: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      };
    },
    { filter: typeof filter; page: typeof page }
  >(bookingsQuery, { filter, page }, params.organization_id);

  return {
    bookings: data.bookings.nodes.map(mapBooking),
    pagination: {
      page: data.bookings.pageInfo.page,
      limit: data.bookings.pageInfo.pageSize,
      total: data.bookings.pageInfo.total,
      totalPages: data.bookings.pageInfo.totalPages,
    },
  };
};

export const getBookingViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Booking> => {
  const data = await graphqlRequest<
    { booking: GraphqlBooking },
    { id: number }
  >(bookingQuery, { id }, organizationId);
  return mapBooking(data.booking);
};
