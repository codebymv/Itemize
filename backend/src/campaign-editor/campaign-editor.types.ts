import { Field, ObjectType } from '@nestjs/graphql';
import { Campaign, CampaignAudiencePreview } from '../campaigns/campaign.types';
import { EmailTemplate } from '../email-templates/email-template.types';
import { Segment, SegmentFilterOptions } from '../segments/segment.types';

@ObjectType()
export class CampaignEditorBootstrap {
  @Field(() => Campaign, { nullable: true })
  campaign: Campaign | null;

  @Field(() => [EmailTemplate])
  templates: EmailTemplate[];

  @Field(() => [Segment])
  segments: Segment[];

  @Field(() => SegmentFilterOptions)
  filterOptions: SegmentFilterOptions;

  @Field(() => CampaignAudiencePreview, { nullable: true })
  audiencePreview: CampaignAudiencePreview | null;
}
