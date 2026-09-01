import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectCalendar,
  getCalendarConnections,
  getGoogleAuthUrl,
  getSyncStatus,
  listGoogleCalendars,
  syncCalendar,
  updateCalendarConnection,
} from './calendarIntegrationsApi';
import {
  disconnectCalendarViaGraphql,
  getCalendarConnectionsViaGraphql,
  getCalendarSyncStatusViaGraphql,
  requestCalendarSyncViaGraphql,
  updateCalendarConnectionViaGraphql,
} from './calendarIntegrationsGraphql';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./calendarIntegrationsGraphql', () => ({
  disconnectCalendarViaGraphql: vi.fn(),
  getCalendarConnectionsViaGraphql: vi.fn(),
  getCalendarSyncStatusViaGraphql: vi.fn(),
  requestCalendarSyncViaGraphql: vi.fn(),
  updateCalendarConnectionViaGraphql: vi.fn(),
}));

const connection = {
  id: 4,
  provider: 'google' as const,
  provider_email: 'calendar@example.com',
  sync_enabled: true,
  sync_direction: 'both' as const,
  last_sync_at: null,
  is_active: true,
  error_message: null,
  error_count: 0,
  selected_calendars: ['primary'],
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: '2026-07-19T00:00:00.000Z',
};

describe('calendar integrations API transport selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses GraphQL for all database-backed management operations', async () => {
    vi.mocked(getCalendarConnectionsViaGraphql).mockResolvedValue([connection]);
    vi.mocked(updateCalendarConnectionViaGraphql).mockResolvedValue(connection);
    vi.mocked(requestCalendarSyncViaGraphql).mockResolvedValue({
      message: 'Sync queued',
      created: true,
      job: {
        id: 8,
        connection_id: 4,
        direction: 'both',
        status: 'queued',
        attempt_count: 0,
        next_attempt_at: connection.created_at,
        result: null,
        last_error: null,
        completed_at: null,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
      },
    });
    vi.mocked(getCalendarSyncStatusViaGraphql).mockResolvedValue({
      connection,
      stats: {
        total_synced: 0,
        pushed: 0,
        pulled: 0,
        last_event_sync: null,
      },
      jobs: [],
    });

    await getCalendarConnections(3);
    await updateCalendarConnection(4, { sync_enabled: false }, 3);
    await syncCalendar(4, 3, 'calendar-sync-request-1');
    await getSyncStatus(4, 3);
    await disconnectCalendar(4, 3);

    expect(getCalendarConnectionsViaGraphql).toHaveBeenCalledWith(3);
    expect(updateCalendarConnectionViaGraphql).toHaveBeenCalledWith(
      4,
      { sync_enabled: false },
      3,
    );
    expect(requestCalendarSyncViaGraphql).toHaveBeenCalledWith(
      4,
      3,
      'calendar-sync-request-1',
    );
    expect(getCalendarSyncStatusViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(disconnectCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.get).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('retains Google OAuth initiation and live calendar discovery on HTTP', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: { authUrl: 'https://accounts.google.test/oauth' },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'primary',
            summary: 'Primary',
            primary: true,
            accessRole: 'owner',
          },
        ],
      });
    await expect(getGoogleAuthUrl('/calendars', 3)).resolves.toEqual({
      authUrl: 'https://accounts.google.test/oauth',
    });
    await expect(listGoogleCalendars(4, 3)).resolves.toEqual([
      {
        id: 'primary',
        summary: 'Primary',
        primary: true,
        accessRole: 'owner',
      },
    ]);
    expect(api.get).toHaveBeenCalledWith(
      '/api/calendar-integrations/google/auth',
      {
        params: { return_url: '/calendars' },
        headers: { 'x-organization-id': '3' },
      },
    );
    expect(api.get).toHaveBeenCalledWith(
      '/api/calendar-integrations/google/calendars/4',
      { headers: { 'x-organization-id': '3' } },
    );
  });
});
