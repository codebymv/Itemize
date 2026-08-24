import {
  WorkflowEnrollmentClaim,
  WorkflowEnrollmentJobsRepository,
} from './workflow-enrollment-jobs.repository';
import { WorkflowEnrollmentJobsService } from './workflow-enrollment-jobs.service';

const claim: WorkflowEnrollmentClaim = {
  id: 8,
  execution_attempt_count: 1,
  execution_claim_token: '00000000-0000-4000-8000-000000000001',
  execution_lease_expires_at: new Date(),
  lease_seconds: 300,
};

describe('WorkflowEnrollmentJobsService', () => {
  let repository: jest.Mocked<WorkflowEnrollmentJobsRepository>;
  let service: WorkflowEnrollmentJobsService;

  beforeEach(() => {
    repository = { claimEnrollment: jest.fn(), processEnrollment: jest.fn() } as any;
    service = new WorkflowEnrollmentJobsService(repository);
  });

  it('summarizes terminal, waiting, failed, and fenced claims', async () => {
    repository.claimEnrollment
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce({ ...claim, id: 9 })
      .mockResolvedValueOnce({ ...claim, id: 10 })
      .mockResolvedValueOnce({ ...claim, id: 11 })
      .mockResolvedValueOnce(null);
    repository.processEnrollment
      .mockResolvedValueOnce({ completed: true })
      .mockResolvedValueOnce({ waiting: true })
      .mockResolvedValueOnce({ failed: true })
      .mockResolvedValueOnce({ skipped: true, stale: true });

    await expect(service.run()).resolves.toEqual({
      claimed: 4, completed: 1, failed: 1, skipped: 1, waiting: 1,
    });
  });

  it('runs one targeted enrollment and preserves bounded lease options', async () => {
    repository.claimEnrollment.mockResolvedValue(claim);
    repository.processEnrollment.mockResolvedValue({ completed: true });
    await expect(service.run({ batchSize: 100, leaseSeconds: 45, enrollmentId: 8 }))
      .resolves.toMatchObject({ claimed: 1, completed: 1 });
    expect(repository.claimEnrollment).toHaveBeenCalledTimes(1);
    expect(repository.claimEnrollment).toHaveBeenCalledWith(45, 8);
  });
});
