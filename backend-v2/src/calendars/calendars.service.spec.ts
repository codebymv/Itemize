import {
  AvailabilityWindowRow,
  CalendarDateOverrideRow,
  CalendarRow,
  CalendarsRepository,
} from './calendars.repository';
import { CalendarsService } from './calendars.service';

const calendarRow = (values: Partial<CalendarRow> = {}): CalendarRow => ({
  id: 4,
  organization_id: 3,
  name: 'Consultation',
  description: null,
  slug: 'consultation-test',
  timezone: 'America/Phoenix',
  duration_minutes: 30,
  buffer_before_minutes: 5,
  buffer_after_minutes: 10,
  min_notice_hours: 24,
  max_future_days: 60,
  assigned_to: 7,
  assigned_to_name: 'Calendar Owner',
  assignment_mode: 'specific',
  confirmation_email: true,
  reminder_email: true,
  reminder_hours: 24,
  color: '#3B82F6',
  is_active: true,
  created_by: 7,
  upcoming_bookings: 2,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  updated_at: new Date('2026-07-18T12:01:00.000Z'),
  ...values,
});

const availabilityRow = (
  values: Partial<AvailabilityWindowRow> = {},
): AvailabilityWindowRow => ({
  id: 8,
  calendar_id: 4,
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '17:00:00',
  is_active: true,
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  ...values,
});

const overrideRow = (
  values: Partial<CalendarDateOverrideRow> = {},
): CalendarDateOverrideRow => ({
  id: 9,
  calendar_id: 4,
  override_date: '2026-08-01',
  is_available: false,
  start_time: null,
  end_time: null,
  reason: 'Closed',
  created_at: new Date('2026-07-18T12:00:00.000Z'),
  ...values,
});

describe('CalendarsService', () => {
  let repository: jest.Mocked<CalendarsRepository>;
  let service: CalendarsService;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<CalendarsRepository>;
    service = new CalendarsService(repository);
  });

  it('maps bounded organization calendar list rows', async () => {
    repository.findAll.mockResolvedValue([calendarRow()]);

    await expect(service.list(3)).resolves.toEqual([
      expect.objectContaining({
        id: 4,
        organizationId: 3,
        assignedToId: 7,
        assignedToName: 'Calendar Owner',
        upcomingBookings: 2,
        availabilityWindows: [],
        dateOverrides: [],
      }),
    ]);
    expect(repository.findAll).toHaveBeenCalledWith(3);
  });

  it('maps availability and future date overrides for detail', async () => {
    repository.findById.mockResolvedValue({
      calendar: calendarRow(),
      availabilityWindows: [availabilityRow()],
      dateOverrides: [overrideRow()],
    });

    await expect(service.get(3, 4)).resolves.toEqual(
      expect.objectContaining({
        availabilityWindows: [
          expect.objectContaining({
            calendarId: 4,
            dayOfWeek: 1,
            startTime: '09:00:00',
          }),
        ],
        dateOverrides: [
          expect.objectContaining({
            calendarId: 4,
            overrideDate: '2026-08-01',
            isAvailable: false,
            reason: 'Closed',
          }),
        ],
      }),
    );
  });

  it('returns stable input and concealment errors', async () => {
    await expect(service.get(3, 0)).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_CALENDAR_ID',
      },
    });

    repository.findById.mockResolvedValue(null);
    await expect(service.get(3, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
