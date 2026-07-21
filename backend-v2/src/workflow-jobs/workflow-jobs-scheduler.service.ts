import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WorkflowEnrollmentJobsService, WorkflowEnrollmentRun } from './workflow-enrollment-jobs.service';
import { boundedInteger } from './workflow-job.util';
import { WorkflowSideEffectJobsService, WorkflowSideEffectRun } from './workflow-side-effect-jobs.service';
import {
  WorkflowScheduleRun,
  WorkflowTriggerJobsService,
  WorkflowTriggerRun,
} from './workflow-trigger-jobs.service';

export type WorkflowJobCycleRun = {
  scheduled: WorkflowScheduleRun;
  trigger: WorkflowTriggerRun;
  enrollment: WorkflowEnrollmentRun;
  sideEffect: WorkflowSideEffectRun;
};

@Injectable()
export class WorkflowJobsSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkflowJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly triggers: WorkflowTriggerJobsService,
    private readonly enrollments: WorkflowEnrollmentJobsService,
    private readonly sideEffects: WorkflowSideEffectJobsService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.WORKFLOW_NEST_SCHEDULER_ENABLED !== 'true') return;

    const intervalMs = boundedInteger(
      process.env.WORKFLOW_NEST_SCHEDULER_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`NestJS workflow scheduler owns the ordered cycle every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runCycle(): Promise<WorkflowJobCycleRun> {
    const scheduled = await this.triggers.runScheduled({
      batchSize: Number(process.env.WORKFLOW_SCHEDULE_BATCH_SIZE || 25),
    });
    const trigger = await this.triggers.runTriggers({
      batchSize: Number(process.env.WORKFLOW_TRIGGER_BATCH_SIZE || 25),
      leaseSeconds: Number(process.env.WORKFLOW_TRIGGER_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.WORKFLOW_TRIGGER_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.WORKFLOW_TRIGGER_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(process.env.WORKFLOW_TRIGGER_RETRY_MAX_MS || 86_400_000),
    });
    const enrollment = await this.enrollments.run({
      batchSize: Number(process.env.WORKFLOW_ENROLLMENT_BATCH_SIZE || 50),
      leaseSeconds: Number(process.env.WORKFLOW_ENROLLMENT_LEASE_SECONDS || 300),
    });
    const sideEffect = await this.sideEffects.run({
      batchSize: Number(process.env.WORKFLOW_SIDE_EFFECT_BATCH_SIZE || 25),
      leaseSeconds: Number(process.env.WORKFLOW_SIDE_EFFECT_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.WORKFLOW_SIDE_EFFECT_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.WORKFLOW_SIDE_EFFECT_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(process.env.WORKFLOW_SIDE_EFFECT_RETRY_MAX_MS || 86_400_000),
      webhookTimeoutMs: Number(process.env.WORKFLOW_WEBHOOK_TIMEOUT_MS || 10_000),
    });
    return { scheduled, trigger, enrollment, sideEffect };
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping workflow job cycle');
      return;
    }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (Object.values(result).some((phase) => phase.claimed > 0)) {
        this.logger.log(`Workflow job cycle completed ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        'Workflow job cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
