import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { SocialService } from './social.service';

@Injectable()
export class SocialMessageDeliverySchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(
    SocialMessageDeliverySchedulerService.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly social: SocialService) {}

  onApplicationBootstrap(): void {
    if (process.env.SOCIAL_MESSAGE_DELIVERY_SCHEDULER_ENABLED !== 'true') return;
    const interval = boundedInteger(
      process.env.SOCIAL_MESSAGE_DELIVERY_INTERVAL_MS,
      5_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`Social message delivery runs every ${interval}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  runCycle() {
    return this.social.runDue(
      boundedInteger(
        process.env.SOCIAL_MESSAGE_DELIVERY_BATCH_SIZE,
        100,
        1,
        500,
      ),
    );
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.attempted) {
        this.logger.log(`Social delivery cycle ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(
        'Social delivery cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
