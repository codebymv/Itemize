import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
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
import { CampaignSendRepository } from './campaign-send.repository';
import { CampaignSendService } from './campaign-send.service';

@Module({
  imports: [CampaignsModule],
  providers: [
    CampaignRecipientsRepository,
    CampaignRecipientsService,
    CampaignRecipientsResolver,
    CampaignTestEmailRepository,
    CampaignTestEmailService,
    CampaignDeliveryResolver,
    CampaignSendRepository,
    CampaignSendService,
    ResendCampaignTestEmailProvider,
    {
      provide: CAMPAIGN_TEST_EMAIL_PROVIDER,
      useExisting: ResendCampaignTestEmailProvider,
    },
  ],
  exports: [CampaignTestEmailService, CampaignSendService],
})
export class CampaignDeliveryModule {}
