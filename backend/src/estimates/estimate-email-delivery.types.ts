import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum EstimateEmailDeliveryStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  RETRY = 'retry',
  SENT = 'sent',
  DEAD_LETTER = 'dead_letter',
  RECONCILIATION_REQUIRED = 'reconciliation_required',
}

registerEnumType(EstimateEmailDeliveryStatus, {
  name: 'EstimateEmailDeliveryStatus',
});

@ObjectType()
export class EstimateSendResult {
  @Field()
  success: boolean;

  @Field()
  emailSent: boolean;

  @Field()
  replayed: boolean;

  @Field(() => Int)
  deliveryId: number;

  @Field(() => EstimateEmailDeliveryStatus)
  status: EstimateEmailDeliveryStatus;
}
