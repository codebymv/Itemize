import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { SegmentsModule } from '../segments/segments.module';
import { CampaignEditorResolver } from './campaign-editor.resolver';
import { CampaignEditorService } from './campaign-editor.service';

@Module({
  imports: [CampaignsModule, EmailTemplatesModule, SegmentsModule],
  providers: [CampaignEditorService, CampaignEditorResolver],
})
export class CampaignEditorModule {}
