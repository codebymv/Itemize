import type {
  CalendarConnection,
  SyncResult,
  SyncStatus,
} from './calendarIntegrationsApi';
import { graphqlMutationRequest, graphqlRequest } from './graphqlClient';

type GraphqlCalendarConnection = {
  id: number;
  provider: 'google' | 'outlook' | 'apple';
  providerEmail: string | null;
  syncEnabled: boolean;
  syncDirection: 'push' | 'pull' | 'both';
  lastSyncAt: string | null;
  isActive: boolean;
  errorMessage: string | null;
  errorCount: number;
  selectedCalendars: string[];
  createdAt: string;
  updatedAt: string;
};

type GraphqlCalendarSyncJob = {
  id: string;
  connectionId: number;
  direction: 'push' | 'pull' | 'both';
  status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'dead_letter';
  attemptCount: number;
  nextAttemptAt: string;
  result: Record<string, unknown> | null;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const connectionFields = `
  id
  provider
  providerEmail
  syncEnabled
  syncDirection
  lastSyncAt
  isActive
  errorMessage
  errorCount
  selectedCalendars
  createdAt
  updatedAt
`;

const jobFields = `
  id
  connectionId
  direction
  status
  attemptCount
  nextAttemptAt
  result
  lastError
  completedAt
  createdAt
  updatedAt
`;

const mapConnection = (
  connection: GraphqlCalendarConnection,
): CalendarConnection => ({
  id: connection.id,
  provider: connection.provider,
  provider_email: connection.providerEmail,
  sync_enabled: connection.syncEnabled,
  sync_direction: connection.syncDirection,
  last_sync_at: connection.lastSyncAt,
  is_active: connection.isActive,
  error_message: connection.errorMessage,
  error_count: connection.errorCount,
  selected_calendars: connection.selectedCalendars,
  created_at: connection.createdAt,
  updated_at: connection.updatedAt,
});

const mapJob = (job: GraphqlCalendarSyncJob): SyncResult['job'] => ({
  id: Number(job.id),
  connection_id: job.connectionId,
  direction: job.direction,
  status: job.status,
  attempt_count: job.attemptCount,
  next_attempt_at: job.nextAttemptAt,
  result: job.result,
  last_error: job.lastError,
  completed_at: job.completedAt,
  created_at: job.createdAt,
  updated_at: job.updatedAt,
});

export const getCalendarConnectionsViaGraphql = async (
  organizationId?: number,
): Promise<CalendarConnection[]> => {
  const response = await graphqlRequest<
    { calendarConnections: GraphqlCalendarConnection[] },
    Record<string, never>
  >(
    `query CalendarConnections {
      calendarConnections { ${connectionFields} }
    }`,
    {},
    organizationId,
  );
  return response.calendarConnections.map(mapConnection);
};

export const updateCalendarConnectionViaGraphql = async (
  connectionId: number,
  updates: {
    sync_enabled?: boolean;
    sync_direction?: 'push' | 'pull' | 'both';
    selected_calendars?: string[];
  },
  organizationId?: number,
): Promise<CalendarConnection> => {
  const response = await graphqlMutationRequest<
    { updateCalendarConnection: GraphqlCalendarConnection },
    {
      connectionId: number;
      input: {
        syncEnabled?: boolean;
        syncDirection?: 'push' | 'pull' | 'both';
        selectedCalendars?: string[];
      };
    }
  >(
    `mutation UpdateCalendarConnection(
      $connectionId: Int!
      $input: UpdateCalendarConnectionInput!
    ) {
      updateCalendarConnection(connectionId: $connectionId, input: $input) {
        ${connectionFields}
      }
    }`,
    {
      connectionId,
      input: {
        ...(updates.sync_enabled === undefined
          ? {}
          : { syncEnabled: updates.sync_enabled }),
        ...(updates.sync_direction === undefined
          ? {}
          : { syncDirection: updates.sync_direction }),
        ...(updates.selected_calendars === undefined
          ? {}
          : { selectedCalendars: updates.selected_calendars }),
      },
    },
    organizationId,
  );
  return mapConnection(response.updateCalendarConnection);
};

export const disconnectCalendarViaGraphql = async (
  connectionId: number,
  organizationId?: number,
): Promise<void> => {
  await graphqlMutationRequest<
    { disconnectCalendar: boolean },
    { connectionId: number }
  >(
    `mutation DisconnectCalendar($connectionId: Int!) {
      disconnectCalendar(connectionId: $connectionId)
    }`,
    { connectionId },
    organizationId,
  );
};

export const requestCalendarSyncViaGraphql = async (
  connectionId: number,
  organizationId?: number,
  idempotencyKey?: string,
): Promise<SyncResult> => {
  const response = await graphqlMutationRequest<
    {
      requestCalendarSync: {
        message: string;
        created: boolean;
        job: GraphqlCalendarSyncJob;
      };
    },
    { connectionId: number; idempotencyKey: string }
  >(
    `mutation RequestCalendarSync(
      $connectionId: Int!
      $idempotencyKey: String
    ) {
      requestCalendarSync(
        connectionId: $connectionId
        idempotencyKey: $idempotencyKey
      ) {
        message
        created
        job { ${jobFields} }
      }
    }`,
    {
      connectionId,
      idempotencyKey:
        idempotencyKey ??
        globalThis.crypto?.randomUUID?.() ??
        `calendar-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    organizationId,
  );
  return {
    message: response.requestCalendarSync.message,
    created: response.requestCalendarSync.created,
    job: mapJob(response.requestCalendarSync.job),
  };
};

export const getCalendarSyncStatusViaGraphql = async (
  connectionId: number,
  organizationId?: number,
): Promise<SyncStatus> => {
  const response = await graphqlRequest<
    {
      calendarSyncStatus: {
        connection: GraphqlCalendarConnection;
        stats: {
          totalSynced: number;
          pushed: number;
          pulled: number;
          lastEventSync: string | null;
        };
        jobs: GraphqlCalendarSyncJob[];
      };
    },
    { connectionId: number }
  >(
    `query CalendarSyncStatus($connectionId: Int!) {
      calendarSyncStatus(connectionId: $connectionId) {
        connection { ${connectionFields} }
        stats {
          totalSynced
          pushed
          pulled
          lastEventSync
        }
        jobs { ${jobFields} }
      }
    }`,
    { connectionId },
    organizationId,
  );
  const status = response.calendarSyncStatus;
  return {
    connection: mapConnection(status.connection),
    stats: {
      total_synced: status.stats.totalSynced,
      pushed: status.stats.pushed,
      pulled: status.stats.pulled,
      last_event_sync: status.stats.lastEventSync,
    },
    jobs: status.jobs.map(mapJob),
  };
};
