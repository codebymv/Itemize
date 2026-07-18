import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCalendarViaGraphql,
  getCalendarsViaGraphql,
} from './calendarsGraphql';
import { isCalendarGraphqlReadsEnabled } from './graphqlClient';

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
});
