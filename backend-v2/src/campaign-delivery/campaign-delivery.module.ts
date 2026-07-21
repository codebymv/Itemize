import { Module } from '@nestjs/common';
import { CampaignRecipientsRepository } from './campaign-recipients.repository';
import { CampaignRecipientsResolver } from './campaign-recipients.resolver';
import { CampaignRecipientsService } from './campaign-recipients.service';
import { CampaignDeliveryResolver } from './campaign-delivery.resolver';
import {
  CAMPAIGN_TEST_EMAIL_PROVIDER,
  ResendCampaignTestEmailProvider,
} from './campaign-test-email.provider';
import { CampaignTestEmailRepository } from './campaign-test-email.repository';
import { CampaignTestEmailService } from './campaign-test-email.service';

@Module({
  providers: [
    CampaignRecipientsRepository,
    CampaignRecipientsService,
    CampaignRecipientsResolver,
    CampaignTestEmailRepository,
    CampaignTestEmailService,
    CampaignDeliveryResolver,
    ResendCampaignTestEmailProvider,
    {
      provide: CAMPAIGN_TEST_EMAIL_PROVIDER,
      useExisting: ResendCampaignTestEmailProvider,
    },
  ],
  exports: [CampaignTestEmailService],
})
export class CampaignDeliveryModule {}
