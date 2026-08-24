import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CalendarOAuthController } from './calendar-oauth.controller';
import { CalendarOAuthGuard } from './calendar-oauth.guard';
import { CalendarOAuthRepository } from './calendar-oauth.repository';
import {
  GOOGLE_CALENDAR_OAUTH_PROVIDER,
  SdkGoogleCalendarOAuthProvider,
} from './google-calendar-oauth.provider';

@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [CalendarOAuthController],
  providers: [
    CalendarOAuthGuard,
    CalendarOAuthRepository,
    {
      provide: GOOGLE_CALENDAR_OAUTH_PROVIDER,
      useClass: SdkGoogleCalendarOAuthProvider,
    },
  ],
  exports: [GOOGLE_CALENDAR_OAUTH_PROVIDER],
})
export class CalendarOAuthModule {}
