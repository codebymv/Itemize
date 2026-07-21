import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CampaignRecipientFilterInput {
  @Field(() => String, { nullable: true })
  status?: string;
}
