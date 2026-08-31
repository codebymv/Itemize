import { Module } from '@nestjs/common';
import { CalendarIntegrationsModule } from '../calendar-integrations/calendar-integrations.module';
import { InvoiceSettingsModule } from '../invoice-settings/invoice-settings.module';
import { SocialModule } from '../social/social.module';
import { IntegrationOverviewResolver } from './integration-overview.resolver';
import { IntegrationOverviewService } from './integration-overview.service';

@Module({
  imports: [CalendarIntegrationsModule, SocialModule, InvoiceSettingsModule],
  providers: [IntegrationOverviewService, IntegrationOverviewResolver],
})
export class IntegrationOverviewModule {}
