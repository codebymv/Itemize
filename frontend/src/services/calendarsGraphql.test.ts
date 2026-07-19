import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  isCalendarGraphqlAvailabilityMutationsEnabled,
  isCalendarGraphqlMutationsEnabled,
  isCalendarGraphqlReadsEnabled,
} from './graphqlClient';
import { fetchCsrfToken } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const calendar = {
  id: 4,
  organizationId: 3,
  name: 'Consultation',
  description: null,
  slug: 'consultation-test',
  timezone: 'America/Phoenix',
  durationMinutes: 30,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  minNoticeHours: 24,
  maxFutureDays: 60,
  assignedToId: 7,
  assignedToName: 'Calendar Owner',
  assignmentMode: 'specific',
  confirmationEmail: true,
  reminderEmail: true,
  reminderHours: 24,
  color: '#3B82F6',
  isActive: true,
  createdById: 7,
  upcomingBookings: 2,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:01:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('calendar GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('calendar-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps calendar reads on REST by default', () => {
    vi.stubEnv('VITE_CALENDAR_READS_GRAPHQL', 'false');
    expect(isCalendarGraphqlReadsEnabled()).toBe(false);
    vi.stubEnv('VITE_CALENDAR_READS_GRAPHQL', 'true');
    expect(isCalendarGraphqlReadsEnabled()).toBe(true);
    vi.stubEnv('VITE_CALENDAR_MUTATIONS_GRAPHQL', 'false');
    expect(isCalendarGraphqlMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_CALENDAR_MUTATIONS_GRAPHQL', 'true');
    expect(isCalendarGraphqlMutationsEnabled()).toBe(true);
    vi.stubEnv('VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL', 'false');
    expect(isCalendarGraphqlAvailabilityMutationsEnabled()).toBe(false);
    vi.stubEnv('VITE_CALENDAR_AVAILABILITY_MUTATIONS_GRAPHQL', 'true');
    expect(isCalendarGraphqlAvailabilityMutationsEnabled()).toBe(true);
  });

  it('maps list fields into the retained REST response shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { calendars: [calendar] } }),
    );

    await expect(getCalendarsViaGraphql(3)).resolves.toEqual({
      calendars: [
        {
          id: 4,
          organization_id: 3,
          name: 'Consultation',
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
          created_at: calendar.createdAt,
          updated_at: calendar.updatedAt,
        },
      ],
    });
  });

  it('maps detail availability and date overrides without GraphQL casing leaks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          calendar: {
            ...calendar,
            availabilityWindows: [
              {
                id: 8,
                calendarId: 4,
                dayOfWeek: 1,
                startTime: '09:00:00',
                endTime: '17:00:00',
                isActive: true,
                createdAt: calendar.createdAt,
              },
            ],
            dateOverrides: [
              {
                id: 9,
                calendarId: 4,
                overrideDate: '2026-08-01',
                isAvailable: false,
                startTime: null,
                endTime: null,
                reason: 'Closed',
                createdAt: calendar.createdAt,
              },
            ],
          },
        },
      }),
    );

    await expect(getCalendarViaGraphql(4, 3)).resolves.toEqual(
      expect.objectContaining({
        availability_windows: [
          {
            id: 8,
            calendar_id: 4,
            day_of_week: 1,
            start_time: '09:00:00',
            end_time: '17:00:00',
            is_active: true,
            created_at: calendar.createdAt,
          },
        ],
        date_overrides: [
          {
            id: 9,
            calendar_id: 4,
            override_date: '2026-08-01',
            is_available: false,
            reason: 'Closed',
            created_at: calendar.createdAt,
          },
        ],
      }),
    );
    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(body.variables).toEqual({ id: 4 });
  });

  it('creates through a CSRF-protected mutation and maps availability input casing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          createCalendar: {
            ...calendar,
            availabilityWindows: [],
            dateOverrides: [],
          },
        },
      }),
    );

    await expect(
      createCalendarViaGraphql({
        name: 'Consultation',
        description: null,
        duration_minutes: 45,
        assigned_to: 7,
        availability_windows: [
          {
            day_of_week: 2,
            start_time: '09:00',
            end_time: '12:00',
            is_active: false,
          },
        ],
        organization_id: 3,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 4, name: 'Consultation' }));

    expect(fetchCsrfToken).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-organization-id': '3',
      'x-csrf-token': 'calendar-csrf',
    });
    expect(JSON.parse(String(request.body)).variables).toEqual({
      input: {
        name: 'Consultation',
        description: null,
        durationMinutes: 45,
        assignedToId: 7,
        availabilityWindows: [
          {
            dayOfWeek: 2,
            startTime: '09:00',
            endTime: '12:00',
            isActive: false,
          },
        ],
      },
    });
  });

  it('preserves explicit nulls and omitted fields on update', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          updateCalendar: {
            ...calendar,
            description: null,
            assignedToId: null,
            assignedToName: null,
            assignmentMode: 'round_robin',
            availabilityWindows: [],
            dateOverrides: [],
          },
        },
      }),
    );

    await updateCalendarViaGraphql(
      4,
      {
        name: 'Renamed',
        description: null,
        assigned_to: null,
        assignment_mode: 'round_robin',
      },
      3,
    );

    const body = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(body.variables).toEqual({
      id: 4,
      input: {
        name: 'Renamed',
        description: null,
        assignedToId: null,
        assignmentMode: 'round_robin',
      },
    });
    expect(body.variables.input).not.toHaveProperty('timezone');
  });

  it('replaces availability through a CSRF-protected mutation and maps the retained envelope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        data: {
          replaceCalendarAvailability: [
            {
              id: 10,
              calendarId: 4,
              dayOfWeek: 2,
              startTime: '10:00:00',
              endTime: '16:00:00',
              isActive: false,
              createdAt: calendar.createdAt,
            },
          ],
        },
      }),
    );

    await expect(
      replaceCalendarAvailabilityViaGraphql(
        4,
        [
          {
            day_of_week: 2,
            start_time: '10:00',
            end_time: '16:00',
            is_active: false,
          },
        ],
        3,
      ),
    ).resolves.toEqual({
      availability_windows: [
        {
          id: 10,
          calendar_id: 4,
          day_of_week: 2,
          start_time: '10:00:00',
          end_time: '16:00:00',
          is_active: false,
          created_at: calendar.createdAt,
        },
      ],
    });
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-organization-id': '3',
      'x-csrf-token': 'calendar-csrf',
    });
    expect(JSON.parse(String(request.body)).variables).toEqual({
      calendarId: 4,
      windows: [
        {
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '16:00',
          isActive: false,
        },
      ],
    });
  });

  it('upserts and deletes date overrides through retained-shape adapters', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            upsertCalendarDateOverride: {
              id: 9,
              calendarId: 4,
              overrideDate: '2026-08-01',
              isAvailable: true,
              startTime: '10:00:00',
              endTime: '14:30:00',
              reason: 'Extended hours',
              createdAt: calendar.createdAt,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { deleteCalendarDateOverride: true } }),
      );

    await expect(
      upsertCalendarDateOverrideViaGraphql(
        4,
        {
          override_date: '2026-08-01',
          is_available: true,
          start_time: '10:00',
          end_time: '14:30',
          reason: 'Extended hours',
        },
        3,
      ),
    ).resolves.toEqual({
      id: 9,
      calendar_id: 4,
      override_date: '2026-08-01',
      is_available: true,
      start_time: '10:00:00',
      end_time: '14:30:00',
      reason: 'Extended hours',
      created_at: calendar.createdAt,
    });
    const upsertBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(upsertBody.variables).toEqual({
      calendarId: 4,
      input: {
        overrideDate: '2026-08-01',
        isAvailable: true,
        startTime: '10:00',
        endTime: '14:30',
        reason: 'Extended hours',
      },
    });

    await expect(
      deleteCalendarDateOverrideViaGraphql(4, 9, 3),
    ).resolves.toBeUndefined();
    const deleteBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body),
    );
    expect(deleteBody.variables).toEqual({ calendarId: 4, overrideId: 9 });
  });

  it('deletes a calendar through the CSRF-protected retained-shape adapter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { deleteCalendar: true } }),
    );

    await expect(deleteCalendarViaGraphql(4, 3)).resolves.toBeUndefined();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      'x-organization-id': '3',
      'x-csrf-token': 'calendar-csrf',
    });
    const body = JSON.parse(String(request.body));
    expect(body.query).toContain('mutation DeleteCalendar');
    expect(body.variables).toEqual({ id: 4 });
  });
});
