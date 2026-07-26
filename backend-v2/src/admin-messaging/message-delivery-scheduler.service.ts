import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { MessageDeliveryService } from './message-delivery.service';

@Injectable()
export class MessageDeliverySchedulerService
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MessageDeliverySchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly delivery: MessageDeliveryService) {}

  onApplicationBootstrap(): void {
    if (process.env.MESSAGE_DELIVERY_SCHEDULER_ENABLED === 'false') return;
    const interval = boundedInteger(
      process.env.MESSAGE_DELIVERY_INTERVAL_MS,
      5_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`Message delivery scheduler runs every ${interval}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  runCycle() {
    return this.delivery.runDue(
      boundedInteger(process.env.MESSAGE_DELIVERY_BATCH_SIZE, 100, 1, 500),
    );
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping overlapping message delivery cycle');
      return;
    }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.attempted) {
        this.logger.log(`Message delivery cycle ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        'Message delivery cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
