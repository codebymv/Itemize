import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  SignatureCompletionJobsService,
  SignatureCompletionRun,
} from '../public-signing/signature-completion-jobs.service';
import {
  SignatureDeliveryJobsService,
  SignatureDeliveryRun,
} from '../signature-delivery/signature-delivery-jobs.service';
import {
  boundedInteger,
  optionalPositiveInteger,
} from '../workflow-jobs/workflow-job.util';

export type SignatureJobsRun = {
  completion: SignatureCompletionRun;
  delivery: SignatureDeliveryRun;
};

@Injectable()
export class SignatureJobsSchedulerService
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SignatureJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly completions: SignatureCompletionJobsService,
    private readonly deliveries: SignatureDeliveryJobsService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.SIGNATURE_JOBS_SCHEDULER_ENABLED !== 'true') return;
    const intervalMs = boundedInteger(
      process.env.SIGNATURE_JOBS_SCHEDULER_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`Signature job scheduler owns delivery and completion every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runCycle(): Promise<SignatureJobsRun> {
    const completion = await this.completions.run({
      batchSize: Number(process.env.SIGNATURE_COMPLETION_BATCH_SIZE || 10),
      leaseSeconds: Number(process.env.SIGNATURE_COMPLETION_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.SIGNATURE_COMPLETION_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.SIGNATURE_COMPLETION_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(
        process.env.SIGNATURE_COMPLETION_RETRY_MAX_MS || 86_400_000,
      ),
      jobId: optionalPositiveInteger(process.env.SIGNATURE_COMPLETION_JOB_ID),
    });
    const delivery = await this.deliveries.run({
      batchSize: Number(process.env.SIGNATURE_DELIVERY_BATCH_SIZE || 25),
      reminderBatchSize: Number(process.env.SIGNATURE_REMINDER_BATCH_SIZE || 25),
      leaseSeconds: Number(process.env.SIGNATURE_DELIVERY_LEASE_SECONDS || 300),
      maxAttempts: Number(process.env.SIGNATURE_DELIVERY_MAX_ATTEMPTS || 5),
      baseDelayMs: Number(process.env.SIGNATURE_DELIVERY_RETRY_BASE_MS || 60_000),
      maximumDelayMs: Number(
        process.env.SIGNATURE_DELIVERY_RETRY_MAX_MS || 86_400_000,
      ),
      outboxId: optionalPositiveInteger(process.env.SIGNATURE_DELIVERY_ID),
    });
    return { completion, delivery };
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping signature job cycle');
      return;
    }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.completion.claimed > 0 || result.delivery.claimed > 0) {
        this.logger.log(`Signature job cycle ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        'Signature job cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
