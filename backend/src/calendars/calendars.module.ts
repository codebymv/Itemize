import { Module } from '@nestjs/common';
import { CalendarsRepository } from './calendars.repository';
import { CalendarsResolver } from './calendars.resolver';
import { CalendarsService } from './calendars.service';

@Module({
  providers: [CalendarsRepository, CalendarsService, CalendarsResolver],
  exports: [CalendarsService],
})
export class CalendarsModule {}
