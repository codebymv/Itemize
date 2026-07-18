import type {
  AvailabilityWindow,
  Calendar,
  CalendarDateOverride,
  CalendarsResponse,
} from '@/types';
import type { CalendarCreateData } from './calendarsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlAvailabilityWindow = {
  id: number;
  calendarId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
};

type GraphqlCalendarDateOverride = {
  id: number;
  calendarId: number;
  overrideDate: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: string;
};

type GraphqlCalendar = {
  id: number;
  organizationId: number;
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
  assignedToName: string | null;
  assignmentMode: 'specific' | 'round_robin';
  confirmationEmail: boolean;
  reminderEmail: boolean;
  reminderHours: number;
  color: string;
  isActive: boolean;
  createdById: number | null;
  upcomingBookings: number | null;
  availabilityWindows?: GraphqlAvailabilityWindow[];
  dateOverrides?: GraphqlCalendarDateOverride[];
  createdAt: string;
  updatedAt: string;
};

const calendarFields = `
  id
  organizationId
  name
  description
  slug
  timezone
  durationMinutes
  bufferBeforeMinutes
  bufferAfterMinutes
  minNoticeHours
  maxFutureDays
  assignedToId
  assignedToName
  assignmentMode
  confirmationEmail
  reminderEmail
  reminderHours
  color
  isActive
  createdById
  upcomingBookings
  createdAt
  updatedAt
`;

const calendarsQuery = `
  query CalendarReads {
    calendars { ${calendarFields} }
  }
`;

const calendarQuery = `
  query CalendarRead($id: Int!) {
    calendar(id: $id) {
      ${calendarFields}
      availabilityWindows {
        id
        calendarId
        dayOfWeek
        startTime
        endTime
        isActive
        createdAt
      }
      dateOverrides {
        id
        calendarId
        overrideDate
        isAvailable
        startTime
        endTime
        reason
        createdAt
      }
    }
  }
`;

const calendarDetailFields = `
  ${calendarFields}
  availabilityWindows {
    id
    calendarId
    dayOfWeek
    startTime
    endTime
    isActive
    createdAt
  }
  dateOverrides {
    id
    calendarId
    overrideDate
    isAvailable
    startTime
    endTime
    reason
    createdAt
  }
`;

const createCalendarMutation = `
  mutation CreateCalendar($input: CreateCalendarInput!) {
    createCalendar(input: $input) { ${calendarDetailFields} }
  }
`;

const updateCalendarMutation = `
  mutation UpdateCalendar($id: Int!, $input: UpdateCalendarInput!) {
    updateCalendar(id: $id, input: $input) { ${calendarDetailFields} }
  }
`;

const mapAvailabilityWindow = (
  window: GraphqlAvailabilityWindow,
): AvailabilityWindow => ({
  id: window.id,
  calendar_id: window.calendarId,
  day_of_week: window.dayOfWeek,
  start_time: window.startTime,
  end_time: window.endTime,
  is_active: window.isActive,
  created_at: window.createdAt,
});

const mapDateOverride = (
  override: GraphqlCalendarDateOverride,
): CalendarDateOverride => ({
  id: override.id,
  calendar_id: override.calendarId,
  override_date: override.overrideDate,
  is_available: override.isAvailable,
  ...(override.startTime === null ? {} : { start_time: override.startTime }),
  ...(override.endTime === null ? {} : { end_time: override.endTime }),
  ...(override.reason === null ? {} : { reason: override.reason }),
  created_at: override.createdAt,
});

const mapCalendar = (calendar: GraphqlCalendar): Calendar => ({
  id: calendar.id,
  organization_id: calendar.organizationId,
  name: calendar.name,
  ...(calendar.description === null ? {} : { description: calendar.description }),
  slug: calendar.slug,
  timezone: calendar.timezone,
  duration_minutes: calendar.durationMinutes,
  buffer_before_minutes: calendar.bufferBeforeMinutes,
  buffer_after_minutes: calendar.bufferAfterMinutes,
  min_notice_hours: calendar.minNoticeHours,
  max_future_days: calendar.maxFutureDays,
  ...(calendar.assignedToId === null
    ? {}
    : { assigned_to: calendar.assignedToId }),
  ...(calendar.assignedToName === null
    ? {}
    : { assigned_to_name: calendar.assignedToName }),
  assignment_mode: calendar.assignmentMode,
  confirmation_email: calendar.confirmationEmail,
  reminder_email: calendar.reminderEmail,
  reminder_hours: calendar.reminderHours,
  color: calendar.color,
  is_active: calendar.isActive,
  ...(calendar.createdById === null
    ? {}
    : { created_by: calendar.createdById }),
  ...(calendar.upcomingBookings === null
    ? {}
    : { upcoming_bookings: calendar.upcomingBookings }),
  ...(calendar.availabilityWindows === undefined
    ? {}
    : {
        availability_windows:
          calendar.availabilityWindows.map(mapAvailabilityWindow),
      }),
  ...(calendar.dateOverrides === undefined
    ? {}
    : { date_overrides: calendar.dateOverrides.map(mapDateOverride) }),
  created_at: calendar.createdAt,
  updated_at: calendar.updatedAt,
});

export const getCalendarsViaGraphql = async (
  organizationId?: number,
): Promise<CalendarsResponse> => {
  const data = await graphqlRequest<
    { calendars: GraphqlCalendar[] },
    Record<string, never>
  >(calendarsQuery, {}, organizationId);
  return { calendars: data.calendars.map(mapCalendar) };
};

export const getCalendarViaGraphql = async (
  id: number,
  organizationId?: number,
): Promise<Calendar> => {
  const data = await graphqlRequest<
    { calendar: GraphqlCalendar },
    { id: number }
  >(calendarQuery, { id }, organizationId);
  return mapCalendar(data.calendar);
};

const has = <T extends object>(value: T, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const calendarInput = (
  data: Partial<CalendarCreateData>,
): Record<string, unknown> => ({
  ...(has(data, 'name') && data.name !== undefined ? { name: data.name } : {}),
  ...(has(data, 'description') && data.description !== undefined
    ? { description: data.description }
    : {}),
  ...(has(data, 'timezone') && data.timezone !== undefined
    ? { timezone: data.timezone }
    : {}),
  ...(has(data, 'duration_minutes') && data.duration_minutes !== undefined
    ? { durationMinutes: data.duration_minutes }
    : {}),
  ...(has(data, 'buffer_before_minutes') &&
  data.buffer_before_minutes !== undefined
    ? { bufferBeforeMinutes: data.buffer_before_minutes }
    : {}),
  ...(has(data, 'buffer_after_minutes') &&
  data.buffer_after_minutes !== undefined
    ? { bufferAfterMinutes: data.buffer_after_minutes }
    : {}),
  ...(has(data, 'min_notice_hours') && data.min_notice_hours !== undefined
    ? { minNoticeHours: data.min_notice_hours }
    : {}),
  ...(has(data, 'max_future_days') && data.max_future_days !== undefined
    ? { maxFutureDays: data.max_future_days }
    : {}),
  ...(has(data, 'assigned_to') && data.assigned_to !== undefined
    ? { assignedToId: data.assigned_to }
    : {}),
  ...(has(data, 'assignment_mode') && data.assignment_mode !== undefined
    ? { assignmentMode: data.assignment_mode }
    : {}),
  ...(has(data, 'confirmation_email') && data.confirmation_email !== undefined
    ? { confirmationEmail: data.confirmation_email }
    : {}),
  ...(has(data, 'reminder_email') && data.reminder_email !== undefined
    ? { reminderEmail: data.reminder_email }
    : {}),
  ...(has(data, 'reminder_hours') && data.reminder_hours !== undefined
    ? { reminderHours: data.reminder_hours }
    : {}),
  ...(has(data, 'color') && data.color !== undefined
    ? { color: data.color }
    : {}),
  ...(has(data, 'is_active') && data.is_active !== undefined
    ? { isActive: data.is_active }
    : {}),
  ...(has(data, 'availability_windows') &&
  data.availability_windows !== undefined
    ? {
        availabilityWindows: data.availability_windows.map((window) => ({
          dayOfWeek: window.day_of_week,
          startTime: window.start_time,
          endTime: window.end_time,
          ...(window.is_active === undefined
            ? {}
            : { isActive: window.is_active }),
        })),
      }
    : {}),
});

export const createCalendarViaGraphql = async (
  data: CalendarCreateData,
): Promise<Calendar> => {
  const response = await graphqlMutationRequest<
    { createCalendar: GraphqlCalendar },
    { input: Record<string, unknown> }
  >(
    createCalendarMutation,
    { input: calendarInput(data) },
    data.organization_id,
  );
  return mapCalendar(response.createCalendar);
};

export const updateCalendarViaGraphql = async (
  id: number,
  data: Partial<CalendarCreateData>,
  organizationId?: number,
): Promise<Calendar> => {
  const response = await graphqlMutationRequest<
    { updateCalendar: GraphqlCalendar },
    { id: number; input: Record<string, unknown> }
  >(
    updateCalendarMutation,
    { id, input: calendarInput(data) },
    organizationId,
  );
  return mapCalendar(response.updateCalendar);
};
