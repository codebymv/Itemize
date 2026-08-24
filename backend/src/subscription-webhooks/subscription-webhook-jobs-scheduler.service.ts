/**
 * NestJS replacement for the legacy per-minute subscription webhook
 * cron (backend/src/scheduler.js): notification and reconciliation
 * queues run together each tick, like the legacy Promise.all pairing.
 * Default-off behind SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED until
 * cutover; only one runtime should own the cadence.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  boundedInteger,
  SubscriptionWebhookJobsService,
} from './subscription-webhook-jobs.service';

@Injectable()
export class SubscriptionWebhookJobsSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(
    SubscriptionWebhookJobsSchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly jobs: SubscriptionWebhookJobsService) {}

  onApplicationBootstrap(): void {
    if (process.env.SUBSCRIPTION_WEBHOOK_NEST_JOBS_ENABLED !== 'true') return;

    const intervalMs = boundedInteger(
      process.env.SUBSCRIPTION_WEBHOOK_NEST_JOBS_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(
      `NestJS subscription webhook workers run every ${intervalMs}ms`,
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
      this.logger.warn('Skipping overlapping subscription webhook job cycle');
      return;
    }
    this.running = true;
    try {
      const [notificationSummary, reconciliationSummary] = await Promise.all([
        this.jobs.runNotifications(),
        this.jobs.runReconciliation(),
      ]);
      if (notificationSummary.claimed > 0) {
        this.logger.log(
          `Subscription webhook notification jobs completed ${JSON.stringify(notificationSummary)}`,
        );
      }
      if (reconciliationSummary.claimed > 0) {
        this.logger.log(
          `Subscription webhook reconciliation jobs completed ${JSON.stringify(reconciliationSummary)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Subscription webhook job cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
