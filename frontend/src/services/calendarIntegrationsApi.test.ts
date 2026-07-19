import api from '@/lib/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectCalendar,
  getCalendarConnections,
  getGoogleAuthUrl,
  syncCalendar,
  updateCalendarConnection,
} from './calendarIntegrationsApi';
import {
  disconnectCalendarViaGraphql,
  getCalendarConnectionsViaGraphql,
  requestCalendarSyncViaGraphql,
  updateCalendarConnectionViaGraphql,
} from './calendarIntegrationsGraphql';
import { isCalendarIntegrationsGraphqlEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./graphqlClient', () => ({
  isCalendarIntegrationsGraphqlEnabled: vi.fn(),
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
    vi.mocked(isCalendarIntegrationsGraphqlEnabled).mockReturnValue(false);
  });

  it('uses REST while the cutover flag is disabled', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [connection] });
    vi.mocked(api.patch).mockResolvedValueOnce({ data: connection });
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { message: 'Sync queued', job: { id: 8 } },
    });
    vi.mocked(api.delete).mockResolvedValueOnce({ data: {} });

    await getCalendarConnections(3);
    await updateCalendarConnection(4, { sync_enabled: false }, 3);
    await syncCalendar(4, 3);
    await disconnectCalendar(4, 3);

    expect(api.get).toHaveBeenCalledWith(
      '/api/calendar-integrations/connections',
      { headers: { 'x-organization-id': '3' } },
    );
    expect(api.patch).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalled();
    expect(getCalendarConnectionsViaGraphql).not.toHaveBeenCalled();
  });

  it('uses GraphQL for database operations when enabled', async () => {
    vi.mocked(isCalendarIntegrationsGraphqlEnabled).mockReturnValue(true);
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

    await getCalendarConnections(3);
    await updateCalendarConnection(4, { sync_enabled: false }, 3);
    await syncCalendar(4, 3);
    await disconnectCalendar(4, 3);

    expect(getCalendarConnectionsViaGraphql).toHaveBeenCalledWith(3);
    expect(updateCalendarConnectionViaGraphql).toHaveBeenCalledWith(
      4,
      { sync_enabled: false },
      3,
    );
    expect(requestCalendarSyncViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(disconnectCalendarViaGraphql).toHaveBeenCalledWith(4, 3);
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('retains Google OAuth initiation on REST when GraphQL is enabled', async () => {
    vi.mocked(isCalendarIntegrationsGraphqlEnabled).mockReturnValue(true);
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { authUrl: 'https://accounts.google.test/oauth' },
    });
    await expect(getGoogleAuthUrl('/calendars', 3)).resolves.toEqual({
      authUrl: 'https://accounts.google.test/oauth',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/api/calendar-integrations/google/auth',
      {
        params: { return_url: '/calendars' },
        headers: { 'x-organization-id': '3' },
      },
    );
  });
});
