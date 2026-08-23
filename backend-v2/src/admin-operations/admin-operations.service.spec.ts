import { GraphQLError } from 'graphql';
import { AdminOperationsRepository } from './admin-operations.repository';
import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  const repository = {
    userCount: jest.fn(), searchUsers: jest.fn(), userIds: jest.fn(),
    usersByIds: jest.fn(), stats: jest.fn(), activationFunnel: jest.fn(),
    operationsSnapshot: jest.fn(), jobQueueDetails: jest.fn(), updateOwnPlan: jest.fn(),
  } as unknown as jest.Mocked<AdminOperationsRepository>;
  const service = new AdminOperationsService(repository);

  beforeEach(() => jest.clearAllMocks());

  it('normalizes filters and computes stable pagination', async () => {
    repository.searchUsers.mockResolvedValue({
      rows: [
        { id: 3, email: 'a@test', name: null, role: null, plan: null, created_at: new Date('2026-01-01') },
        { id: 2, email: 'b@test', name: 'B', role: 'USER', plan: 'pro', created_at: new Date('2026-01-01') },
      ], total: 4,
    });
    await expect(service.search({ query: '  test  ', plan: 'PRO', page: 1, limit: 1 })).resolves.toEqual({
      users: [expect.objectContaining({ id: 3, role: 'USER', plan: 'free' })], total: 4, hasMore: true,
    });
    expect(repository.searchUsers).toHaveBeenCalledWith({ query: 'test', plan: 'pro', limit: 1, offset: 1 });
  });

  it('applies the same plan filter to the all-IDs contract', async () => {
    repository.userIds.mockResolvedValue([9]);
    await expect(service.ids({ query: ' x ', plan: 'starter' })).resolves.toEqual({ ids: [9] });
    expect(repository.userIds).toHaveBeenCalledWith('x', 'starter');
  });

  it('deduplicates bounded batch IDs and rejects invalid input', async () => {
    repository.usersByIds.mockResolvedValue([]);
    await service.byIds([2, 2, 1]);
    expect(repository.usersByIds).toHaveBeenCalledWith([2, 1]);
    await expect(service.byIds([0])).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    await expect(service.byIds(Array.from({ length: 101 }, (_, index) => index + 1))).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
  });

  it('returns an atomic plan result and maps missing references to safe input errors', async () => {
    repository.updateOwnPlan.mockResolvedValueOnce('updated').mockResolvedValueOnce('no_organization');
    await expect(service.updateOwnPlan(8, ' Pro ')).resolves.toEqual({ message: 'Plan updated to pro', plan: 'pro' });
    expect(repository.updateOwnPlan).toHaveBeenNthCalledWith(1, 8, 'pro', {
      status: 'active',
      limits: expect.objectContaining({ contacts: -1, users: -1, forms: -1 }),
    });
    await expect(service.updateOwnPlan(8, 'starter')).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
    await expect(service.updateOwnPlan(8, 'enterprise')).rejects.toMatchObject<Partial<GraphQLError>>({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
  });

  it('calculates an admin-only activation cohort with explicit denominators', async () => {
    repository.activationFunnel.mockResolvedValue({
      as_of: new Date('2026-08-20T12:00:00.000Z'),
      cohort_started_at: new Date('2026-07-21T12:00:00.000Z'),
      organizations_created: 10,
      organizations_sent: 4,
      organizations_advanced: 3,
      organizations_returned: 2,
      trial_organizations_sent: 2,
      organizations_trial_to_paid: 1,
    });
    await expect(service.activationFunnel()).resolves.toMatchObject({
      cohortDays: 30,
      sendRate: 0.4,
      advanceRate: 0.75,
      returnRate: 0.5,
      trialToPaidRate: 0.5,
    });
    expect(repository.activationFunnel).toHaveBeenCalledWith(30);
    await expect(service.activationFunnel(0)).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }),
    });
  });

  it('summarizes provider configuration and actionable queue health', async () => {
    repository.operationsSnapshot.mockResolvedValue({
      asOf: new Date('2026-08-22T12:00:00.000Z'),
      queues: [
        {
          id: 'messages', name: 'Direct messages', available: true,
          queued: 2, processing: 1, retrying: 1, action_required: 0,
          oldest_pending_at: new Date('2026-08-22T11:00:00.000Z'),
        },
        {
          id: 'invoices', name: 'Invoice emails', available: true,
          queued: 0, processing: 0, retrying: 0, action_required: 2,
          oldest_pending_at: null,
        },
      ],
    });
    const result = await service.operationsSnapshot();
    expect(result).toMatchObject({
      status: 'action_required', activeJobs: 4, retryingJobs: 1,
      actionRequiredJobs: 2,
    });
    expect(result.queues).toEqual([
      expect.objectContaining({ id: 'messages', status: 'degraded', active: 4 }),
      expect.objectContaining({ id: 'invoices', status: 'action_required', actionRequired: 2 }),
    ]);
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'database', status: 'operational', required: true }),
    ]));
  });

  it('returns bounded queue details and redacts sensitive diagnostics', async () => {
    repository.jobQueueDetails.mockResolvedValue({
      queueId: 'realtime',
      name: 'Realtime events',
      available: true,
      total: 2,
      kindCounts: [{ kind: 'CONTENT_CHANGED', count: 2 }],
      items: [{
        id: '42',
        status: 'retry',
        created_at: new Date('2026-08-22T11:00:00.000Z'),
        attempt_count: 2,
        next_attempt_at: new Date('2026-08-22T11:05:00.000Z'),
        lease_expires_at: null,
        kind: 'noteUpdated',
        reference: null,
        last_error: 'Delivery to person@example.com failed with Bearer secret-token',
      }],
    });
    await expect(service.jobQueueDetails(' REALTIME ', 'retrying', 1, 0)).resolves.toMatchObject({
      queueId: 'realtime',
      bucket: 'retrying',
      total: 2,
      hasMore: true,
      kindCounts: [{ kind: 'CONTENT_CHANGED', count: 2 }],
      items: [expect.objectContaining({
        id: '42',
        attemptCount: 2,
        lastError: 'Delivery to [redacted-email] failed with [redacted-authorization]',
      })],
    });
    expect(repository.jobQueueDetails).toHaveBeenCalledWith('realtime', 'retrying', 1, 0);
    await expect(service.jobQueueDetails('../users')).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT', field: 'queueId' }),
    });
    await expect(service.jobQueueDetails('realtime', 'sent')).rejects.toMatchObject<Partial<GraphQLError>>({
      extensions: expect.objectContaining({ code: 'BAD_USER_INPUT', field: 'bucket' }),
    });
  });
});
