import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum CampaignTestEmailDeliveryStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  RETRY = 'retry',
  SENT = 'sent',
  DEAD_LETTER = 'dead_letter',
  RECONCILIATION_REQUIRED = 'reconciliation_required',
}

registerEnumType(CampaignTestEmailDeliveryStatus, {
  name: 'CampaignTestEmailDeliveryStatus',
});

@ObjectType()
export class CampaignTestEmailResult {
  @Field()
  success: boolean;

  @Field()
  replayed: boolean;

  @Field(() => Int)
  deliveryId: number;

  @Field(() => CampaignTestEmailDeliveryStatus)
  status: CampaignTestEmailDeliveryStatus;

  @Field(() => String, { nullable: true })
  emailId: string | null;

  @Field()
  message: string;
}
