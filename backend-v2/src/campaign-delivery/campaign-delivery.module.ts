import { Module } from '@nestjs/common';
import { CampaignRecipientsRepository } from './campaign-recipients.repository';
import { CampaignRecipientsResolver } from './campaign-recipients.resolver';
import { CampaignRecipientsService } from './campaign-recipients.service';

@Module({
  providers: [CampaignRecipientsRepository, CampaignRecipientsService, CampaignRecipientsResolver],
})
export class CampaignDeliveryModule {}
