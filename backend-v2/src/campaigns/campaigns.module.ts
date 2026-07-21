import { Module } from '@nestjs/common';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsResolver } from './campaigns.resolver';
import { CampaignsService } from './campaigns.service';

@Module({
  providers: [CampaignsRepository, CampaignsService, CampaignsResolver],
  exports: [CampaignsRepository, CampaignsService],
})
export class CampaignsModule {}
