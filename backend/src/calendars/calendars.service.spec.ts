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
  public_id: 'cal_1234567890abcdef1234567890abcdef',
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
      create: jest.fn(),
      delete: jest.fn(),
      deleteDateOverride: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      replaceAvailability: jest.fn(),
      update: jest.fn(),
      upsertDateOverride: jest.fn(),
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

  it('normalizes create defaults and recurring availability before persistence', async () => {
    repository.create.mockImplementation(
      async (_organizationId, _userId, values) => ({
        kind: 'created',
        value: {
          calendar: calendarRow({
            name: values.name,
            description: values.description,
            slug: values.slug,
            timezone: values.timezone,
            assigned_to: values.assignedToId,
            assignment_mode: values.assignmentMode,
            color: values.color,
          }),
          availabilityWindows: values.availabilityWindows.map((window, index) =>
            availabilityRow({
              id: index + 1,
              day_of_week: window.dayOfWeek,
              start_time: window.startTime,
              end_time: window.endTime,
              is_active: window.isActive,
            }),
          ),
          dateOverrides: [],
        },
      }),
    );

    await service.create(3, 7, {
      name: '  Consultation  ',
      color: '#aabbcc',
    });

    expect(repository.create).toHaveBeenCalledWith(
      3,
      7,
      expect.objectContaining({
        name: 'Consultation',
        timezone: 'America/New_York',
        assignedToId: 7,
        assignmentMode: 'specific',
        color: '#AABBCC',
        availabilityWindows: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '09:00:00',
          endTime: '17:00:00',
          isActive: true,
        })),
      }),
    );
  });

  it('rejects invalid create windows before writing', async () => {
    await expect(
      service.create(3, 7, {
        name: 'Overlap',
        availabilityWindows: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '11:00', endTime: '13:00' },
        ],
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'OVERLAPPING_WINDOWS',
      },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('preserves update omission and returns stable assignment errors', async () => {
    repository.update.mockResolvedValueOnce({
      kind: 'updated',
      value: {
        calendar: calendarRow({
          description: null,
          assigned_to: null,
          assigned_to_name: null,
          assignment_mode: 'round_robin',
        }),
        availabilityWindows: [],
        dateOverrides: [],
      },
    });
    await service.update(3, 4, {
      description: null,
      assignedToId: null,
      assignmentMode: 'round_robin',
    });
    expect(repository.update).toHaveBeenCalledWith(3, 4, {
      description: null,
      assignedToId: null,
      assignmentMode: 'round_robin',
    });

    repository.update.mockResolvedValueOnce({ kind: 'invalid_assignee' });
    await expect(
      service.update(3, 4, { assignedToId: 99 }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'INVALID_ASSIGNEE',
      },
    });
  });

  it('deletes an owned calendar and returns stable concealment and booking errors', async () => {
    repository.delete.mockResolvedValueOnce({ kind: 'deleted' });
    await expect(service.delete(3, 4)).resolves.toBe(true);
    expect(repository.delete).toHaveBeenCalledWith(3, 4);

    repository.delete.mockResolvedValueOnce({ kind: 'not_found' });
    await expect(service.delete(3, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });

    repository.delete.mockResolvedValueOnce({ kind: 'upcoming_bookings' });
    await expect(service.delete(3, 4)).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'UPCOMING_BOOKINGS',
      },
    });
  });

  it('validates, sorts, and replaces recurring availability', async () => {
    repository.replaceAvailability.mockImplementation(
      async (_organizationId, _calendarId, windows) => ({
        kind: 'updated',
        value: windows.map((window, index) =>
          availabilityRow({
            id: index + 20,
            day_of_week: window.dayOfWeek,
            start_time: window.startTime,
            end_time: window.endTime,
            is_active: window.isActive,
          }),
        ),
      }),
    );

    await expect(
      service.replaceAvailability(3, 4, [
        { dayOfWeek: 5, startTime: '13:30', endTime: '17:00' },
        {
          dayOfWeek: 1,
          startTime: '08:00:00',
          endTime: '12:00:00',
          isActive: false,
        },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        dayOfWeek: 1,
        startTime: '08:00:00',
        isActive: false,
      }),
      expect.objectContaining({
        dayOfWeek: 5,
        startTime: '13:30:00',
        isActive: true,
      }),
    ]);
    expect(repository.replaceAvailability).toHaveBeenCalledWith(3, 4, [
      {
        dayOfWeek: 1,
        startTime: '08:00:00',
        endTime: '12:00:00',
        isActive: false,
      },
      {
        dayOfWeek: 5,
        startTime: '13:30:00',
        endTime: '17:00:00',
        isActive: true,
      },
    ]);
  });

  it('rejects invalid replacement windows before deleting the current schedule', async () => {
    await expect(
      service.replaceAvailability(3, 4, [
        { dayOfWeek: 2, startTime: '09:00', endTime: '12:00' },
        { dayOfWeek: 2, startTime: '11:59', endTime: '13:00' },
      ]),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'OVERLAPPING_WINDOWS',
      },
    });
    expect(repository.replaceAvailability).not.toHaveBeenCalled();
  });

  it('normalizes available and unavailable date overrides', async () => {
    repository.upsertDateOverride
      .mockResolvedValueOnce({
        kind: 'updated',
        value: overrideRow({
          is_available: true,
          start_time: '10:00:00',
          end_time: '14:30:00',
          reason: 'Extended hours',
        }),
      })
      .mockResolvedValueOnce({
        kind: 'updated',
        value: overrideRow({
          is_available: false,
          start_time: null,
          end_time: null,
          reason: null,
        }),
      });

    await service.upsertDateOverride(3, 4, {
      overrideDate: '2026-08-01',
      isAvailable: true,
      startTime: '10:00',
      endTime: '14:30',
      reason: '  Extended hours  ',
    });
    expect(repository.upsertDateOverride).toHaveBeenNthCalledWith(1, 3, 4, {
      overrideDate: '2026-08-01',
      isAvailable: true,
      startTime: '10:00:00',
      endTime: '14:30:00',
      reason: 'Extended hours',
    });

    await service.upsertDateOverride(3, 4, {
      overrideDate: '2026-08-01',
    });
    expect(repository.upsertDateOverride).toHaveBeenNthCalledWith(2, 3, 4, {
      overrideDate: '2026-08-01',
      isAvailable: false,
      startTime: null,
      endTime: null,
      reason: null,
    });
  });

  it('rejects invalid override dates and window combinations before writing', async () => {
    await expect(
      service.upsertDateOverride(3, 4, {
        overrideDate: '2026-02-30',
      }),
    ).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_DATE' },
    });
    await expect(
      service.upsertDateOverride(3, 4, {
        overrideDate: '2026-08-01',
        isAvailable: true,
        startTime: '10:00',
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'OVERRIDE_WINDOW_REQUIRED',
      },
    });
    await expect(
      service.upsertDateOverride(3, 4, {
        overrideDate: '2026-08-01',
        startTime: '10:00',
        endTime: '11:00',
      }),
    ).rejects.toMatchObject({
      extensions: {
        code: 'BAD_USER_INPUT',
        reason: 'UNAVAILABLE_OVERRIDE_WINDOW',
      },
    });
    expect(repository.upsertDateOverride).not.toHaveBeenCalled();
  });

  it('conceals missing availability and override targets', async () => {
    repository.replaceAvailability.mockResolvedValue({ kind: 'not_found' });
    await expect(service.replaceAvailability(3, 999, [])).rejects.toMatchObject(
      {
        extensions: { code: 'NOT_FOUND' },
      },
    );

    repository.deleteDateOverride.mockResolvedValue({ kind: 'not_found' });
    await expect(service.deleteDateOverride(3, 4, 999)).rejects.toMatchObject({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
