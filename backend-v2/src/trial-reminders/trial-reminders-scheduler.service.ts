/**
 * NestJS replacement for the legacy daily 9:00 AM trial reminder cron
 * (backend/src/jobs/trialReminderCron.js '0 9 * * *'). Default-off
 * behind TRIAL_REMINDER_NEST_JOBS_ENABLED. Durable delivery claims and
 * a stable provider idempotency key make overlap and lease recovery safe.
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
import { TrialRemindersService } from './trial-reminders.service';

const DAILY_HOUR = 9;

@Injectable()
export class TrialRemindersSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TrialRemindersSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly reminders: TrialRemindersService) {}

  onApplicationBootstrap(): void {
    if (
      !booleanEnvironmentValue(
        process.env,
        'TRIAL_REMINDER_NEST_JOBS_ENABLED',
      )
    ) {
      return;
    }
    this.logger.log(
      `NestJS trial reminders run daily at ${DAILY_HOUR}:00 ${DAILY_JOB_TIMEZONE()}`,
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
        const summary = await this.reminders.sendTrialReminders();
        if (summary.found > 0) {
          this.logger.log(
            `Trial reminder job completed ${JSON.stringify(summary)}`,
          );
        }
      } catch (error) {
        this.logger.error(
          'Trial reminder job failed',
          error instanceof Error ? error.stack : String(error),
        );
      } finally {
        this.schedule();
      }
    }, msUntilNextDailyHour(DAILY_HOUR, DAILY_JOB_TIMEZONE()));
    this.timer.unref();
  }
}
