import { Injectable } from '@nestjs/common';
import { CalendarIntegrationsService } from '../calendar-integrations/calendar-integrations.service';
import { InvoiceSettingsService } from '../invoice-settings/invoice-settings.service';
import { SocialService } from '../social/social.service';
import { IntegrationOverview } from './integration-overview.types';

type OptionalRead<T> =
  | { available: true; value: T }
  | { available: false; value: null };

const optionalRead = async <T>(request: Promise<T>): Promise<OptionalRead<T>> => {
  try {
    return { available: true, value: await request };
  } catch {
    return { available: false, value: null };
  }
};

@Injectable()
export class IntegrationOverviewService {
  constructor(
    private readonly calendars: CalendarIntegrationsService,
    private readonly social: SocialService,
    private readonly invoiceSettings: InvoiceSettingsService,
  ) {}

  async get(
    organizationId: number,
    userId: number,
  ): Promise<IntegrationOverview> {
    const [calendarConnections, facebook, paymentSettings] = await Promise.all([
      this.calendars.list(organizationId, userId),
      optionalRead(this.social.channels(organizationId, 'facebook')),
      optionalRead(this.invoiceSettings.get(organizationId)),
    ]);
    const activeFacebook = facebook.available
      ? facebook.value.find((channel) => channel.isActive) ?? null
      : null;

    return {
      calendarConnections,
      facebookChannel: activeFacebook
        ? { id: activeFacebook.id, name: activeFacebook.name }
        : null,
      facebookStatusAvailable: facebook.available,
      stripeConnected: paymentSettings.available
        ? paymentSettings.value.stripeConnected
        : false,
      stripeStatusAvailable: paymentSettings.available,
    };
  }
}
