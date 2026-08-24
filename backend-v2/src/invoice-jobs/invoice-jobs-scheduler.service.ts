/**
 * NestJS replacement for the legacy daily 6:00 AM invoice cron
 * (backend/src/scheduler.js '0 6 * * *', America/New_York). Default-off
 * behind INVOICE_NEST_JOBS_ENABLED until cutover; the jobs are
 * idempotent daily batches, so a same-day overlap with the legacy cron
 * is harmless but only one runtime should own the cadence.
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  DAILY_JOB_TIMEZONE,
  msUntilNextDailyHour,
} from '../common/daily-schedule';
import { booleanEnvironmentValue } from '../common/runtime-config';
import { InvoiceJobsService } from './invoice-jobs.service';

const DAILY_HOUR = 6;

@Injectable()
export class InvoiceJobsSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(InvoiceJobsSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly jobs: InvoiceJobsService) {}

  onApplicationBootstrap(): void {
    if (!booleanEnvironmentValue(process.env, 'INVOICE_NEST_JOBS_ENABLED')) {
      return;
    }
    this.logger.log(
      `NestJS invoice jobs run daily at ${DAILY_HOUR}:00 ${DAILY_JOB_TIMEZONE()}`,
    );
    this.schedule();
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.jobs.runAll();
        this.logger.log('Scheduled invoice jobs completed');
      } catch (error) {
        this.logger.error(
          'Scheduled invoice jobs failed',
          error instanceof Error ? error.stack : String(error),
        );
      } finally {
        this.schedule();
      }
    }, msUntilNextDailyHour(DAILY_HOUR, DAILY_JOB_TIMEZONE()));
    this.timer.unref();
  }
}
