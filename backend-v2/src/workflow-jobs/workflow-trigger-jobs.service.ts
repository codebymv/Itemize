import { Injectable } from '@nestjs/common';
import { boundedInteger } from './workflow-job.util';
import { WorkflowTriggerJobsRepository } from './workflow-trigger-jobs.repository';

export type WorkflowScheduleRun = { claimed: number; queued: number };
export type WorkflowTriggerRun = {
  claimed: number;
  completed: number;
  deadLetter: number;
  enrolled: number;
  retry: number;
  stale: number;
};

@Injectable()
export class WorkflowTriggerJobsService {
  constructor(private readonly repository: WorkflowTriggerJobsRepository) {}

  async runScheduled(options: { batchSize?: number; workflowId?: number | null } = {}): Promise<WorkflowScheduleRun> {
    const batchSize = boundedInteger(options.batchSize, 25, 1, 100);
    const summary: WorkflowScheduleRun = { claimed: 0, queued: 0 };
    for (let index = 0; index < batchSize; index += 1) {
      const claimed = await this.repository.claimScheduled(options.workflowId ?? null);
      if (!claimed) break;
      summary.claimed += 1;
      summary.queued += 1;
      if (options.workflowId) break;
    }
    return summary;
  }

  async runTriggers(options: {
    batchSize?: number;
    leaseSeconds?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    maximumDelayMs?: number;
    triggerId?: number | null;
  } = {}): Promise<WorkflowTriggerRun> {
    const batchSize = boundedInteger(options.batchSize, 25, 1, 100);
    const leaseSeconds = boundedInteger(options.leaseSeconds, 300, 1, 3600);
    const maxAttempts = boundedInteger(options.maxAttempts, 5, 1, 20);
    const baseDelayMs = boundedInteger(options.baseDelayMs, 60_000, 1, 86_400_000);
    const maximumDelayMs = Math.max(baseDelayMs,
      boundedInteger(options.maximumDelayMs, 86_400_000, 1, 86_400_000));
    const summary: WorkflowTriggerRun = {
      claimed: 0, completed: 0, deadLetter: 0, enrolled: 0, retry: 0, stale: 0,
    };
    for (let index = 0; index < batchSize; index += 1) {
      const claim = await this.repository.claimTrigger(leaseSeconds, options.triggerId ?? null);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const result = await this.repository.processTrigger(claim);
        if (result.persisted) {
          summary.completed += 1;
          summary.enrolled += result.enrolled;
        } else {
          summary.stale += 1;
        }
      } catch (error) {
        const outcome = await this.repository.failTrigger(claim, error, {
          maxAttempts, baseDelayMs, maximumDelayMs,
        });
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else if (outcome === 'retry') summary.retry += 1;
        else summary.stale += 1;
      }
      if (options.triggerId) break;
    }
    return summary;
  }
}
