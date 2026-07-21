import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Campaign } from '../campaigns/campaign.types';

@ObjectType()
export class CampaignSendResult {
  @Field(() => Campaign)
  campaign: Campaign;

  @Field(() => Int)
  recipientCount: number;

  @Field(() => Int)
  deliveryJobId: number;

  @Field()
  replayed: boolean;

  @Field()
  message: string;
}
