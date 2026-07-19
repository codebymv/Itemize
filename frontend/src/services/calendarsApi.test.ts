import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import {
  addDateOverride,
  createCalendar,
  deleteCalendar,
  getCalendar,
  getCalendars,
  removeDateOverride,
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
  isCalendarGraphqlAvailabilityMutationsEnabled,
  isCalendarGraphqlMutationsEnabled,
  isCalendarGraphqlReadsEnabled,
} from './graphqlClient';

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
  isCalendarGraphqlMutationsEnabled: vi.fn(),
  isCalendarGraphqlAvailabilityMutationsEnabled: vi.fn(),
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
    vi.mocked(isCalendarGraphqlMutationsEnabled).mockReturnValue(false);
    vi.mocked(isCalendarGraphqlAvailabilityMutationsEnabled).mockReturnValue(false);
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

  it('keeps create and update on REST by default', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: calendar });
    vi.mocked(api.put).mockResolvedValueOnce({ data: calendar });

    await createCalendar({ name: 'Consultation', organization_id: 3 });
    await updateCalendar(4, { description: null }, 3);

    expect(api.post).toHaveBeenCalledWith(
      '/api/calendars',
      { name: 'Consultation', organization_id: 3 },
      { headers: { 'x-organization-id': '3' } },
    );
    expect(api.put).toHaveBeenCalledWith(
      '/api/calendars/4',
      { description: null },
      { headers: { 'x-organization-id': '3' } },
    );
    expect(createCalendarViaGraphql).not.toHaveBeenCalled();
    expect(updateCalendarViaGraphql).not.toHaveBeenCalled();
  });

  it('routes definition writes through GraphQL while availability remains REST', async () => {
    vi.mocked(isCalendarGraphqlMutationsEnabled).mockReturnValue(true);
    vi.mocked(createCalendarViaGraphql).mockResolvedValue(calendar);
    vi.mocked(updateCalendarViaGraphql).mockResolvedValue(calendar);
    vi.mocked(api.put).mockResolvedValueOnce({
      data: { availability_windows: [] },
    });

    const createInput = { name: 'Consultation', organization_id: 3 };
    const updateInput = { name: 'Renamed' };
    await createCalendar(createInput);
    await updateCalendar(4, updateInput, 3);
    await updateCalendarAvailability(4, [], 3);
    await deleteCalendar(4, 3);

    expect(createCalendarViaGraphql).toHaveBeenCalledWith(createInput);
    expect(updateCalendarViaGraphql).toHaveBeenCalledWith(4, updateInput, 3);
    expect(deleteCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.put).toHaveBeenCalledWith(
      '/api/calendars/4/availability',
      { availability_windows: [] },
      { headers: { 'x-organization-id': '3' } },
    );
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('routes availability and override writes through their independent GraphQL flag', async () => {
    vi.mocked(isCalendarGraphqlAvailabilityMutationsEnabled).mockReturnValue(true);
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
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/api/calendars/4', {
      headers: { 'x-organization-id': '3' },
    });
  });
});
