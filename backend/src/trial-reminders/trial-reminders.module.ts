import { Module } from '@nestjs/common';
import {
  ResendTrialReminderEmailProvider,
  TRIAL_REMINDER_EMAIL_PROVIDER,
  TrialRemindersService,
} from './trial-reminders.service';
import { TrialRemindersSchedulerService } from './trial-reminders-scheduler.service';
import { TrialRemindersRepository } from './trial-reminders.repository';

@Module({
  providers: [
    TrialRemindersService,
    TrialRemindersRepository,
    TrialRemindersSchedulerService,
    {
      provide: TRIAL_REMINDER_EMAIL_PROVIDER,
      useClass: ResendTrialReminderEmailProvider,
    },
  ],
})
export class TrialRemindersModule {}
