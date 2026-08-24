import { Module } from '@nestjs/common';
import { CalendarOAuthModule } from '../calendar-oauth/calendar-oauth.module';
import { CalendarSyncJobsService } from './calendar-sync-jobs.service';
import { CalendarSyncJobsSchedulerService } from './calendar-sync-jobs-scheduler.service';
import {
  GOOGLE_CALENDAR_EVENTS_PROVIDER,
  SdkGoogleCalendarEventsProvider,
} from './google-calendar-events.provider';

@Module({
  imports: [CalendarOAuthModule],
  providers: [
    CalendarSyncJobsService,
    CalendarSyncJobsSchedulerService,
    {
      provide: GOOGLE_CALENDAR_EVENTS_PROVIDER,
      useClass: SdkGoogleCalendarEventsProvider,
    },
  ],
})
export class CalendarSyncJobsModule {}
