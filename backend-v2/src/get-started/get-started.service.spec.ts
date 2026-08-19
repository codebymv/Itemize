import { GetStartedRepository } from './get-started.repository';
import { GetStartedService } from './get-started.service';

describe('GetStartedService', () => {
  let repository: jest.Mocked<GetStartedRepository>;
  let service: GetStartedService;

  beforeEach(() => {
    repository = {
      findMilestones: jest.fn(),
      insertMilestone: jest.fn(),
      liveCounts: jest.fn(),
      isDismissed: jest.fn(),
      dismiss: jest.fn(),
    } as unknown as jest.Mocked<GetStartedRepository>;
    service = new GetStartedService(repository);
  });

  it('projects four steps and folds invoice or deal into first_money', async () => {
    repository.findMilestones.mockResolvedValue([
      { name: 'first_contact', occurred_at: new Date('2026-08-01T00:00:00.000Z') },
      { name: 'first_deal', occurred_at: new Date('2026-08-02T00:00:00.000Z') },
    ]);
    repository.liveCounts.mockResolvedValue({
      contacts: 1,
      lists: 0,
      invoices: 0,
      deals: 1,
    });
    repository.isDismissed.mockResolvedValue(false);

    await expect(service.progress(4, 7)).resolves.toEqual({
      dismissed: false,
      completedCount: 3,
      totalCount: 4,
      steps: [
        { id: 'workspace_ready', completed: true, completedAt: null, href: '/settings' },
        {
          id: 'first_contact',
          completed: true,
          completedAt: new Date('2026-08-01T00:00:00.000Z'),
          href: '/contacts',
        },
        { id: 'first_list', completed: false, completedAt: null, href: '/canvas' },
        {
          id: 'first_money',
          completed: true,
          completedAt: new Date('2026-08-02T00:00:00.000Z'),
          href: '/invoices/new',
        },
      ],
    });
    expect(repository.insertMilestone).not.toHaveBeenCalled();
  });

  it('lazy-stamps missing events from live counts', async () => {
    repository.findMilestones.mockResolvedValue([]);
    repository.liveCounts.mockResolvedValue({
      contacts: 2,
      lists: 1,
      invoices: 0,
      deals: 0,
    });
    repository.isDismissed.mockResolvedValue(false);
    repository.insertMilestone.mockResolvedValue(undefined);

    const progress = await service.progress(4, 7);
    expect(repository.insertMilestone).toHaveBeenCalledTimes(2);
    expect(progress.steps.find((step) => step.id === 'first_contact')?.completed).toBe(true);
    expect(progress.steps.find((step) => step.id === 'first_list')?.completed).toBe(true);
  });

  it('swallows record failures so creates can keep succeeding', async () => {
    repository.insertMilestone.mockRejectedValue(new Error('db down'));
    await expect(
      service.record({
        organizationId: 4,
        userId: 7,
        name: 'first_contact',
        source: 'create_contact',
        properties: { contactId: 11, email: 'secret@example.com' },
      }),
    ).resolves.toBe(false);
    expect(repository.insertMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: { contactId: 11 },
        dedupeKey: '4:first_contact:first',
      }),
    );
  });
});
