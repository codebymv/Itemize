import { Module } from '@nestjs/common';
import { CalendarIntegrationsRepository } from './calendar-integrations.repository';
import { CalendarIntegrationsResolver } from './calendar-integrations.resolver';
import { CalendarIntegrationsService } from './calendar-integrations.service';

@Module({
  providers: [
    CalendarIntegrationsRepository,
    CalendarIntegrationsService,
    CalendarIntegrationsResolver,
  ],
  exports: [CalendarIntegrationsService],
})
export class CalendarIntegrationsModule {}
