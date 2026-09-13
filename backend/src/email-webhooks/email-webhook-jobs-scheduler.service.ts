/**
 * Explicitly owned email webhook reconciliation cadence. Each new runtime
 * reconsiders known receipt evidence before draining the normal leased queue.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { boundedInteger, EmailWebhookJobsService } from './email-webhook-jobs.service';

@Injectable()
export class EmailWebhookJobsSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailWebhookJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private recoveredKnownReceipts = false;

  constructor(private readonly jobs: EmailWebhookJobsService) {}

  onApplicationBootstrap(): void {
    if (process.env.EMAIL_WEBHOOK_NEST_JOBS_ENABLED !== 'true') return;

    const intervalMs = boundedInteger(
      process.env.EMAIL_WEBHOOK_NEST_JOBS_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(
      `NestJS email webhook reconciliation worker runs every ${intervalMs}ms`,
    );
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping email webhook reconciliation cycle');
      return;
    }
    this.running = true;
    try {
      if (!this.recoveredKnownReceipts) {
        const recovered = await this.jobs.recoverKnownReceipts();
        this.recoveredKnownReceipts = true;
        if (recovered > 0) this.logger.log(`Reconsidering ${recovered} known email receipts after startup`);
      }
      const summary = await this.jobs.run({
        batchSize: process.env.EMAIL_WEBHOOK_JOB_BATCH_SIZE,
        leaseSeconds: process.env.EMAIL_WEBHOOK_JOB_LEASE_SECONDS,
        maxAttempts: process.env.EMAIL_WEBHOOK_JOB_MAX_ATTEMPTS,
      });
      if (summary.claimed > 0) {
        this.logger.log(
          `Email webhook reconciliation jobs completed ${JSON.stringify(summary)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Email webhook reconciliation cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
