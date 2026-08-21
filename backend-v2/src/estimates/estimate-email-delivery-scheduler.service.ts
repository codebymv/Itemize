import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { EstimateEmailDeliveryService } from './estimate-email-delivery.service';

@Injectable()
export class EstimateEmailDeliverySchedulerService
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EstimateEmailDeliverySchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deliveries: EstimateEmailDeliveryService) {}

  onApplicationBootstrap(): void {
    if (process.env.ESTIMATE_EMAIL_DELIVERY_SCHEDULER_ENABLED !== 'true' || this.timer) {
      return;
    }
    const intervalMs = boundedInteger(
      process.env.ESTIMATE_EMAIL_DELIVERY_SCHEDULER_INTERVAL_MS,
      15_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`Estimate email scheduler owns queued delivery every ${intervalMs}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  runCycle(): Promise<{ attempted: number; sent: number }> {
    return this.deliveries.runDue(boundedInteger(
      process.env.ESTIMATE_EMAIL_DELIVERY_BATCH_SIZE,
      25,
      1,
      100,
    ));
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping estimate email delivery cycle');
      return;
    }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.attempted > 0) {
        this.logger.log(`Estimate email delivery cycle ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        'Estimate email delivery cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
