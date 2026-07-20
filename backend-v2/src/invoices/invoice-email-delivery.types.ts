import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum InvoiceEmailDeliveryStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  RETRY = 'retry',
  SENT = 'sent',
  DEAD_LETTER = 'dead_letter',
  RECONCILIATION_REQUIRED = 'reconciliation_required',
}

registerEnumType(InvoiceEmailDeliveryStatus, {
  name: 'InvoiceEmailDeliveryStatus',
});

@ObjectType()
export class InvoiceSendResult {
  @Field()
  success: boolean;

  @Field()
  emailSent: boolean;

  @Field()
  replayed: boolean;

  @Field(() => Int)
  deliveryId: number;

  @Field(() => InvoiceEmailDeliveryStatus)
  status: InvoiceEmailDeliveryStatus;
}
