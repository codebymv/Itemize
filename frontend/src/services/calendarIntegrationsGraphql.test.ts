import { fetchCsrfToken } from '@/lib/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectCalendarViaGraphql,
  getCalendarConnectionsViaGraphql,
  getCalendarSyncStatusViaGraphql,
  requestCalendarSyncViaGraphql,
  updateCalendarConnectionViaGraphql,
} from './calendarIntegrationsGraphql';
import { isCalendarIntegrationsGraphqlEnabled } from './graphqlClient';

vi.mock('@/lib/api', () => ({
  fetchCsrfToken: vi.fn(),
  getApiUrl: vi.fn(() => 'https://api.test.itemize'),
  refreshAuthenticatedSession: vi.fn(),
}));

const connection = {
  id: 4,
  provider: 'google',
  providerEmail: 'calendar@example.com',
  syncEnabled: true,
  syncDirection: 'both',
  lastSyncAt: null,
  isActive: true,
  errorMessage: null,
  errorCount: 0,
  selectedCalendars: ['primary'],
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const job = {
  id: '8',
  connectionId: 4,
  direction: 'both',
  status: 'queued',
  attemptCount: 0,
  nextAttemptAt: '2026-07-19T00:00:00.000Z',
  result: null,
  lastError: null,
  completedAt: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

const response = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(payload),
  }) as unknown as Response;

describe('calendar integrations GraphQL consumer', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.test.itemize/graphql');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetchCsrfToken).mockResolvedValue('calendar-integration-csrf');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the integration cutover disabled by default', () => {
    vi.stubEnv('VITE_CALENDAR_INTEGRATIONS_GRAPHQL', 'false');
    expect(isCalendarIntegrationsGraphqlEnabled()).toBe(false);
    vi.stubEnv('VITE_CALENDAR_INTEGRATIONS_GRAPHQL', 'true');
    expect(isCalendarIntegrationsGraphqlEnabled()).toBe(true);
  });

  it('maps connection reads into the retained REST shape', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ data: { calendarConnections: [connection] } }),
    );
    await expect(getCalendarConnectionsViaGraphql(3)).resolves.toEqual([
      {
        id: 4,
        provider: 'google',
        provider_email: 'calendar@example.com',
        sync_enabled: true,
        sync_direction: 'both',
        last_sync_at: null,
        is_active: true,
        error_message: null,
        error_count: 0,
        selected_calendars: ['primary'],
        created_at: connection.createdAt,
        updated_at: connection.updatedAt,
      },
    ]);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      'x-organization-id': '3',
    });
  });

  it('maps settings and disconnect through CSRF-protected mutations', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({ data: { updateCalendarConnection: connection } }),
      )
      .mockResolvedValueOnce(
        response({ data: { disconnectCalendar: true } }),
      );
    await updateCalendarConnectionViaGraphql(
      4,
      {
        sync_enabled: false,
        sync_direction: 'pull',
        selected_calendars: [],
      },
      3,
    );
    await disconnectCalendarViaGraphql(4, 3);

    expect(fetchCsrfToken).toHaveBeenCalledTimes(2);
    const updateRequest = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(updateRequest.headers).toMatchObject({
      'x-csrf-token': 'calendar-integration-csrf',
    });
    expect(JSON.parse(String(updateRequest.body)).variables).toEqual({
      connectionId: 4,
      input: {
        syncEnabled: false,
        syncDirection: 'pull',
        selectedCalendars: [],
      },
    });
  });

  it('preserves durable job and status shapes without casing leaks', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          data: {
            requestCalendarSync: {
              message: 'Sync queued',
              created: true,
              job,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            calendarSyncStatus: {
              connection,
              stats: {
                totalSynced: 3,
                pushed: 2,
                pulled: 1,
                lastEventSync: '2026-07-19T00:00:00.000Z',
              },
              jobs: [job],
            },
          },
        }),
      );
    await expect(
      requestCalendarSyncViaGraphql(4, 3, 'browser-request-1'),
    ).resolves.toMatchObject({
      message: 'Sync queued',
      created: true,
      job: {
        id: 8,
        connection_id: 4,
        attempt_count: 0,
        last_error: null,
      },
    });
    const mutationBody = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    );
    expect(mutationBody.variables).toEqual({
      connectionId: 4,
      idempotencyKey: 'browser-request-1',
    });

    await expect(getCalendarSyncStatusViaGraphql(4, 3)).resolves.toMatchObject({
      connection: { id: 4, provider_email: 'calendar@example.com' },
      stats: { total_synced: 3, pushed: 2, pulled: 1 },
      jobs: [{ id: 8, connection_id: 4, status: 'queued' }],
    });
  });
});
