import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  addDateOverride,
  cancelBooking,
  createBooking,
  createCalendar,
  deleteCalendar,
  getBooking,
  getBookings,
  getCalendar,
  getCalendars,
  removeDateOverride,
  rescheduleBooking,
  submitPublicBooking,
  updateCalendar,
  updateCalendarAvailability,
} from './calendarsApi';
import {
  createCalendarViaGraphql,
  deleteCalendarViaGraphql,
  deleteCalendarDateOverrideViaGraphql,
  getCalendarViaGraphql,
  getCalendarsViaGraphql,
  replaceCalendarAvailabilityViaGraphql,
  upsertCalendarDateOverrideViaGraphql,
  updateCalendarViaGraphql,
} from './calendarsGraphql';
import {
  cancelBookingViaGraphql,
  createBookingViaGraphql,
  getBookingViaGraphql,
  getBookingsViaGraphql,
  rescheduleBookingViaGraphql,
} from './bookingsGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./bookingsGraphql', () => ({
  cancelBookingViaGraphql: vi.fn(),
  createBookingViaGraphql: vi.fn(),
  getBookingViaGraphql: vi.fn(),
  getBookingsViaGraphql: vi.fn(),
  rescheduleBookingViaGraphql: vi.fn(),
}));

vi.mock('./calendarsGraphql', () => ({
  createCalendarViaGraphql: vi.fn(),
  deleteCalendarViaGraphql: vi.fn(),
  deleteCalendarDateOverrideViaGraphql: vi.fn(),
  getCalendarViaGraphql: vi.fn(),
  getCalendarsViaGraphql: vi.fn(),
  replaceCalendarAvailabilityViaGraphql: vi.fn(),
  upsertCalendarDateOverrideViaGraphql: vi.fn(),
  updateCalendarViaGraphql: vi.fn(),
}));

const calendar = {
  id: 4,
  organization_id: 3,
  name: 'Consultation',
  slug: 'consultation-test',
  public_id: 'cal_1234567890abcdef1234567890abcdef',
  timezone: 'America/Phoenix',
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  min_notice_hours: 24,
  max_future_days: 60,
  assignment_mode: 'specific' as const,
  confirmation_email: true,
  reminder_email: true,
  reminder_hours: 24,
  color: '#3B82F6',
  is_active: true,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

const booking = {
  id: 9,
  organization_id: 3,
  calendar_id: 4,
  start_time: '2026-08-01T17:00:00.000Z',
  end_time: '2026-08-01T17:30:00.000Z',
  timezone: 'America/Phoenix',
  status: 'confirmed' as const,
  custom_fields: {},
  source: 'manual' as const,
  created_at: '2026-07-18T12:00:00.000Z',
  updated_at: '2026-07-18T12:01:00.000Z',
};

describe('calendar API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes list and detail reads through GraphQL', async () => {
    vi.mocked(getCalendarsViaGraphql).mockResolvedValue({
      calendars: [calendar],
    });
    vi.mocked(getCalendarViaGraphql).mockResolvedValue(calendar);

    await getCalendars(3);
    await getCalendar(4, 3);

    expect(getCalendarsViaGraphql).toHaveBeenCalledWith(3);
    expect(getCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('routes definition writes through GraphQL', async () => {
    vi.mocked(createCalendarViaGraphql).mockResolvedValue(calendar);
    vi.mocked(updateCalendarViaGraphql).mockResolvedValue(calendar);

    const createInput = { name: 'Consultation', organization_id: 3 };
    const updateInput = { name: 'Renamed' };
    await createCalendar(createInput, 'calendar-create-key');
    await updateCalendar(4, updateInput, 3);
    await deleteCalendar(4, 3);

    expect(createCalendarViaGraphql).toHaveBeenCalledWith(
      createInput,
      'calendar-create-key',
    );
    expect(updateCalendarViaGraphql).toHaveBeenCalledWith(4, updateInput, 3);
    expect(deleteCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('routes availability and override writes through GraphQL', async () => {
    vi.mocked(replaceCalendarAvailabilityViaGraphql).mockResolvedValue({
      availability_windows: [],
    });
    vi.mocked(upsertCalendarDateOverrideViaGraphql).mockResolvedValue({
      id: 8,
      calendar_id: 4,
      override_date: '2026-08-01',
      is_available: false,
      created_at: '2026-07-18T12:00:00.000Z',
    });

    const overrideInput = {
      override_date: '2026-08-01',
      is_available: false,
      reason: 'Closed',
    };
    await updateCalendarAvailability(4, [], 3);
    await addDateOverride(4, overrideInput, 3);
    await removeDateOverride(4, 8, 3);
    await deleteCalendar(4, 3);

    expect(replaceCalendarAvailabilityViaGraphql).toHaveBeenCalledWith(
      4,
      [],
      3,
    );
    expect(upsertCalendarDateOverrideViaGraphql).toHaveBeenCalledWith(
      4,
      overrideInput,
      3,
    );
    expect(deleteCalendarDateOverrideViaGraphql).toHaveBeenCalledWith(
      4,
      8,
      3,
    );
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(deleteCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('routes authenticated booking reads through GraphQL', async () => {
    vi.mocked(getBookingsViaGraphql).mockResolvedValue({
      bookings: [booking],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    vi.mocked(getBookingViaGraphql).mockResolvedValue(booking);

    const params = { organization_id: 3, status: 'confirmed' as const };
    await getBookings(params);
    await getBooking(9, 3);

    expect(getBookingsViaGraphql).toHaveBeenCalledWith(params);
    expect(getBookingViaGraphql).toHaveBeenCalledWith(9, 3);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('routes authenticated cancellation through GraphQL', async () => {
    const cancelled = { ...booking, status: 'cancelled' as const };
    vi.mocked(cancelBookingViaGraphql).mockResolvedValue(cancelled);
    await expect(cancelBooking(9, 'GraphQL request', 3)).resolves.toEqual(cancelled);
    expect(cancelBookingViaGraphql).toHaveBeenCalledWith(
      9,
      'GraphQL request',
      3,
    );
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('routes authenticated create and reschedule through GraphQL', async () => {
    const createInput = {
      calendar_id: 4,
      start_time: '2026-08-01T17:00:00.000Z',
      end_time: '2026-08-01T17:30:00.000Z',
      organization_id: 3,
    };
    const rescheduleInput = {
      start_time: '2026-08-02T17:00:00.000Z',
      end_time: '2026-08-02T17:30:00.000Z',
    };
    vi.mocked(createBookingViaGraphql).mockResolvedValue(booking);
    vi.mocked(rescheduleBookingViaGraphql).mockResolvedValue(booking);
    await createBooking(createInput);
    await rescheduleBooking(9, rescheduleInput, 3);

    expect(createBookingViaGraphql).toHaveBeenCalledWith(createInput);
    expect(rescheduleBookingViaGraphql).toHaveBeenCalledWith(
      9,
      rescheduleInput,
      3,
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('submits public bookings with durable replay metadata', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: true, booking, message: 'Confirmed' },
    });
    const input = {
      start_time: booking.start_time,
      end_time: booking.end_time,
      attendee_name: 'Maya Patel',
      attendee_email: 'maya@example.test',
    };

    await submitPublicBooking('cal_public', input, 'booking-request-1');

    expect(api.post).toHaveBeenCalledWith(
      '/api/bookings/public/book/cal_public',
      input,
      {
        headers: { 'Idempotency-Key': 'booking-request-1' },
        retryOnNetworkError: true,
      },
    );
  });
});
