import { GraphQLError } from 'graphql';
import { CalendarIntegrationsRepository } from './calendar-integrations.repository';
import { CalendarIntegrationsService } from './calendar-integrations.service';

const connectionRow = {
  id: 9,
  provider: 'google',
  provider_email: 'calendar@example.com',
  sync_enabled: true,
  sync_direction: 'both',
  last_sync_at: null,
  is_active: true,
  error_message: null,
  error_count: 0,
  selected_calendars: ['primary'],
  created_at: new Date('2026-07-19T00:00:00Z'),
  updated_at: new Date('2026-07-19T00:00:00Z'),
};

const jobRow = {
  id: '11',
  connection_id: 9,
  direction: 'both',
  status: 'queued',
  attempt_count: 0,
  next_attempt_at: new Date('2026-07-19T00:00:00Z'),
  result: null,
  last_error: null,
  completed_at: null,
  created_at: new Date('2026-07-19T00:00:00Z'),
  updated_at: new Date('2026-07-19T00:00:00Z'),
};

describe('CalendarIntegrationsService', () => {
  const repository = {
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    enqueue: jest.fn(),
    syncStatus: jest.fn(),
  } as unknown as jest.Mocked<CalendarIntegrationsRepository>;
  const service = new CalendarIntegrationsService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('maps safe connection fields without provider credentials', async () => {
    repository.findAll.mockResolvedValue([connectionRow]);
    await expect(service.list(3, 7)).resolves.toEqual([
      expect.objectContaining({
        id: 9,
        providerEmail: 'calendar@example.com',
        selectedCalendars: ['primary'],
      }),
    ]);
    expect(repository.findAll).toHaveBeenCalledWith(3, 7);
  });

  it('validates connection settings before database work', async () => {
    await expect(
      service.update(3, 7, 9, {
        selectedCalendars: ['primary', 'primary'],
      }),
    ).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: {
        code: 'BAD_USER_INPUT',
        field: 'selectedCalendars',
        reason: 'INVALID_SELECTED_CALENDARS',
      },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns durable enqueue outcomes and preserves idempotency keys', async () => {
    repository.enqueue.mockResolvedValue({
      kind: 'queued',
      created: false,
      job: jobRow,
    });
    await expect(
      service.enqueue(3, 7, 9, 'sync-request-1'),
    ).resolves.toMatchObject({
      message: 'Sync already queued',
      created: false,
      job: { id: '11', connectionId: 9, status: 'queued' },
    });
    expect(repository.enqueue).toHaveBeenCalledWith(
      3,
      7,
      9,
      'sync-request-1',
    );
  });

  it('reports disabled synchronization as a typed conflict', async () => {
    repository.enqueue.mockResolvedValue({ kind: 'disabled' });
    await expect(service.enqueue(3, 7, 9)).rejects.toMatchObject<
      Partial<GraphQLError>
    >({
      extensions: {
        code: 'CONFLICT',
        reason: 'CALENDAR_SYNC_DISABLED',
      },
    });
  });

  it('uses not-found semantics for another user or organization', async () => {
    repository.syncStatus.mockResolvedValue(null);
    await expect(service.status(3, 7, 99)).rejects.toMatchObject<
      Partial<GraphQLError>
    >({
      extensions: { code: 'NOT_FOUND' },
    });
  });
});
