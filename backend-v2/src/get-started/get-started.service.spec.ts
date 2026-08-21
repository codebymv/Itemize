import { GetStartedRepository } from './get-started.repository';
import { GetStartedService } from './get-started.service';

describe('GetStartedService', () => {
  let repository: jest.Mocked<GetStartedRepository>;
  let service: GetStartedService;

  beforeEach(() => {
    repository = {
      findMilestones: jest.fn(),
      insertMilestone: jest.fn(),
      liveState: jest.fn(),
      isDismissed: jest.fn(),
      dismiss: jest.fn(),
    } as unknown as jest.Mocked<GetStartedRepository>;
    service = new GetStartedService(repository);
  });

  it('projects the Solo journey through the first provider-confirmed send', async () => {
    repository.findMilestones.mockResolvedValue([
      { name: 'first_contact', occurred_at: new Date('2026-08-01T00:00:00.000Z') },
    ]);
    repository.liveState.mockResolvedValue({
      plan: 'starter',
      contacts: 1,
      lists: 0,
      first_artifact_at: new Date('2026-08-02T00:00:00.000Z'),
      first_artifact_type: 'estimate',
      artifact_sent_at: null,
    });
    repository.isDismissed.mockResolvedValue(false);

    await expect(service.progress(4, 7)).resolves.toEqual({
      dismissed: false,
      completedCount: 2,
      totalCount: 3,
      steps: [
        {
          id: 'first_contact',
          completed: true,
          completedAt: new Date('2026-08-01T00:00:00.000Z'),
          href: '/contacts',
        },
        {
          id: 'first_artifact',
          completed: true,
          completedAt: new Date('2026-08-02T00:00:00.000Z'),
          href: '/estimates/new',
        },
        { id: 'first_send', completed: false, completedAt: null, href: '/estimates' },
      ],
    });
    expect(repository.insertMilestone).not.toHaveBeenCalled();
  });

  it('projects a focused workspace journey for Free organizations', async () => {
    repository.findMilestones.mockResolvedValue([]);
    repository.liveState.mockResolvedValue({
      plan: 'free',
      contacts: 0,
      lists: 1,
      first_artifact_at: null,
      first_artifact_type: null,
      artifact_sent_at: null,
    });
    repository.isDismissed.mockResolvedValue(false);
    repository.insertMilestone.mockResolvedValue(undefined);

    const progress = await service.progress(4, 7);
    expect(repository.insertMilestone).toHaveBeenCalledTimes(1);
    expect(progress).toMatchObject({
      completedCount: 1,
      totalCount: 1,
      steps: [{ id: 'first_list', completed: true, href: '/canvas' }],
    });
  });

  it('returns the user to the kind of artifact they created when it is time to send', async () => {
    repository.findMilestones.mockResolvedValue([
      { name: 'first_contact', occurred_at: new Date('2026-08-01T00:00:00.000Z') },
    ]);
    repository.liveState.mockResolvedValue({
      plan: 'starter',
      contacts: 1,
      lists: 0,
      first_artifact_at: new Date('2026-08-02T00:00:00.000Z'),
      first_artifact_type: 'invoice',
      artifact_sent_at: null,
    });
    repository.isDismissed.mockResolvedValue(false);

    const progress = await service.progress(4, 7);
    expect(progress.steps.find((step) => step.id === 'first_send')?.href)
      .toBe('/invoices');
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
