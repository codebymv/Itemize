import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { ReputationRequestDeliveryService } from './reputation-request-delivery.service';

@Injectable()
export class ReputationRequestDeliverySchedulerService
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReputationRequestDeliverySchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deliveries: ReputationRequestDeliveryService) {}

  onApplicationBootstrap(): void {
    if (process.env.REPUTATION_REQUEST_DELIVERY_SCHEDULER_ENABLED !== 'true') return;
    const intervalMs = boundedInteger(
      process.env.REPUTATION_REQUEST_DELIVERY_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`Review-request delivery scheduler runs every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runCycle(): Promise<{ attempted: number; sent: number }> {
    return this.deliveries.runDue(boundedInteger(
      process.env.REPUTATION_REQUEST_DELIVERY_BATCH_SIZE,
      100,
      1,
      500,
    ));
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping review-request delivery cycle');
      return;
    }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.attempted > 0) this.logger.log(`Review-request delivery cycle ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(
        'Review-request delivery cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally { this.running = false; }
  }
}
