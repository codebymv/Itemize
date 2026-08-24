import { Injectable } from '@nestjs/common';
import { itemizeGraphqlError } from '../common/graphql-error';
import { UpdateCalendarConnectionInput } from './calendar-integration.inputs';
import {
  CalendarConnection,
  CalendarSyncJob,
  CalendarSyncRequest,
  CalendarSyncStatus,
} from './calendar-integration.types';
import {
  CalendarConnectionRow,
  CalendarIntegrationsRepository,
  CalendarSyncJobRow,
  UpdateCalendarConnectionValues,
} from './calendar-integrations.repository';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SYNC_DIRECTIONS = new Set(['push', 'pull', 'both']);

@Injectable()
export class CalendarIntegrationsService {
  constructor(
    private readonly calendarIntegrations: CalendarIntegrationsRepository,
  ) {}

  async list(
    organizationId: number,
    userId: number,
  ): Promise<CalendarConnection[]> {
    return (
      await this.calendarIntegrations.findAll(organizationId, userId)
    ).map(this.mapConnection);
  }

  async update(
    organizationId: number,
    userId: number,
    connectionId: number,
    input: UpdateCalendarConnectionInput,
  ): Promise<CalendarConnection> {
    this.id(connectionId);
    const values: UpdateCalendarConnectionValues = {};
    if (input.syncEnabled !== undefined) {
      if (input.syncEnabled === null) this.nullField('syncEnabled');
      values.syncEnabled = input.syncEnabled;
    }
    if (input.syncDirection !== undefined) {
      if (
        input.syncDirection === null ||
        !SYNC_DIRECTIONS.has(input.syncDirection)
      ) {
        throw itemizeGraphqlError(
          'syncDirection must be push, pull, or both',
          'BAD_USER_INPUT',
          { field: 'syncDirection', reason: 'INVALID_SYNC_DIRECTION' },
        );
      }
      values.syncDirection = input.syncDirection;
    }
    if (input.selectedCalendars !== undefined) {
      if (input.selectedCalendars === null) {
        this.nullField('selectedCalendars');
      }
      values.selectedCalendars = this.selectedCalendars(
        input.selectedCalendars,
      );
    }
    const updated = await this.calendarIntegrations.update(
      organizationId,
      userId,
      connectionId,
      values,
    );
    if (!updated) this.notFound();
    return this.mapConnection(updated);
  }

  async delete(
    organizationId: number,
    userId: number,
    connectionId: number,
  ): Promise<boolean> {
    this.id(connectionId);
    if (
      !(await this.calendarIntegrations.delete(
        organizationId,
        userId,
        connectionId,
      ))
    ) {
      this.notFound();
    }
    return true;
  }

  async enqueue(
    organizationId: number,
    userId: number,
    connectionId: number,
    idempotencyKey?: string | null,
  ): Promise<CalendarSyncRequest> {
    this.id(connectionId);
    const normalizedKey = this.idempotencyKey(idempotencyKey);
    const outcome = await this.calendarIntegrations.enqueue(
      organizationId,
      userId,
      connectionId,
      normalizedKey,
    );
    if (outcome.kind === 'not_found') this.notFound();
    if (outcome.kind === 'disabled') {
      throw itemizeGraphqlError(
        'Calendar connection sync is disabled',
        'CONFLICT',
        { reason: 'CALENDAR_SYNC_DISABLED' },
      );
    }
    if (outcome.kind === 'invalid_direction') {
      throw itemizeGraphqlError(
        'Calendar connection has an unsupported sync direction',
        'CONFLICT',
        { reason: 'CALENDAR_SYNC_DIRECTION_INVALID' },
      );
    }
    return {
      message: outcome.created ? 'Sync queued' : 'Sync already queued',
      created: outcome.created,
      job: this.mapJob(outcome.job),
    };
  }

  async status(
    organizationId: number,
    userId: number,
    connectionId: number,
  ): Promise<CalendarSyncStatus> {
    this.id(connectionId);
    const result = await this.calendarIntegrations.syncStatus(
      organizationId,
      userId,
      connectionId,
    );
    if (!result) this.notFound();
    return {
      connection: this.mapConnection(result.connection),
      stats: {
        totalSynced: Number(result.stats.total_synced),
        pushed: Number(result.stats.pushed),
        pulled: Number(result.stats.pulled),
        lastEventSync: result.stats.last_event_sync,
      },
      jobs: result.jobs.map(this.mapJob),
    };
  }

  private id(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw itemizeGraphqlError(
        'connectionId must be a positive integer',
        'BAD_USER_INPUT',
        { field: 'connectionId', reason: 'INVALID_CONNECTION_ID' },
      );
    }
  }

  private idempotencyKey(value?: string | null): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = value.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw itemizeGraphqlError(
        'idempotencyKey must be 1-128 safe ASCII characters',
        'BAD_USER_INPUT',
        { field: 'idempotencyKey', reason: 'INVALID_IDEMPOTENCY_KEY' },
      );
    }
    return normalized;
  }

  private selectedCalendars(value: string[]): string[] {
    if (value.length > 100) {
      throw itemizeGraphqlError(
        'selectedCalendars must contain up to 100 unique calendar IDs',
        'BAD_USER_INPUT',
        { field: 'selectedCalendars', reason: 'INVALID_SELECTED_CALENDARS' },
      );
    }
    const normalized = value.map((calendarId) => calendarId.trim());
    if (
      normalized.some(
        (calendarId) => calendarId.length === 0 || calendarId.length > 255,
      ) ||
      new Set(normalized).size !== normalized.length
    ) {
      throw itemizeGraphqlError(
        'selectedCalendars must contain up to 100 unique non-empty calendar IDs',
        'BAD_USER_INPUT',
        { field: 'selectedCalendars', reason: 'INVALID_SELECTED_CALENDARS' },
      );
    }
    return normalized;
  }

  private nullField(field: string): never {
    throw itemizeGraphqlError(`${field} cannot be null`, 'BAD_USER_INPUT', {
      field,
      reason: 'NULL_CALENDAR_CONNECTION_FIELD',
    });
  }

  private notFound(): never {
    throw itemizeGraphqlError('Connection not found', 'NOT_FOUND');
  }

  private readonly mapConnection = (
    row: CalendarConnectionRow,
  ): CalendarConnection => ({
    id: Number(row.id),
    provider: row.provider,
    providerEmail: row.provider_email,
    syncEnabled: row.sync_enabled,
    syncDirection: row.sync_direction,
    lastSyncAt: row.last_sync_at,
    isActive: row.is_active,
    errorMessage: row.error_message,
    errorCount: Number(row.error_count),
    selectedCalendars: Array.isArray(row.selected_calendars)
      ? row.selected_calendars.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  private readonly mapJob = (row: CalendarSyncJobRow): CalendarSyncJob => ({
    id: String(row.id),
    connectionId: Number(row.connection_id),
    direction: row.direction,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    nextAttemptAt: row.next_attempt_at,
    result: row.result,
    lastError: row.last_error,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
