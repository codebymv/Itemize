/**
 * NestJS replacement for the legacy per-minute calendar sync cron
 * (backend/src/scheduler.js, CALENDAR_SYNC_JOBS_ENABLED). Default-off
 * behind CALENDAR_SYNC_NEST_JOBS_ENABLED until cutover; the claim
 * fence (worker id + attempt count + lease) makes an overlap window
 * safe, but only one runtime should own the cadence.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  boundedInteger,
  CalendarSyncJobsService,
} from './calendar-sync-jobs.service';

@Injectable()
export class CalendarSyncJobsSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(CalendarSyncJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly jobs: CalendarSyncJobsService) {}

  onApplicationBootstrap(): void {
    if (process.env.CALENDAR_SYNC_NEST_JOBS_ENABLED !== 'true') return;
    const intervalMs = boundedInteger(
      process.env.CALENDAR_SYNC_NEST_JOBS_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
    );
    this.logger.log(`NestJS calendar sync worker runs every ${intervalMs}ms`);
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
      this.logger.warn('Skipping overlapping calendar sync cycle');
      return;
    }
    this.running = true;
    try {
      const summary = await this.jobs.run({
        batchSize: process.env.CALENDAR_SYNC_JOB_BATCH_SIZE,
        leaseSeconds: process.env.CALENDAR_SYNC_JOB_LEASE_SECONDS,
        maxAttempts: process.env.CALENDAR_SYNC_JOB_MAX_ATTEMPTS,
      });
      if (summary.claimed > 0) {
        this.logger.log(
          `Calendar sync jobs completed ${JSON.stringify(summary)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Calendar sync cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
