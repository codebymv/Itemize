import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { getCalendar, getCalendars } from './calendarsApi';
import {
  getCalendarViaGraphql,
  getCalendarsViaGraphql,
} from './calendarsGraphql';
import { isCalendarGraphqlReadsEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isCalendarGraphqlReadsEnabled: vi.fn(),
}));

vi.mock('./calendarsGraphql', () => ({
  getCalendarViaGraphql: vi.fn(),
  getCalendarsViaGraphql: vi.fn(),
}));

const calendar = {
  id: 4,
  organization_id: 3,
  name: 'Consultation',
  slug: 'consultation-test',
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

describe('calendar API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCalendarGraphqlReadsEnabled).mockReturnValue(false);
  });

  it('keeps list and detail reads on REST by default', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { calendars: [calendar] } })
      .mockResolvedValueOnce({ data: calendar });

    await getCalendars(3);
    await getCalendar(4, 3);

    expect(api.get).toHaveBeenNthCalledWith(1, '/api/calendars', {
      headers: { 'x-organization-id': '3' },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/api/calendars/4', {
      headers: { 'x-organization-id': '3' },
    });
    expect(getCalendarsViaGraphql).not.toHaveBeenCalled();
    expect(getCalendarViaGraphql).not.toHaveBeenCalled();
  });

  it('routes both reads through GraphQL only when enabled', async () => {
    vi.mocked(isCalendarGraphqlReadsEnabled).mockReturnValue(true);
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
});
