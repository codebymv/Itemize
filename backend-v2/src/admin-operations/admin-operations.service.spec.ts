import { GraphQLError } from 'graphql';
import { AdminOperationsRepository } from './admin-operations.repository';
import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  const repository = {
    userCount: jest.fn(), searchUsers: jest.fn(), userIds: jest.fn(),
    usersByIds: jest.fn(), stats: jest.fn(), activationFunnel: jest.fn(),
    updateOwnPlan: jest.fn(),
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
});
