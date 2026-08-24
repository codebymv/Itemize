import { Injectable } from '@nestjs/common';
import { boundedInteger } from './workflow-job.util';
import { WorkflowEnrollmentJobsRepository } from './workflow-enrollment-jobs.repository';

export type WorkflowEnrollmentRun = {
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
  waiting: number;
};

@Injectable()
export class WorkflowEnrollmentJobsService {
  constructor(private readonly repository: WorkflowEnrollmentJobsRepository) {}

  async run(options: { batchSize?: number; leaseSeconds?: number; enrollmentId?: number | null } = {}): Promise<WorkflowEnrollmentRun> {
    const batchSize = boundedInteger(options.batchSize, 50, 1, 100);
    const leaseSeconds = boundedInteger(options.leaseSeconds, 300, 1, 3600);
    const summary: WorkflowEnrollmentRun = { claimed: 0, completed: 0, failed: 0, skipped: 0, waiting: 0 };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await this.repository.claimEnrollment(leaseSeconds, options.enrollmentId ?? null);
      if (!claim) break;
      summary.claimed += 1;
      const result = await this.repository.processEnrollment(claim);
      if (result.completed) summary.completed += 1;
      else if (result.waiting) summary.waiting += 1;
      else if (result.skipped || result.stale) summary.skipped += 1;
      else summary.failed += 1;
      if (options.enrollmentId) break;
    }
    return summary;
  }
}
