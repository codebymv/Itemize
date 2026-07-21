import {
  WorkflowTriggerClaim,
  WorkflowTriggerJobsRepository,
  WorkflowTriggerResult,
} from './workflow-trigger-jobs.repository';
import { WorkflowTriggerJobsService } from './workflow-trigger-jobs.service';

const claim: WorkflowTriggerClaim = {
  id: 8,
  workflow_id: null,
  organization_id: 3,
  contact_id: 5,
  trigger_type: 'contact_added',
  payload: {},
  source: 'domain',
  attempt_count: 1,
};

const processed = (extra: Partial<WorkflowTriggerResult> = {}): WorkflowTriggerResult => ({
  persisted: true,
  enrolled: 1,
  matchedWorkflows: 1,
  alreadyActive: 0,
  paused: 0,
  conditionMisses: 0,
  ...extra,
});

describe('WorkflowTriggerJobsService', () => {
  let repository: jest.Mocked<WorkflowTriggerJobsRepository>;
  let service: WorkflowTriggerJobsService;

  beforeEach(() => {
    repository = {
      claimScheduled: jest.fn(), claimTrigger: jest.fn(), processTrigger: jest.fn(), failTrigger: jest.fn(),
    } as unknown as jest.Mocked<WorkflowTriggerJobsRepository>;
    service = new WorkflowTriggerJobsService(repository);
  });

  it('claims scheduled workflows only through the requested bound', async () => {
    repository.claimScheduled
      .mockResolvedValueOnce({ workflowId: 2, triggerId: 10 })
      .mockResolvedValueOnce({ workflowId: 3, triggerId: 11 })
      .mockResolvedValueOnce(null);

    await expect(service.runScheduled({ batchSize: 2 })).resolves.toEqual({ claimed: 2, queued: 2 });
    expect(repository.claimScheduled).toHaveBeenCalledTimes(2);
  });

  it('executes exactly one targeted schedule or trigger', async () => {
    repository.claimScheduled.mockResolvedValue({ workflowId: 2, triggerId: 10 });
    await expect(service.runScheduled({ batchSize: 50, workflowId: 2 }))
      .resolves.toEqual({ claimed: 1, queued: 1 });
    expect(repository.claimScheduled).toHaveBeenCalledTimes(1);

    repository.claimTrigger.mockResolvedValue(claim);
    repository.processTrigger.mockResolvedValue(processed());
    await expect(service.runTriggers({ batchSize: 50, triggerId: 8 })).resolves.toMatchObject({
      claimed: 1, completed: 1, enrolled: 1,
    });
    expect(repository.claimTrigger).toHaveBeenCalledTimes(1);
  });

  it('counts completed and stale fenced outcomes and stops when the queue is empty', async () => {
    repository.claimTrigger.mockResolvedValueOnce(claim).mockResolvedValueOnce({ ...claim, id: 9 }).mockResolvedValueOnce(null);
    repository.processTrigger.mockResolvedValueOnce(processed({ enrolled: 2 })).mockResolvedValueOnce(processed({ persisted: false }));

    await expect(service.runTriggers()).resolves.toEqual({
      claimed: 2, completed: 1, deadLetter: 0, enrolled: 2, retry: 0, stale: 1,
    });
    expect(repository.claimTrigger).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['retry', { retry: 1, deadLetter: 0, stale: 0 }],
    ['dead_letter', { retry: 0, deadLetter: 1, stale: 0 }],
    ['stale', { retry: 0, deadLetter: 0, stale: 1 }],
  ] as const)('records a %s failure outcome without abandoning the batch', async (outcome, expected) => {
    repository.claimTrigger.mockResolvedValueOnce(claim).mockResolvedValueOnce(null);
    repository.processTrigger.mockRejectedValue(new Error('provider secret sk_live_bad'));
    repository.failTrigger.mockResolvedValue(outcome);

    await expect(service.runTriggers({ maxAttempts: 4 })).resolves.toMatchObject({ claimed: 1, ...expected });
    expect(repository.failTrigger).toHaveBeenCalledWith(claim, expect.any(Error), expect.objectContaining({ maxAttempts: 4 }));
  });
});
