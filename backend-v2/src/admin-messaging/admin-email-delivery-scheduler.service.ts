import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { boundedInteger } from '../workflow-jobs/workflow-job.util';
import { AdminEmailDeliveryService } from './admin-email-delivery.service';

@Injectable()
export class AdminEmailDeliverySchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AdminEmailDeliverySchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly delivery: AdminEmailDeliveryService) {}

  onApplicationBootstrap(): void {
    if (process.env.ADMIN_EMAIL_DELIVERY_SCHEDULER_ENABLED !== 'true') return;
    const interval = boundedInteger(process.env.ADMIN_EMAIL_DELIVERY_INTERVAL_MS, 30_000, 1_000, 3_600_000);
    this.logger.log(`Admin email delivery scheduler runs every ${interval}ms`);
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onApplicationShutdown(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  runCycle(): Promise<{ attempted: number; sent: number }> {
    return this.delivery.runDue(boundedInteger(process.env.ADMIN_EMAIL_DELIVERY_BATCH_SIZE, 100, 1, 500));
  }

  private async tick(): Promise<void> {
    if (this.running) { this.logger.warn('Skipping overlapping admin email delivery cycle'); return; }
    this.running = true;
    try {
      const result = await this.runCycle();
      if (result.attempted) this.logger.log(`Admin email delivery cycle ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error('Admin email delivery cycle failed', error instanceof Error ? error.stack : String(error));
    } finally { this.running = false; }
  }
}
